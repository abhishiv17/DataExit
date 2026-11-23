import { readFileSync } from "node:fs";
import type { Company } from "@dataexit/shared";

const DATA_FILE = new URL("../data/companies.json", import.meta.url);

export class Directory {
  private byId = new Map<string, Company>();
  private byDomain = new Map<string, Company>();

  constructor(companies: Company[]) {
    for (const c of companies) {
      this.byId.set(c.id, c);
      for (const d of c.domains) this.byDomain.set(d.toLowerCase(), c);
    }
  }

  static load(): Directory {
    return new Directory(JSON.parse(readFileSync(DATA_FILE, "utf8")) as Company[]);
  }

  get(id: string): Company | undefined {
    return this.byId.get(id);
  }

  /** Matches a domain or any parent domain (mailer.swiggy.in → swiggy.in). */
  byDomainName(domain: string): Company | undefined {
    const parts = domain.toLowerCase().split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      const hit = this.byDomain.get(parts.slice(i).join("."));
      if (hit) return hit;
    }
    return undefined;
  }

  byName(name: string): Company | undefined {
    const q = name.trim().toLowerCase();
    return [...this.byId.values()].find((c) => c.name.toLowerCase() === q);
  }
}
