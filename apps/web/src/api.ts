// Data adapter. Today it serves the mock JSON produced by demo/seed-inbox/generate.mjs,
// which follows docs/contract.md. When Person A's MCP tools are live, swap each function
// for a call to the tool named in its comment; the UI does not change.

import type { ApprovalTier, FootprintResult, LegalBasis, RequestStatus, RequestType, Sector } from "@dataexit/shared";
import footprint from "./mock/footprint.json";
import requests from "./mock/requests.json";

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
  needsRecipient: boolean;
  sourceRef: string;
  en: DraftText;
  hi: DraftText;
}

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
  escalation?: { en: { subject: string; body: string }; hi: { subject: string; body: string } };
}

/** discover_footprint */
export async function getFootprint(): Promise<FootprintResult> {
  return footprint as unknown as FootprintResult;
}

let draftCache: Record<string, Draft> | null = null;
/** draft_request (goal: erase; engine switches to restrict_use when retention applies) */
export async function draftRequest(companyId: string): Promise<Draft | null> {
  draftCache ??= (await import("./mock/drafts.json")).default as unknown as Record<string, Draft>;
  return draftCache[companyId] ?? null;
}

/** list_requests */
export async function listRequests(): Promise<TrackedRequest[]> {
  return requests as unknown as TrackedRequest[];
}
