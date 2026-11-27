import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Directory } from "@dataexit/directory";
import {
  FixtureCalendar,
  FixtureGmail,
  GoogleCalendar,
  GoogleGmail,
  loadGoogleClient,
  type CalendarBackend,
  type GmailBackend,
} from "@dataexit/google";
import type { AuditInput } from "@dataexit/shared";
import { FileStore, pgClient, SqlStore, type SqlClient, type Store } from "@dataexit/store";
import { loadConfig, ConfigError, type Config } from "./config.js";
import { createLogger, type Logger } from "./logger.js";

/** Sliding one-hour window counter (send rate limit). */
export class HourlyLimit {
  private stamps: number[] = [];
  constructor(private readonly max: number) {}
  tryTake(now: number): boolean {
    this.stamps = this.stamps.filter((t) => now - t < 3_600_000);
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }
}

export interface Ctx {
  config: Config;
  userId: string;
  store: Store;
  directory: Directory;
  gmail: GmailBackend;
  calendar: CalendarBackend;
  log: Logger;
  now(): Date;
  sendLimit: HourlyLimit;
  close(): Promise<void>;
}

/** Appends an event to the user's hash-chained audit log. */
export function audit(ctx: Ctx, input: AuditInput) {
  return ctx.store.appendAudit(ctx.userId, input, ctx.now());
}

export interface ContextOverrides {
  config?: Partial<Config>;
  env?: NodeJS.ProcessEnv;
  store?: Store;
  directory?: Directory;
  gmail?: GmailBackend;
  calendar?: CalendarBackend;
  log?: Logger;
  now?: () => Date;
}

export async function createContext(name: string, o: ContextOverrides = {}): Promise<Ctx> {
  const config = loadConfig(o.env ?? process.env, o.config);
  const log = o.log ?? createLogger(config.logLevel, name);
  // DATAEXIT_NOW starts the clock at a given moment and lets it run, so a demo can jump ahead to
  // overdue deadlines while undo windows still elapse in real time.
  const offset = config.fixedNow ? Date.parse(config.fixedNow) - Date.now() : 0;
  const now = o.now ?? (config.fixedNow ? () => new Date(Date.now() + offset) : () => new Date());

  let sql: SqlClient | null = null;
  let store = o.store;
  if (!store) {
    if (config.databaseUrl) {
      sql = pgClient(config.databaseUrl);
      const s = new SqlStore(sql);
      await s.migrate(readFileSync(join(config.rootDir, "db", "schema.sql"), "utf8"));
      store = s;
    } else {
      store = new FileStore(join(config.dataDir, "store.json"));
    }
  }

  let directory = o.directory;
  if (!directory) {
    directory =
      config.directorySource === "postgres" && sql ? await Directory.fromSql(sql) : Directory.fromCsv(config.directoryCsvPath);
    if (directory.issues.length) log.warn("directory data issues", { count: directory.issues.length, first: directory.issues.slice(0, 3) });
  }

  let gmail = o.gmail;
  let calendar = o.calendar;
  if (!gmail || !calendar) {
    if (config.gmailBackend === "google") {
      const auth = loadGoogleClient(config.google);
      if (!auth) throw new ConfigError("GMAIL_BACKEND=google but no Google token. Run `npm run auth:google` first.");
      gmail ??= new GoogleGmail(auth);
      calendar ??= new GoogleCalendar(auth);
    } else {
      gmail ??= new FixtureGmail(config.gmailFixturePath, join(config.dataDir, "fixture-mailbox.json"), now);
      calendar ??= new FixtureCalendar(join(config.dataDir, "fixture-calendar.json"));
    }
  }

  log.info("context ready", {
    store: store.kind,
    gmail: gmail.kind,
    send_mode: config.sendMode,
    companies: directory.size,
    fixed_clock: config.fixedNow,
  });

  return {
    config,
    userId: config.userId,
    store,
    directory,
    gmail,
    calendar,
    log,
    now,
    sendLimit: new HourlyLimit(config.sendLimitPerHour),
    close: () => store!.close(),
  };
}
