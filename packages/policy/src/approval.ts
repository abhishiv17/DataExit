import type { DataRequest } from "@dataexit/shared";

// Approval state machine. Pure functions: callers persist the result and write the audit event.
//
//   draft --approve--> approved --(undo window passes)--> send --> sent
//     ^                    |
//     +------- undo -------+          reject (draft|approved) --> cancelled

export type PolicyErrorCode =
  | "CANCELLED"
  | "NOT_DRAFT"
  | "REVIEW_REQUIRED"
  | "AUTO_NOT_ALLOWED"
  | "NOT_APPROVED"
  | "ALREADY_SENT"
  | "IN_UNDO_WINDOW"
  | "NOT_SENDABLE"
  | "NO_RECIPIENT";

export class PolicyError extends Error {
  constructor(
    readonly code: PolicyErrorCode,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "PolicyError";
  }
}

export const DEFAULT_UNDO_WINDOW_MS = 10 * 60 * 1000;

export interface ApproveOptions {
  now: Date;
  undoWindowMs: number;
  /** The user has seen the full draft. Required for full_review. */
  reviewed?: boolean;
  /** Auto-approval by policy (auto tier with auto mode enabled), not by the user. */
  auto?: boolean;
}

export function approve(req: DataRequest, opts: ApproveOptions): DataRequest {
  if (req.cancelled_at) throw new PolicyError("CANCELLED", `Request ${req.id} was cancelled.`);
  if (req.status !== "draft") throw new PolicyError("NOT_DRAFT", `Request ${req.id} is ${req.status}, not a draft.`);
  if (opts.auto && req.tier !== "auto") {
    throw new PolicyError("AUTO_NOT_ALLOWED", `Request ${req.id} is ${req.tier} tier and needs the user's approval.`);
  }
  if (req.tier === "full_review" && !opts.reviewed && !opts.auto) {
    throw new PolicyError(
      "REVIEW_REQUIRED",
      `Request ${req.id} needs full review before approval.`,
      "Show the user the complete subject, recipient and body, then call again with reviewed: true once they confirm.",
    );
  }
  const undoUntil = req.tier === "full_review" ? new Date(opts.now.getTime() + opts.undoWindowMs) : opts.now;
  return { ...req, status: "approved", approved_at: opts.now.toISOString(), undo_until: undoUntil.toISOString() };
}

/** Undo is allowed any time before the email goes out. */
export function undo(req: DataRequest): DataRequest {
  if (req.cancelled_at) throw new PolicyError("CANCELLED", `Request ${req.id} was cancelled.`);
  if (req.status !== "approved") {
    throw new PolicyError(
      req.sent_at ? "ALREADY_SENT" : "NOT_APPROVED",
      req.sent_at ? `Request ${req.id} was already sent and cannot be undone.` : `Request ${req.id} is not approved.`,
    );
  }
  return { ...req, status: "draft", approved_at: null, undo_until: null };
}

export function reject(req: DataRequest, now: Date): DataRequest {
  if (req.cancelled_at) throw new PolicyError("CANCELLED", `Request ${req.id} was already cancelled.`);
  if (req.status !== "draft" && req.status !== "approved") {
    throw new PolicyError("ALREADY_SENT", `Request ${req.id} is ${req.status}; only drafts and approved requests can be rejected.`);
  }
  return { ...req, status: "draft", approved_at: null, undo_until: null, cancelled_at: now.toISOString() };
}

/** Why this request cannot be sent right now, or null if it can. */
export function sendBlocker(req: DataRequest, now: Date): PolicyError | null {
  if (req.cancelled_at) return new PolicyError("CANCELLED", `Request ${req.id} was cancelled.`);
  if (!req.sendable) {
    return new PolicyError("NOT_SENDABLE", `Request ${req.id} is a draft for the user to file personally (e.g. a DPB complaint).`);
  }
  if (req.sent_at) return new PolicyError("ALREADY_SENT", `Request ${req.id} was already sent.`);
  if (req.status !== "approved") {
    return new PolicyError("NOT_APPROVED", `Request ${req.id} is ${req.status}; the user must approve it first.`);
  }
  if (req.undo_until && new Date(req.undo_until) > now) {
    return new PolicyError(
      "IN_UNDO_WINDOW",
      `Request ${req.id} is in its undo window until ${req.undo_until}.`,
      "Call send_request again after the window ends.",
    );
  }
  if (!req.recipient) {
    return new PolicyError(
      "NO_RECIPIENT",
      `Request ${req.id} has no recipient: the directory has no grievance contact for ${req.company_name}.`,
      "Ask the user for the company's grievance or privacy email and redraft with recipient set.",
    );
  }
  return null;
}
