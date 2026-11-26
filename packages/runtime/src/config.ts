import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type SendMode = "dry_run" | "sandbox" | "live";

export interface Config {
  rootDir: string;
  dataDir: string;
  userId: string;
  databaseUrl: string | null;
  directorySource: "csv" | "postgres";
  directoryCsvPath: string;
  gmailBackend: "google" | "fixture";
  gmailFixturePath: string;
  google: { clientId: string; clientSecret: string; tokenPath: string; redirectPort: number };
  /** dry_run: nothing sent. sandbox: every email goes to sandboxEmail. live: real recipients. */
  sendMode: SendMode;
  sandboxEmail: string | null;
  undoWindowMs: number;
  sendLimitPerHour: number;
  discoveryMaxMessages: number;
  discoveryLookbackYears: number;
  /** Fixed clock for demos ("time travel" past deadlines). ISO date-time or null. */
  fixedNow: string | null;
  logLevel: "debug" | "info" | "warn" | "error";
}

/** Repo root: the nearest ancestor whose package.json is named "dataexit". */
export function findRoot(start = dirname(fileURLToPath(import.meta.url))): string {
  let dir = start;
  for (;;) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, "utf8")).name === "dataexit") return dir;
      } catch {
        /* keep looking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

/** Loads <root>/.env without overriding variables already set (e.g. by the MCP client config). */
export function loadDotEnv(rootDir: string): void {
  const file = join(rootDir, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<Config> = {}): Config {
  const rootDir = overrides.rootDir ?? env.DATAEXIT_ROOT ?? findRoot();
  if (env === process.env) loadDotEnv(rootDir);
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(rootDir, p));
  const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

  const dataDir = abs(env.DATAEXIT_DATA_DIR || ".data");
  const google = {
    clientId: env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
    tokenPath: abs(env.GOOGLE_TOKEN_PATH || join(dataDir, "google-token.json")),
    redirectPort: num(env.GOOGLE_REDIRECT_PORT, 53682),
  };
  const hasGoogle = !!google.clientId && existsSync(google.tokenPath);
  const gmailBackend = (env.GMAIL_BACKEND as Config["gmailBackend"]) || (hasGoogle ? "google" : "fixture");
  if (gmailBackend !== "google" && gmailBackend !== "fixture") throw new ConfigError(`GMAIL_BACKEND must be google or fixture`);

  const sandboxEmail = env.SANDBOX_EMAIL || null;
  const sendMode = (env.SEND_MODE as SendMode) || (sandboxEmail ? "sandbox" : "dry_run");
  if (!["dry_run", "sandbox", "live"].includes(sendMode)) throw new ConfigError("SEND_MODE must be dry_run, sandbox or live");
  if (sendMode === "sandbox" && !sandboxEmail) throw new ConfigError("SEND_MODE=sandbox needs SANDBOX_EMAIL");

  const databaseUrl = env.DATABASE_URL || null;
  const directorySource = (env.DIRECTORY_SOURCE as Config["directorySource"]) || "csv";
  if (directorySource === "postgres" && !databaseUrl) throw new ConfigError("DIRECTORY_SOURCE=postgres needs DATABASE_URL");

  return {
    rootDir,
    dataDir,
    userId: env.DATAEXIT_USER_ID || "local-user",
    databaseUrl,
    directorySource,
    directoryCsvPath: abs(env.DIRECTORY_CSV || "servers/company-directory/data/companies.csv"),
    gmailBackend,
    gmailFixturePath: abs(env.GMAIL_FIXTURE || "demo/seed-inbox/messages.json"),
    google,
    sendMode,
    sandboxEmail,
    undoWindowMs: num(env.UNDO_WINDOW_SECONDS, 600) * 1000,
    sendLimitPerHour: num(env.SEND_LIMIT_PER_HOUR, 40),
    discoveryMaxMessages: num(env.DISCOVERY_MAX_MESSAGES, 3000),
    discoveryLookbackYears: num(env.DISCOVERY_LOOKBACK_YEARS, 0), // 0 = whole mailbox
    fixedNow: env.DATAEXIT_NOW || null,
    logLevel: (env.LOG_LEVEL as Config["logLevel"]) || "info",
    ...overrides,
  };
}
