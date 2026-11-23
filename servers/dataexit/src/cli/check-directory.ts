#!/usr/bin/env node
// npm run directory:check — validates data/companies.csv and prints data-quality issues.
import { Directory } from "@dataexit/directory";
import { loadConfig } from "@dataexit/runtime";

const config = loadConfig();
const dir = Directory.fromCsv(config.directoryCsvPath);
const all = dir.all();
console.log(`${config.directoryCsvPath}`);
console.log(`companies: ${all.length}`);
console.log(`with grievance email: ${all.filter((c) => c.grievance_email).length}`);
console.log(`verified contacts: ${all.filter((c) => c.grievance_verified).length}`);
console.log(`with retention rule: ${all.filter((c) => c.retention_rule).length}`);

const domainOwners = new Map<string, string>();
const clashes: string[] = [];
for (const c of all) {
  for (const d of c.domains) {
    const prev = domainOwners.get(d);
    if (prev && prev !== c.id) clashes.push(`domain ${d} is listed for both ${prev} and ${c.id}`);
    domainOwners.set(d, c.id);
  }
}
const problems = [...dir.issues.map((i) => `row ${i.row} (${i.id}): ${i.problem}`), ...clashes];
if (problems.length) {
  console.log(`\n${problems.length} issue(s):`);
  for (const p of problems) console.log(`  - ${p}`);
}
const fatal = dir.issues.some((i) => /missing id|duplicate id/.test(i.problem)) || clashes.length > 0;
process.exit(fatal ? 1 : 0);
