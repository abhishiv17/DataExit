import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  DEFAULT_SETTINGS,
  type AuditEvent,
  type AuditInput,
  type DataRequest,
  type Footprint,
  type UserSettings,
} from "@dataexit/shared";
import { buildAuditEvent } from "@dataexit/policy";
import type { Store } from "./types.js";

interface UserDoc {
  settings: UserSettings;
  footprints: Record<string, Footprint>;
  requests: Record<string, DataRequest>;
  audit: AuditEvent[];
}
interface Doc {
  version: 1;
  users: Record<string, UserDoc>;
}

/**
 * Single JSON file, for local development and tests. Operations are serialised within one process.
 * Use the all-in-one server (one process) with this store; use Postgres when running servers separately.
 */
export class FileStore implements Store {
  readonly kind = "file" as const;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  private read(): Doc {
    if (!existsSync(this.path)) return { version: 1, users: {} };
    return JSON.parse(readFileSync(this.path, "utf8")) as Doc;
  }

  private write(doc: Doc): void {
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(doc, null, 2), { mode: 0o600 });
    // OneDrive/antivirus can briefly lock the target on Windows; retry a few times.
    for (let attempt = 0; ; attempt++) {
      try {
        renameSync(tmp, this.path);
        return;
      } catch (e) {
        if (attempt >= 5) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
      }
    }
  }

  private run<T>(fn: (doc: Doc) => T, mutate: boolean): Promise<T> {
    const next = this.queue.then(() => {
      const doc = this.read();
      const out = fn(doc);
      if (mutate) this.write(doc);
      return out;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private user(doc: Doc, userId: string): UserDoc {
    return (doc.users[userId] ??= { settings: { ...DEFAULT_SETTINGS }, footprints: {}, requests: {}, audit: [] });
  }

  listFootprints(userId: string) {
    return this.run((d) => Object.values(d.users[userId]?.footprints ?? {}), false);
  }

  upsertFootprints(userId: string, footprints: Footprint[]) {
    return this.run((d) => {
      const u = this.user(d, userId);
      for (const f of footprints) u.footprints[f.company_id] = f;
    }, true);
  }

  getRequest(userId: string, id: string) {
    return this.run((d) => d.users[userId]?.requests[id] ?? null, false);
  }

  listRequests(userId: string) {
    return this.run(
      (d) => Object.values(d.users[userId]?.requests ?? {}).sort((a, b) => a.created_at.localeCompare(b.created_at)),
      false,
    );
  }

  saveRequest(req: DataRequest) {
    return this.run((d) => {
      this.user(d, req.user_id).requests[req.id] = req;
    }, true);
  }

  appendAudit(userId: string, input: AuditInput, now: Date) {
    return this.run((d) => {
      const u = this.user(d, userId);
      const event = buildAuditEvent(userId, u.audit.at(-1) ?? null, input, now);
      u.audit.push(event);
      return event;
    }, true);
  }

  listAudit(userId: string) {
    return this.run((d) => [...(d.users[userId]?.audit ?? [])], false);
  }

  getSettings(userId: string) {
    return this.run((d) => ({ ...DEFAULT_SETTINGS, ...d.users[userId]?.settings }), false);
  }

  saveSettings(userId: string, patch: Partial<UserSettings>) {
    return this.run((d) => {
      const u = this.user(d, userId);
      u.settings = { ...DEFAULT_SETTINGS, ...u.settings, ...patch };
      return { ...u.settings };
    }, true);
  }

  deleteUser(userId: string) {
    return this.run((d) => {
      const u = d.users[userId];
      const counts = {
        footprints: u ? Object.keys(u.footprints).length : 0,
        requests: u ? Object.keys(u.requests).length : 0,
        audit_events: u ? u.audit.length : 0,
      };
      delete d.users[userId];
      return counts;
    }, true);
  }

  async close() {
    await this.queue;
  }
}
