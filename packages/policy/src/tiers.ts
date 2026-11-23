import type { Company, RequestType, Tier } from "@dataexit/shared";

// See docs/architecture/approval-and-audit.md.

const BASE_TIER: Record<RequestType, Tier> = {
  stop_marketing: "auto",
  withdraw_consent: "one_tap",
  access: "one_tap",
  correct: "one_tap",
  restrict: "one_tap",
  erase: "full_review",
};

const HIGH_RISK_SECTORS: ReadonlySet<string> = new Set(["bank", "insurance", "government", "health"]);
const HIGH_RISK_RULES: ReadonlySet<string> = new Set(["RBI_KYC", "INSURANCE", "MEDICAL"]);

/** Banks, insurers, government and health: every request to them gets full review. */
export function isHighRiskCompany(c: Pick<Company, "sector" | "retention_rule"> | null | undefined): boolean {
  if (!c) return false;
  if (c.sector && HIGH_RISK_SECTORS.has(c.sector)) return true;
  return !!c.retention_rule && c.retention_rule.split(/[|,]/).some((r) => HIGH_RISK_RULES.has(r.trim()));
}

export function classifyTier(type: RequestType, company?: Pick<Company, "sector" | "retention_rule"> | null): Tier {
  return isHighRiskCompany(company) ? "full_review" : BASE_TIER[type];
}
