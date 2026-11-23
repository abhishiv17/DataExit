import type { DataCategory, Sector, Sensitivity } from "./types.js";

// See docs/legal/data-taxonomy.md and docs/contract.md (prioritisation).

export const CATEGORY_LEVEL: Record<DataCategory, Sensitivity> = {
  contact: "low",
  device: "low",
  behavioural: "med",
  transaction: "med",
  location: "med",
  communications: "med",
  inferred: "med",
  financial: "high",
  gov_id: "high",
  health: "high",
  biometric: "high",
  children: "high",
};

/** Weight of the most sensitive category, the base of the 0-100 score. */
const CATEGORY_WEIGHT: Record<DataCategory, number> = {
  contact: 15,
  device: 15,
  behavioural: 30,
  transaction: 35,
  location: 40,
  communications: 40,
  inferred: 40,
  financial: 60,
  gov_id: 65,
  health: 65,
  biometric: 70,
  children: 70,
};

/** Base score for a sender that is not in the directory. */
const UNKNOWN_COMPANY_BASE = 10;

export function isDataCategory(c: string): c is DataCategory {
  return c in CATEGORY_LEVEL;
}

const LEVEL_RANK: Record<Sensitivity, number> = { low: 0, med: 1, high: 2 };

export function companySensitivity(categories: readonly string[]): Sensitivity {
  let best: Sensitivity = "low";
  for (const c of categories) {
    if (isDataCategory(c) && LEVEL_RANK[CATEGORY_LEVEL[c]] > LEVEL_RANK[best]) best = CATEGORY_LEVEL[c];
  }
  return best;
}

export function holdsIdOrBankData(categories: readonly string[]): boolean {
  return categories.includes("gov_id") || categories.includes("financial");
}

export function monthsSince(iso: string, now: Date): number {
  const then = new Date(iso);
  return Math.max(
    0,
    (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth()) - (now.getDate() < then.getDate() ? 1 : 0),
  );
}

/**
 * 0-100 risk score: most sensitive category (up to 70) + breadth (up to 10) + dormancy (up to 20).
 * Dormant accounts holding sensitive data rank first.
 */
export function sensitivityScore(input: {
  data_categories: readonly string[];
  last_interaction: string;
  matched: boolean;
  now: Date;
}): number {
  const known = input.data_categories.filter(isDataCategory);
  const base = input.matched && known.length
    ? Math.max(...known.map((c) => CATEGORY_WEIGHT[c]))
    : UNKNOWN_COMPANY_BASE;
  const breadth = Math.min(10, 2 * Math.max(0, known.length - 1));
  const months = monthsSince(input.last_interaction, input.now);
  const dormancy = months >= 36 ? 20 : months >= 12 ? 12 : months >= 6 ? 5 : 0;
  return Math.min(100, base + breadth + dormancy);
}

/** Estimated data profile by sector, for directory rows that leave data_categories empty. */
export const SECTOR_DEFAULT_CATEGORIES: Record<Sector, DataCategory[]> = {
  ecommerce: ["contact", "transaction", "location", "behavioural"],
  food_delivery: ["contact", "transaction", "location", "behavioural"],
  quick_commerce: ["contact", "transaction", "location", "behavioural"],
  social: ["contact", "communications", "behavioural", "inferred"],
  bank: ["contact", "financial", "gov_id", "transaction"],
  fintech: ["contact", "financial", "gov_id", "transaction", "device"],
  broker: ["contact", "financial", "gov_id", "transaction"],
  insurance: ["contact", "financial", "gov_id", "health"],
  telecom: ["contact", "gov_id", "location", "communications"],
  health: ["contact", "health"],
  travel: ["contact", "gov_id", "location", "transaction"],
  edtech: ["contact", "children", "behavioural"],
  gaming: ["contact", "children", "behavioural", "financial"],
  utility: ["device", "behavioural"],
  entertainment: ["contact", "behavioural", "transaction"],
  government: ["contact", "gov_id"],
  other: ["contact"],
};
