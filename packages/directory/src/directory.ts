import { readFileSync } from "node:fs";
import {
  companySensitivity,
  isDataCategory,
  RETENTION_LABELS,
  SECTOR_DEFAULT_CATEGORIES,
  type Company,
  type Sector,
  type Sensitivity,
} from "@dataexit/shared";
import type { SqlClient } from "@dataexit/store";
import { parseCsvObjects } from "./csv.js";
import { normalizeSmsSender, registrableDomain } from "./domains.js";

const list = (v: string | undefined) =>
  (v ?? "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);

const SECTORS = new Set(Object.keys(SECTOR_DEFAULT_CATEGORIES));

export interface DirectoryIssue {
  row: number;
  id: string;
  problem: string;
}

/** Converts CSV rows into Companies, collecting data-quality issues instead of failing. */
export function companiesFromRows(rows: Record<string, string>[]): { companies: Company[]; issues: DirectoryIssue[] } {
  const issues: DirectoryIssue[] = [];
  const seen = new Set<string>();
  const companies: Company[] = [];
  rows.forEach((r, i) => {
    const row = i + 2; // header is row 1
    const id = (r.id ?? "").toLowerCase();
    const issue = (problem: string) => issues.push({ row, id, problem });
    if (!id) return issue("missing id");
    if (seen.has(id)) return issue("duplicate id");
    seen.add(id);
    if (!r.legal_name) issue("missing legal_name");
    const domains = list(r.domains).map((d) => d.toLowerCase());
    if (!domains.length) issue("no domains: discovery can never match this company");

    const sector = (r.sector || "other") as Sector;
    if (!SECTORS.has(sector)) issue(`unknown sector "${r.sector}"`);
    let categories = list(r.data_categories);
    for (const c of categories) if (!isDataCategory(c)) issue(`unknown data category "${c}"`);
    if (!categories.length) categories = [...(SECTOR_DEFAULT_CATEGORIES[sector] ?? ["contact"])];
    for (const rule of list(r.retention_rule)) if (!(rule in RETENTION_LABELS)) issue(`unknown retention rule "${rule}"`);

    const sens = r.sensitivity as Sensitivity;
    const sensitivity = sens === "low" || sens === "med" || sens === "high" ? sens : companySensitivity(categories);
    if (r.sensitivity && sensitivity !== r.sensitivity) issue(`invalid sensitivity "${r.sensitivity}"`);
    const grievance = r.grievance_email || null;
    if (grievance && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(grievance)) issue(`invalid grievance_email "${grievance}"`);
    if (!grievance && !r.support_email) issue("no grievance_email or support_email: requests need a manual recipient");

    companies.push({
      id,
      legal_name: r.legal_name || id,
      brands: list(r.brands),
      domains,
      sms_sender_ids: list(r.sms_sender_ids).map(normalizeSmsSender),
      grievance_email: grievance,
      data_categories: categories,
      sensitivity,
      retention_rule: list(r.retention_rule).join("|") || null,
      sector,
      grievance_verified: r.grievance_verified === "true",
      grievance_source: r.grievance_source || null,
      support_email: r.support_email || null,
    });
  });
  return { companies, issues };
}

export class Directory {
  private readonly byId = new Map<string, Company>();
  private readonly byDomainMap = new Map<string, Company>();
  private readonly bySms = new Map<string, Company>();

  constructor(
    companies: Company[],
    readonly issues: DirectoryIssue[] = [],
  ) {
    for (const c of companies) {
      this.byId.set(c.id, c);
      for (const d of c.domains) this.byDomainMap.set(d, c);
      for (const s of c.sms_sender_ids) this.bySms.set(s, c);
    }
  }

  static fromCsv(path: string): Directory {
    const { companies, issues } = companiesFromRows(parseCsvObjects(readFileSync(path, "utf8")));
    return new Directory(companies, issues);
  }

  static async fromSql(db: Pick<SqlClient, "query">): Promise<Directory> {
    const { rows } = await db.query<Company>("SELECT * FROM companies ORDER BY id");
    return new Directory(rows);
  }

  get size(): number {
    return this.byId.size;
  }

  all(): Company[] {
    return [...this.byId.values()];
  }

  get(id: string): Company | undefined {
    return this.byId.get(id);
  }

  /** Exact domain, then each parent domain: "mailer.swiggy.in" → "swiggy.in". */
  byDomain(domain: string): Company | undefined {
    const labels = domain.toLowerCase().split(".");
    for (let i = 0; i < labels.length - 1; i++) {
      const hit = this.byDomainMap.get(labels.slice(i).join("."));
      if (hit) return hit;
    }
    return undefined;
  }

  bySmsSender(sender: string): Company | undefined {
    return this.bySms.get(normalizeSmsSender(sender));
  }

  /** Legal name or brand, case-insensitive exact match. */
  byName(name: string): Company | undefined {
    const q = name.trim().toLowerCase();
    return this.all().find((c) => c.legal_name.toLowerCase() === q || c.brands.some((b) => b.toLowerCase() === q));
  }

  /** Display name: first brand, else legal name. */
  static displayName(c: Company): string {
    return c.brands[0] ?? c.legal_name;
  }

  /** Footprint key for a sender domain: directory id, or "unknown:<registrable domain>". */
  keyForDomain(domain: string): { key: string; company: Company | null; domain: string } {
    const company = this.byDomain(domain) ?? null;
    const reg = registrableDomain(domain);
    return { key: company ? company.id : `unknown:${reg}`, company, domain: reg };
  }
}
