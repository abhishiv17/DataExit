import type { Company, DataCategory, Sector } from "./types.js";

// Sensitivity ladder, low (1) to high (12). See docs/legal/data-taxonomy.md.
export const SENSITIVITY: Record<DataCategory, number> = {
  contact: 1,
  device: 2,
  behavioural: 3,
  transaction: 4,
  location: 5,
  communications: 6,
  financial: 7,
  government_id: 8,
  health: 9,
  biometric: 10,
  children: 11,
  inferred_profile: 12,
};

/** Highest level among the company's categories (0 if unknown). */
export function sensitivityScore(categories: DataCategory[]): number {
  return categories.reduce((max, c) => Math.max(max, SENSITIVITY[c]), 0);
}

/** "High-sensitivity" for the wow moment: Aadhaar/PAN/KYC or bank details or above. */
export function isHighSensitivity(company: Pick<Company, "dataCategories">): boolean {
  return company.dataCategories.some(
    (c) => c === "financial" || SENSITIVITY[c] >= SENSITIVITY.government_id,
  );
}

/** Estimated data profile by sector, used when a company is not in the directory. */
export const SECTOR_DEFAULT_CATEGORIES: Record<Sector, DataCategory[]> = {
  ecommerce: ["contact", "transaction", "location", "behavioural"],
  food_delivery: ["contact", "transaction", "location", "behavioural"],
  social: ["contact", "communications", "behavioural", "inferred_profile"],
  bank: ["contact", "financial", "government_id", "transaction"],
  fintech: ["contact", "financial", "government_id", "transaction", "device"],
  broker: ["contact", "financial", "government_id", "transaction"],
  insurance: ["contact", "financial", "government_id", "health"],
  telecom: ["contact", "government_id", "location", "communications"],
  health: ["contact", "health"],
  travel: ["contact", "government_id", "location", "transaction"],
  edtech: ["contact", "children", "behavioural"],
  gaming: ["contact", "children", "behavioural", "financial"],
  utility: ["device", "behavioural"],
  government: ["contact", "government_id"],
  other: ["contact"],
};

/** Days since last activity after which an account is considered dormant. */
export const DORMANT_AFTER_DAYS = 365;
