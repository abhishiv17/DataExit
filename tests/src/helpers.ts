import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FixtureGmail } from "@dataexit/google";
import { createContext, silentLogger, type Config, type Ctx } from "@dataexit/runtime";

export const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
export const FIXTURES = join(ROOT, "tests", "fixtures");
export const START = new Date("2026-11-24T10:00:00+05:30");

export interface TestCtx extends Ctx {
  clock: { now: Date; advance(ms: number): void };
  fixture: FixtureGmail;
}

export async function testContext(config: Partial<Config> = {}): Promise<TestCtx> {
  const dataDir = mkdtempSync(join(tmpdir(), "dataexit-test-"));
  const clock = {
    now: new Date(START),
    advance(ms: number) {
      this.now = new Date(this.now.getTime() + ms);
    },
  };
  const now = () => clock.now;
  const fixture = new FixtureGmail(join(FIXTURES, "inbox.json"), join(dataDir, "fixture-mailbox.json"), now);
  const ctx = await createContext("test", {
    env: {},
    config: {
      rootDir: ROOT,
      dataDir,
      directoryCsvPath: join(FIXTURES, "companies.csv"),
      gmailBackend: "fixture",
      sendMode: "live",
      sandboxEmail: null,
      databaseUrl: null,
      ...config,
    },
    gmail: fixture,
    now,
    log: silentLogger,
  });
  return Object.assign(ctx, { clock, fixture });
}

export const MIN = 60_000;
export const DAY = 24 * 60 * MIN;
