// Data adapter. Two sources behind one interface:
//   demo: the mock JSON produced by demo/seed-inbox/generate.mjs (static site, no server).
//   live: the Data Exit MCP tools over HTTP (servers/dataexit --http). Every approve, undo, reject,
//         send and escalation goes through the server's policy layer and its hash-chained audit log.
// The source is fixed at build time (VITE_DATA_SOURCE, set by vite.config.ts).
// Live results use the contract shapes (docs/contract.md) and are mapped to the UI's shapes here.

import {
  isHighSensitivity, sensitivityScore, SECTOR_DEFAULT_CATEGORIES,
  type ApprovalTier, type DataCategory, type EvidenceKind, type FootprintResult, type FootprintView, type Language,
  type LegalBasis, type RequestStatus, type RequestType, type RetentionDuty, type Sector,
} from "@dataexit/shared/ui";
import { callTool, ToolError } from "./mcp";

export { McpUnavailable, ToolError, MCP_URL } from "./mcp";

export type DataSource = "live" | "demo";
export const DATA_SOURCE: DataSource = import.meta.env.VITE_DATA_SOURCE === "live" ? "live" : "demo";
export const LIVE = DATA_SOURCE === "live";

export interface DraftText { subject: string; body: string; missing: string[] }

/** Output of draft_request (plus recommend_request's reason). */
export interface Draft {
  companyId: string;
  companyName: string;
  sector: Sector;
  goal: RequestType;
  requestType: RequestType;
  changed: boolean;
  reason: string;
  tier: ApprovalTier;
  legalBasis: LegalBasis;
  recipient: string | null;
  /** Verified web form when the company takes requests only through a portal. */
  recipientForm: string | null;
  recipientSource: string | null;
  needsRecipient: boolean;
  sourceRef: string;
  /** Demo drafts carry both languages; a live draft carries the language it was drafted in. */
  en: DraftText | null;
  hi: DraftText | null;
  /** Live only: the server's request id and state. */
  requestId?: string;
  language?: Language;
  serverStatus?: string;
  undoUntil?: string | null;
}

export type NextAction =
  | { action: "none" | "approve" | "send" | "file_personally" | "verify_identity" | "offer_restrict"; request_id?: string; level?: string }
  | { action: "escalate"; level: "reminder" | "grievance_officer" | "dpb" }
  | { action: "wait"; until: string | null };

/** Row from list_requests. */
export interface TrackedRequest {
  id: string;
  companyId: string;
  companyName: string;
  type: RequestType;
  status: RequestStatus;
  sentAt: string;
  deadlineAt: string;
  gmailMessageId: string | null;
  calendarEventId: string | null;
  sourceRef: string | null;
  evidence: string[];
  repliedAt?: string | null;
  escalation?: { en: { subject: string; body: string }; hi: { subject: string; body: string } };
  /** Live only (tracker's next_action). */
  nextAction?: NextAction | null;
}

/** An escalation draft from escalate_request, ready to show and approve. */
export interface EscalationDraft {
  requestId: string;
  level: "reminder" | "grievance_officer" | "dpb";
  tier: ApprovalTier;
  sendable: boolean;
  language: Language;
  recipient: string | null;
  recipientSource: string | null;
  subject: string;
  body: string;
}

/** Audit event as the drawer shows it (from get_audit_log in live mode). */
export interface UiAuditEvent { seq: number; at: string; actor: string; action: string; target: string; hash: string; prevHash: string }

// ---------------------------------------------------------------------------------------------
// Contract → UI mapping

const CATEGORY: Record<string, DataCategory> = { gov_id: "government_id", inferred: "inferred_profile" };
const DUTY: Record<string, RetentionDuty> = {
  RBI_KYC: "rbi_kyc", PMLA: "pmla", TELECOM: "telecom_licence", TAX: "tax", MEDICAL: "medical", SEBI: "sebi", INSURANCE: "insurance",
};
const TYPE: Record<string, RequestType> = { restrict: "restrict_use" };
const TIER: Record<string, ApprovalTier> = { auto: "low", one_tap: "medium", full_review: "high" };
const STATUS: Record<string, RequestStatus> = {
  sent: "sent", confirmed: "confirmed", id_requested: "id_requested", refused_retention: "rejected",
  redirected: "redirected", no_reply: "overdue", escalated: "escalated_go", draft: "draft", approved: "in_undo_window",
};
const KINDS: ReadonlySet<string> = new Set(["signup", "welcome", "otp", "account", "receipt", "newsletter", "reply"]);

const toCategories = (cats: string[]): DataCategory[] => cats.map((c) => CATEGORY[c] ?? (c as DataCategory));
const toDuties = (rule: string | null): RetentionDuty[] =>
  rule ? [...new Set(rule.split(/[|,]/).map((r) => DUTY[r.trim()]).filter((d): d is RetentionDuty => !!d))] : [];
const toType = (t: string): RequestType => TYPE[t] ?? (t as RequestType);

interface ContractEvidence { message_id: string; date: string; kind: string; subject: string; from_domain: string }
interface DataMapNode {
  company_id: string; name: string; matched: boolean; data_categories: string[]; holds_id_or_bank: boolean;
  retention_rule: string | null; sector: string | null; first_seen: string; signed_up_at: string | null;
  last_interaction: string; months_inactive: number; domains: string[]; evidence_message_ids: string[];
  evidence: ContractEvidence[]; open_request: { id: string; type: string; status: string } | null;
}
interface DataMap { generated_at: string; headline: { companies: number }; nodes: DataMapNode[] }

function toFootprint(n: DataMapNode): FootprintView {
  const sector = (n.sector ?? "other") as Sector;
  const cats = n.data_categories.length ? toCategories(n.data_categories) : (SECTOR_DEFAULT_CATEGORIES[sector] ?? ["contact"]);
  const evidence = n.evidence.length
    ? n.evidence.map((e) => ({ messageId: e.message_id, date: e.date, from: e.from_domain, subject: e.subject, kind: (KINDS.has(e.kind) ? e.kind : "signup") as EvidenceKind }))
    : n.evidence_message_ids.map((id) => ({ messageId: id, date: n.first_seen, from: n.domains[0] ?? "", subject: "(email)", kind: "signup" as EvidenceKind }));
  return {
    footprintId: n.company_id,
    company: {
      id: n.company_id, name: n.name, sector, domains: n.domains, dataCategories: cats,
      retentionDuties: toDuties(n.retention_rule), grievanceVerified: false,
    },
    firstSeen: n.signed_up_at ?? n.first_seen,
    lastSeen: n.last_interaction,
    discoveredVia: ["gmail"],
    sensitivity: sensitivityScore(cats),
    highSensitivity: n.holds_id_or_bank || isHighSensitivity({ dataCategories: cats }),
    status: n.open_request ? "request_open" : n.months_inactive >= 12 ? "dormant" : "active",
    evidence,
  };
}

interface ContractDraft {
  id: string; company_id: string; company_name: string; type: string; requested_type: string; retention_note: string | null;
  tier: string; status: string; language: Language; enforceability: LegalBasis; recipient: string | null;
  subject: string; body: string; source_message_ids: string[]; undo_until: string | null; sendable: boolean;
  escalation_level: EscalationDraft["level"] | null;
}

function toDraft(d: ContractDraft, fp: FootprintView | undefined): Draft {
  const text: DraftText = { subject: d.subject, body: d.body, missing: [] };
  return {
    companyId: d.company_id,
    companyName: d.company_name,
    sector: fp?.company.sector ?? "other",
    goal: toType(d.requested_type),
    requestType: toType(d.type),
    changed: d.type !== d.requested_type,
    // The card already says "asking them to restrict use", so keep only the legal reason.
    reason: (d.retention_note ?? "").replace(/;\s*asking to restrict use instead of erasing\.?$/i, "."),
    tier: TIER[d.tier] ?? "medium",
    legalBasis: d.enforceability,
    recipient: d.recipient,
    recipientForm: null,
    recipientSource: null,
    needsRecipient: !d.recipient,
    sourceRef: d.source_message_ids[0] ?? fp?.evidence[0]?.messageId ?? "",
    en: d.language === "en" ? text : null,
    hi: d.language === "hi" ? text : null,
    requestId: d.id,
    language: d.language,
    serverStatus: d.status,
    undoUntil: d.undo_until,
  };
}

interface ContractRow {
  id: string; company_id: string; company_name: string; type: string; status: string; parent_id: string | null;
  sent_at: string | null; deadline: string | null; replies: Array<{ message_id: string; received_at: string }>;
  gmail_message_id?: string | null; calendar_event_id?: string | null; source_message_ids?: string[];
  cancelled: boolean; next_action?: NextAction | null; escalation_level: string | null;
}

function toTracked(r: ContractRow): TrackedRequest {
  const replies = [...r.replies].sort((a, b) => a.received_at.localeCompare(b.received_at));
  return {
    id: r.id,
    companyId: r.company_id,
    companyName: r.company_name,
    type: toType(r.type),
    status: STATUS[r.status] ?? (r.status as RequestStatus),
    sentAt: r.sent_at!,
    deadlineAt: r.deadline ?? r.sent_at!,
    gmailMessageId: r.gmail_message_id ?? null,
    calendarEventId: r.calendar_event_id ?? null,
    sourceRef: r.source_message_ids?.[0] ?? null,
    evidence: replies.map((x) => x.message_id),
    repliedAt: replies[0]?.received_at ?? null,
    nextAction: r.next_action ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Reads

/** discover_footprint (first run) + get_data_map */
export async function getFootprint(): Promise<FootprintResult> {
  if (!LIVE) return (await import("./mock/footprint.json")).default as unknown as FootprintResult;
  let map = await callTool<DataMap>("get_data_map", { limit: 500 });
  if (map.headline.companies === 0) {
    await callTool("discover_footprint", {});
    map = await callTool<DataMap>("get_data_map", { limit: 500 });
  }
  return {
    userId: "live",
    scannedAt: map.generated_at,
    footprints: map.nodes.map(toFootprint),
    unmatchedDomains: map.nodes.filter((n) => !n.matched).map((n) => n.company_id.replace(/^unknown:/, "")),
  };
}

/** list_requests: sent requests (top-level only; escalations show on their original). */
export async function listRequests(): Promise<TrackedRequest[]> {
  if (!LIVE) return (await import("./mock/requests.json")).default as unknown as TrackedRequest[];
  const res = await callTool<{ requests: ContractRow[] }>("list_requests", {});
  return res.requests
    .filter((r) => !r.parent_id && !r.cancelled && r.sent_at)
    .sort((a, b) => b.sent_at!.localeCompare(a.sent_at!))
    .map(toTracked);
}

/** Live: drafts and approved-but-unsent requests, so a reload shows what is waiting for the user. */
export async function listOpenDrafts(byId: Map<string, FootprintView>): Promise<Draft[]> {
  if (!LIVE) return [];
  const res = await callTool<{ requests: ContractRow[] }>("list_requests", {});
  const open = res.requests.filter((r) => !r.parent_id && !r.cancelled && !r.sent_at && (r.status === "draft" || r.status === "approved"));
  const full = await Promise.all(open.map((r) => callTool<ContractDraft>("get_request", { request_id: r.id })));
  return full.map((d) => toDraft(d, byId.get(d.company_id)));
}

/** weekly_digest: the ready-to-send line (live only; the demo computes it locally). */
export async function weeklyDigest(language: Language): Promise<string | null> {
  if (!LIVE) return null;
  return (await callTool<{ text: string }>("weekly_digest", { language, days: 7 })).text;
}

/** check_replies: reads replies to sent requests and updates statuses. */
export async function checkReplies(): Promise<{ newReplies: number; needsReview: number; newlyOverdue: number }> {
  const r = await callTool<{ new_replies: unknown[]; needs_review: unknown[]; newly_overdue: unknown[] }>("check_replies", {});
  return { newReplies: r.new_replies.length, needsReview: r.needs_review.length, newlyOverdue: r.newly_overdue.length };
}

/** get_audit_log, mapped for the drawer. */
export async function getAuditLog(): Promise<{ events: UiAuditEvent[]; brokenAt: number | null }> {
  const r = await callTool<{
    verification: { ok: boolean; broken_at?: number | null };
    events: Array<{ seq: number; timestamp: string; actor: string; action: string; target: string | null; hash: string; prev_hash: string }>;
  }>("get_audit_log", { limit: 200 });
  return {
    brokenAt: r.verification.ok ? null : (r.verification.broken_at ?? 0),
    events: r.events.map((e) => ({ seq: e.seq, at: e.timestamp, actor: e.actor, action: e.action, target: e.target ?? "", hash: e.hash, prevHash: e.prev_hash })),
  };
}

// ---------------------------------------------------------------------------------------------
// Drafting and the approval pipeline (live: policy layer on the server)

let demoDrafts: Record<string, Draft> | null = null;

/**
 * draft_request (goal: erase; the engine switches to restrict when a retention duty applies).
 * Live throws ToolError NEED_USER_NAME until the user's name is known; pass userName to save it.
 */
export async function draftRequests(
  companyIds: string[],
  byId: Map<string, FootprintView>,
  opts: { language?: Language; userName?: string } = {},
): Promise<{ drafts: Draft[]; skipped: Array<{ companyId: string; reason: string }> }> {
  if (!LIVE) {
    demoDrafts ??= (await import("./mock/drafts.json")).default as unknown as Record<string, Draft>;
    const drafts = companyIds.map((id) => demoDrafts![id]).filter((d): d is Draft => !!d);
    return { drafts, skipped: [] };
  }
  const res = await callTool<{ drafts: ContractDraft[]; skipped: Array<{ company_id: string; reason: string }> }>("draft_request", {
    company_ids: companyIds,
    type: "erase",
    language: opts.language ?? "en",
    ...(opts.userName ? { user_name: opts.userName } : {}),
  });
  return {
    drafts: res.drafts.map((d) => toDraft(d, byId.get(d.company_id))),
    skipped: res.skipped.map((s) => ({ companyId: s.company_id, reason: s.reason })),
  };
}

/** Live: a draft in the other language replaces this one (reject_request + draft_request, both audited). */
export async function redraftInLanguage(d: Draft, language: Language, byId: Map<string, FootprintView>): Promise<Draft> {
  await callTool("reject_request", { request_id: d.requestId, reason: `switched to ${language === "hi" ? "Hindi" : "English"}` });
  const res = await draftRequests([d.companyId], byId, { language });
  if (!res.drafts[0]) throw new ToolError("REDRAFT_FAILED", res.skipped[0]?.reason ?? "Could not draft in that language.");
  return res.drafts[0];
}

interface ItemResult { id: string; ok: boolean; status?: string; undo_until?: string | null; error?: string; message?: string; hint?: string | null }

/** approve_request. Full-review requests need reviewed: true (the user has seen the full text). */
export async function approve(requestId: string, opts: { reviewed: boolean; recipient?: string }): Promise<{ undoUntil: string | null }> {
  const res = await callTool<{ results: ItemResult[] }>("approve_request", {
    request_ids: [requestId],
    reviewed: opts.reviewed,
    ...(opts.recipient ? { recipient: opts.recipient } : {}),
  });
  const r = res.results[0];
  if (!r?.ok) throw new ToolError(r?.error ?? "APPROVE_FAILED", r?.message ?? "Approval failed.", r?.hint ?? null);
  return { undoUntil: r.undo_until ?? null };
}

export async function undo(requestId: string): Promise<void> {
  await callTool("undo_request", { request_id: requestId });
}

export async function reject(requestId: string, reason?: string): Promise<void> {
  await callTool("reject_request", { request_id: requestId, ...(reason ? { reason } : {}) });
}

export interface SendResult {
  mode: string;
  modeNote: string;
  sent: Array<{ id: string; deadline: string | null }>;
  pending: string[];
  blocked: Array<{ id: string; message: string }>;
  previews: string[];
}

/** send_request: sends approved requests whose undo window has passed (server decides). */
export async function send(requestIds: string[]): Promise<SendResult> {
  const r = await callTool<{
    mode: string; mode_note: string; sent: Array<{ id: string; deadline: string | null }>;
    pending_undo_window: Array<{ id: string }>; blocked: ItemResult[]; previews: Array<{ id: string }>;
  }>("send_request", { request_ids: requestIds });
  return {
    mode: r.mode,
    modeNote: r.mode_note,
    sent: r.sent.map((s) => ({ id: s.id, deadline: s.deadline })),
    pending: r.pending_undo_window.map((p) => p.id),
    blocked: r.blocked.map((b) => ({ id: b.id, message: b.message ?? b.error ?? "Blocked" })),
    previews: r.previews.map((p) => p.id),
  };
}

/** escalate_request: next rung of the ladder as a draft (reminder, grievance officer or DPB complaint). */
export async function escalate(requestId: string): Promise<EscalationDraft> {
  const r = await callTool<{ level: EscalationDraft["level"]; recipient_source?: string; draft: ContractDraft }>("escalate_request", { request_id: requestId });
  return {
    requestId: r.draft.id,
    level: r.level,
    tier: TIER[r.draft.tier] ?? "high",
    sendable: r.draft.sendable,
    language: r.draft.language,
    recipient: r.draft.recipient,
    recipientSource: r.recipient_source ?? null,
    subject: r.draft.subject,
    body: r.draft.body,
  };
}
