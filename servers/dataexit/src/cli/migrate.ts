#!/usr/bin/env node
// npm run db:migrate — applies db/schema.sql to DATABASE_URL (idempotent).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "@dataexit/runtime";
import { pgClient, SqlStore } from "@dataexit/store";

const config = loadConfig();
if (!config.databaseUrl) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const store = new SqlStore(pgClient(config.databaseUrl));
await store.migrate(readFileSync(join(config.rootDir, "db", "schema.sql"), "utf8"));
console.log("Schema applied.");
await store.close();
