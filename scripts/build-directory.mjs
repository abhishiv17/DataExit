#!/usr/bin/env node
// Builds servers/company-directory/data/companies.json from companies.csv.
// The CSV is the editable source of truth (Person B owns it).
// Run: npm run directory:build
//
// Columns: id,name,domains,sector,data_categories,retention_duties,
//          grievance_email,grievance_url,officer_name,verified,source,last_checked,privacy_policy_url
// List columns use ";" as separator. Empty data_categories => sector default.

import { readFileSync, writeFileSync } from "node:fs";
import { SECTOR_DEFAULT_CATEGORIES, SENSITIVITY } from "../packages/shared/dist/ui/index.js";

const DIR = new URL("../servers/company-directory/data/", import.meta.url);
const SECTORS = new Set(Object.keys(SECTOR_DEFAULT_CATEGORIES));
const CATEGORIES = new Set(Object.keys(SENSITIVITY));
const RETENTION = new Set(["rbi_kyc", "pmla", "telecom_licence", "tax", "medical"]);

/** Minimal RFC-4180 CSV parser (handles quoted fields with commas and quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const list = (s) => (s ?? "").split(";").map((x) => x.trim()).filter(Boolean);
const orNull = (s) => (s && s.trim() ? s.trim() : null);

const [header, ...rows] = parseCsv(readFileSync(new URL("companies.csv", DIR), "utf8"));
const errors = [];
const ids = new Set();
const domains = new Map();

const companies = rows.map((cells, n) => {
  const r = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  const line = n + 2;
  const where = `line ${line} (${r.id})`;

  if (!/^[a-z0-9][a-z0-9-]*$/.test(r.id)) errors.push(`${where}: bad id`);
  if (ids.has(r.id)) errors.push(`${where}: duplicate id`);
  ids.add(r.id);

  if (!SECTORS.has(r.sector)) errors.push(`${where}: unknown sector "${r.sector}"`);
  const cats = list(r.data_categories);
  const dataCategories = cats.length ? cats : [...(SECTOR_DEFAULT_CATEGORIES[r.sector] ?? [])];
  for (const c of dataCategories) if (!CATEGORIES.has(c)) errors.push(`${where}: unknown category "${c}"`);
  const retentionDuties = list(r.retention_duties);
  for (const d of retentionDuties) if (!RETENTION.has(d)) errors.push(`${where}: unknown retention duty "${d}"`);

  const doms = list(r.domains).map((d) => d.toLowerCase());
  if (!doms.length) errors.push(`${where}: no domains`);
  for (const d of doms) {
    if (domains.has(d)) errors.push(`${where}: domain ${d} already used by ${domains.get(d)}`);
    domains.set(d, r.id);
  }

  const email = orNull(r.grievance_email);
  const verified = r.verified.trim().toLowerCase() === "true";
  if (verified && !orNull(r.source)) errors.push(`${where}: verified contact needs a source`);

  return {
    id: r.id,
    name: r.name.trim(),
    domains: doms,
    sector: r.sector,
    dataCategories,
    retentionDuties,
    grievance: {
      email,
      url: orNull(r.grievance_url),
      officerName: orNull(r.officer_name),
      verified,
      source: orNull(r.source),
      lastChecked: orNull(r.last_checked),
    },
    privacyPolicyUrl: orNull(r.privacy_policy_url),
  };
});

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

writeFileSync(new URL("companies.json", DIR), JSON.stringify(companies, null, 2) + "\n");
const bySector = {};
for (const c of companies) bySector[c.sector] = (bySector[c.sector] ?? 0) + 1;
console.log(`Wrote ${companies.length} companies`, bySector);
console.log(`Verified grievance contacts: ${companies.filter((c) => c.grievance.verified).length}`);
