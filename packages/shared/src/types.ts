// Domain model. See docs/architecture/data-model.md.

export type Sector =
  | "ecommerce"
  | "food_delivery"
  | "social"
  | "bank"
  | "fintech"
  | "broker"
  | "insurance"
  | "telecom"
  | "health"
  | "travel"
  | "edtech"
  | "gaming"
  | "utility"
  | "government"
  | "other";

export type DataCategory =
  | "contact"
  | "device"
  | "behavioural"
  | "transaction"
  | "location"
  | "communications"
  | "financial"
  | "government_id"
  | "health"
  | "biometric"
  | "children"
  | "inferred_profile";

export type RetentionDuty =
  | "rbi_kyc"
  | "pmla"
  | "telecom_licence"
  | "tax"
  | "medical";

export interface GrievanceContact {
  email: string | null;
  url: string | null;
  officerName: string | null;
  verified: boolean;
  source: string | null;
  lastChecked: string | null; // ISO date
}

export interface Company {
  id: string; // slug
  name: string;
  domains: string[];
  sector: Sector;
  dataCategories: DataCategory[];
  retentionDuties: RetentionDuty[];
  grievance: GrievanceContact;
  privacyPolicyUrl: string | null;
}

export type DiscoverySource = "gmail" | "sms" | "google_signin" | "manual";
export type FootprintStatus = "active" | "dormant" | "request_open" | "closed";

export interface Footprint {
  id: string;
  userId: string;
  companyId: string;
  firstSeen: string;
  lastSeen: string;
  discoveredVia: DiscoverySource[];
  sourceRefs: string[]; // message IDs only, never bodies
  sensitivity: number; // 1..12
  status: FootprintStatus;
}

// ---- Contract shapes consumed by the UI (see docs/contract.md) ----

export type EvidenceKind = "signup" | "welcome" | "otp" | "receipt" | "newsletter" | "reply";

/** Gmail metadata for the message a footprint was found from. Never a body. */
export interface EvidenceRef {
  messageId: string;
  date: string; // ISO
  from: string;
  subject: string;
  kind: EvidenceKind;
}

/** A footprint joined with its company, as returned by discover_footprint. */
export interface FootprintView {
  footprintId: string;
  company: Pick<Company, "id" | "name" | "sector" | "dataCategories" | "retentionDuties" | "domains"> & {
    grievanceVerified: boolean;
  };
  firstSeen: string;
  lastSeen: string;
  discoveredVia: DiscoverySource[];
  sensitivity: number; // 1..12
  highSensitivity: boolean;
  status: FootprintStatus;
  evidence: EvidenceRef[];
}

export interface FootprintResult {
  userId: string;
  scannedAt: string;
  footprints: FootprintView[];
  unmatchedDomains: string[];
}

export type RequestType =
  | "stop_marketing"
  | "withdraw_consent"
  | "access"
  | "correct"
  | "erase"
  | "restrict_use";

export type ApprovalTier = "low" | "medium" | "high";
export type Language = "en" | "hi";
export type LegalBasis = "statutory" | "policy_based";

export type RequestStatus =
  | "draft"
  | "awaiting_approval"
  | "in_undo_window"
  | "sent"
  | "acknowledged"
  | "id_requested"
  | "confirmed"
  | "rejected"
  | "overdue"
  | "escalated_go"
  | "escalated_dpb"
  | "closed"
  | "cancelled";

export interface DataRequest {
  id: string;
  userId: string;
  footprintId: string;
  companyId: string;
  type: RequestType;
  tier: ApprovalTier;
  language: Language;
  legalBasis: LegalBasis;
  status: RequestStatus;
  subject: string;
  body: string;
  recipient: string | null;
  sentAt: string | null;
  deadlineAt: string | null;
  gmailMessageId: string | null;
  calendarEventId: string | null;
}

export type ReplyClass =
  | "confirmed"
  | "id_requested"
  | "rejected_retention"
  | "acknowledged"
  | "other";

export type AuditActor = "user" | "agent" | "system" | `helper:${string}`;
export type AuditAction =
  | "propose"
  | "approve"
  | "reject"
  | "undo"
  | "send"
  | "status_change"
  | "export"
  | "delete_account";

export interface AuditEvent {
  userId: string;
  seq: number;
  at: string;
  actor: AuditActor;
  action: AuditAction;
  target: string;
  sourceRef: string | null;
  details: Record<string, unknown>;
  prevHash: string;
  hash: string;
}
