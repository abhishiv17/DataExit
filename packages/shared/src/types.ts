// Domain model. Fields marked "contract" are the shared interface in docs/contract.md;
// Person B's UI builds against them, so do not rename or remove them.
// Fields marked "ext" are additive extensions used by the servers.

export type Sensitivity = "low" | "med" | "high";
export type Language = "en" | "hi";

export type DataCategory =
  | "contact"
  | "device"
  | "behavioural"
  | "transaction"
  | "location"
  | "communications"
  | "inferred"
  | "financial"
  | "gov_id"
  | "health"
  | "biometric"
  | "children";

export type Sector =
  | "ecommerce"
  | "food_delivery"
  | "quick_commerce"
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
  | "entertainment"
  | "government"
  | "other";

export interface Company {
  // contract
  id: string;
  legal_name: string;
  brands: string[];
  domains: string[];
  sms_sender_ids: string[];
  grievance_email: string | null;
  data_categories: string[];
  sensitivity: Sensitivity;
  retention_rule: string | null; // e.g. "RBI_KYC", "TELECOM", null
  // ext
  sector?: Sector;
  grievance_verified?: boolean;
  grievance_source?: string | null;
  support_email?: string | null;
  /** Web form, for companies that only take requests through a portal. */
  grievance_url?: string | null;
}

export interface Footprint {
  // contract
  user_id: string;
  company_id: string; // directory id, or "unknown:<domain>" for unmatched senders
  first_seen: string;
  last_interaction: string;
  evidence_message_ids: string[];
  sensitivity_score: number; // 0-100
  // ext
  matched: boolean;
  display_name: string;
  domains: string[];
  message_count: number;
}

export type RequestType =
  | "stop_marketing"
  | "withdraw_consent"
  | "access"
  | "correct"
  | "erase"
  | "restrict";

export type Tier = "auto" | "one_tap" | "full_review";

export type RequestStatus =
  | "draft"
  | "approved"
  | "sent"
  | "confirmed"
  | "id_requested"
  | "refused_retention"
  | "redirected"
  | "no_reply"
  | "escalated";

export type EscalationLevel = "reminder" | "grievance_officer" | "dpb";
export type Enforceability = "policy_based" | "statutory";

export interface Reply {
  // contract
  message_id: string;
  received_at: string;
  classification: RequestStatus;
  // ext
  classified_by?: "rules" | "agent";
  redirect_to?: string[];
}

export interface DataRequest {
  // contract
  id: string;
  company_id: string;
  type: RequestType;
  legal_basis: string; // DPDP section cited
  language: Language;
  body: string;
  tier: Tier;
  status: RequestStatus;
  sent_at: string | null;
  deadline: string | null;
  replies: Reply[];
  // ext
  user_id: string;
  company_name: string;
  subject: string;
  recipient: string | null;
  created_at: string;
  enforceability: Enforceability;
  requested_type: RequestType; // what the user asked for, before the retention check
  retention_note: string | null;
  approved_at: string | null;
  undo_until: string | null;
  cancelled_at: string | null;
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
  rfc822_message_id: string | null;
  calendar_event_id: string | null;
  source_message_ids: string[];
  parent_id: string | null;
  escalation_level: EscalationLevel | null;
  sendable: boolean; // false for DPB complaint drafts: the user files those personally
}

export type AuditActor = "agent" | "user";
export type AuditApproval = "auto" | "approved" | "rejected" | "undone" | null;

export interface AuditEvent {
  // contract
  id: string;
  actor: AuditActor;
  action: string;
  approval: AuditApproval;
  timestamp: string;
  prev_hash: string;
  // ext
  user_id: string;
  seq: number;
  target: string | null;
  details: Record<string, unknown>;
  hash: string;
}

export interface AuditInput {
  actor: AuditActor;
  action: string;
  approval?: AuditApproval;
  target?: string | null;
  details?: Record<string, unknown>;
}

export interface UserSettings {
  user_name: string | null;
  user_email: string | null;
  language: Language;
  auto_low_risk: boolean; // run "auto" tier requests without asking
  last_scan_at: string | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  user_name: null,
  user_email: null,
  language: "en",
  auto_low_risk: false,
  last_scan_at: null,
};
