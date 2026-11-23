#!/usr/bin/env node
// npm run db:seed-directory — loads data/companies.csv into the Postgres companies table (upsert).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Directory } from "@dataexit/directory";
import { loadConfig } from "@dataexit/runtime";
import { pgClient, SqlStore } from "@dataexit/store";

const config = loadConfig();
if (!config.databaseUrl) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}
const db = pgClient(config.databaseUrl);
await new SqlStore(db).migrate(readFileSync(join(config.rootDir, "db", "schema.sql"), "utf8"));
const dir = Directory.fromCsv(config.directoryCsvPath);
await db.transaction(async (tx) => {
  for (const c of dir.all()) {
    await tx.query(
      `INSERT INTO companies (id, legal_name, brands, domains, sms_sender_ids, grievance_email, data_categories, sensitivity,
                              retention_rule, sector, grievance_verified, grievance_source, support_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET legal_name=EXCLUDED.legal_name, brands=EXCLUDED.brands, domains=EXCLUDED.domains,
         sms_sender_ids=EXCLUDED.sms_sender_ids, grievance_email=EXCLUDED.grievance_email, data_categories=EXCLUDED.data_categories,
         sensitivity=EXCLUDED.sensitivity, retention_rule=EXCLUDED.retention_rule, sector=EXCLUDED.sector,
         grievance_verified=EXCLUDED.grievance_verified, grievance_source=EXCLUDED.grievance_source, support_email=EXCLUDED.support_email`,
      [c.id, c.legal_name, c.brands, c.domains, c.sms_sender_ids, c.grievance_email, c.data_categories, c.sensitivity,
        c.retention_rule, c.sector ?? null, c.grievance_verified ?? false, c.grievance_source ?? null, c.support_email ?? null],
    );
  }
});
console.log(`Loaded ${dir.size} companies into Postgres (${dir.issues.length} data issues; run npm run directory:check).`);
await db.close();
