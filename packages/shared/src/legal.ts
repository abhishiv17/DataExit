import type { Enforceability, RequestType } from "./types.js";

/** DPDP Rules Phase III: data-principal rights come into force. */
export const RIGHTS_IN_FORCE_FROM = new Date("2027-05-13T00:00:00+05:30");

/** Companies may take up to 90 days to respond. */
export const RESPONSE_DEADLINE_DAYS = 90;
/** Grievance officer response period. [verify against the DPDP Rules] */
export const GRIEVANCE_RESPONSE_DAYS = 90;
/** A polite reminder may go out this many days after sending. */
export const REMINDER_AFTER_DAYS = 30;

export const DAY_MS = 24 * 60 * 60 * 1000;

export function enforceabilityOn(date: Date): Enforceability {
  return date >= RIGHTS_IN_FORCE_FROM ? "statutory" : "policy_based";
}

/** DPDP sections cited per request type. All [verify] until checked against the gazette. */
export const SECTION_REFS: Record<RequestType, string> = {
  stop_marketing: "Section 6(4) [verify]",
  withdraw_consent: "Section 6(4) [verify]",
  access: "Section 11 [verify]",
  correct: "Section 12 [verify]",
  erase: "Sections 8(7) and 12 [verify]",
  restrict: "Section 6(4) [verify]",
};

export const RETENTION_LABELS: Record<string, string> = {
  RBI_KYC: "RBI Master Direction on KYC",
  PMLA: "Prevention of Money-laundering Act, 2002",
  SEBI: "SEBI record-keeping regulations",
  TELECOM: "Telecom licence conditions (DoT)",
  INSURANCE: "IRDAI record-keeping regulations",
  MEDICAL: "Medical records rules",
  TAX: "Income-tax and GST record-keeping rules",
};

/**
 * Retention rules under which erasure becomes a restrict-use request.
 * TAX is deliberately absent: an e-commerce company keeping invoices can still erase the account.
 */
export const RESTRICT_INSTEAD_OF_ERASE: ReadonlySet<string> = new Set([
  "RBI_KYC",
  "PMLA",
  "SEBI",
  "TELECOM",
  "INSURANCE",
  "MEDICAL",
]);

export function retentionLabel(rule: string | null): string | null {
  if (!rule) return null;
  return rule
    .split(/[|,]/)
    .map((r) => RETENTION_LABELS[r.trim()] ?? r.trim())
    .join(", ");
}

export function retentionConvertsErase(rule: string | null): boolean {
  return !!rule && rule.split(/[|,]/).some((r) => RESTRICT_INSTEAD_OF_ERASE.has(r.trim()));
}

export function adjustForRetention(
  type: RequestType,
  rule: string | null,
): { type: RequestType; adjusted: boolean; reason: string | null } {
  if (type === "erase" && retentionConvertsErase(rule)) {
    return {
      type: "restrict",
      adjusted: true,
      reason: `Must retain data under ${retentionLabel(rule)}; asking to restrict use instead of erasing.`,
    };
  }
  return { type, adjusted: false, reason: null };
}
