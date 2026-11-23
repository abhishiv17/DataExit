import type { LegalBasis, RequestType, RetentionDuty } from "./types.js";

/** DPDP Rules Phase III: data-principal rights come into force. */
export const RIGHTS_IN_FORCE_FROM = new Date("2027-05-13T00:00:00+05:30");

/** Companies may take up to 90 days to respond. */
export const RESPONSE_DEADLINE_DAYS = 90;

export function legalBasisOn(date: Date): LegalBasis {
  return date >= RIGHTS_IN_FORCE_FROM ? "statutory" : "policy_based";
}

/** Section references. All [verify] until checked against the gazette. */
export const SECTION_REFS: Record<RequestType, string> = {
  stop_marketing: "Section 6 [verify]",
  withdraw_consent: "Section 6 [verify]",
  access: "Section 11 [verify]",
  correct: "Section 12 [verify]",
  erase: "Sections 8(7) and 12 [verify]",
  restrict_use: "Section 6 [verify]",
};

export const RETENTION_LABELS: Record<RetentionDuty, string> = {
  rbi_kyc: "RBI KYC Directions",
  pmla: "Prevention of Money Laundering Act, 2002",
  telecom_licence: "Telecom licence conditions",
  tax: "Tax record-keeping rules",
  medical: "Medical records rules",
};

/** If a retention duty applies, erasure becomes restrict-use. */
export function adjustForRetention(type: RequestType, duties: RetentionDuty[]): RequestType {
  return type === "erase" && duties.length > 0 ? "restrict_use" : type;
}
