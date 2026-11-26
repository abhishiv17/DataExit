import { Directory, PERSONAL_DOMAINS } from "@dataexit/directory";
import type { MessageMeta } from "@dataexit/google";
import { audit, type Ctx } from "@dataexit/runtime";
import {
  DAY_MS,
  holdsIdOrBankData,
  monthsSince,
  sensitivityScore,
  type Company,
  type EvidenceRef,
  type Footprint,
  type Sensitivity,
} from "@dataexit/shared";
import { ACCOUNT_KINDS, ACCOUNT_PHRASES, ACTIVITY_PHRASES, classifySubject, maskSubject, type EvidenceKind } from "./signals.js";

export { classifySubject, maskSubject, ACCOUNT_PHRASES, ACTIVITY_PHRASES, type EvidenceKind } from "./signals.js";
/** All Gmail search phrases (kept for callers of the old name). */
export const SIGNUP_SUBJECT_PHRASES = [...ACCOUNT_PHRASES, ...ACTIVITY_PHRASES];

const MAX_EVIDENCE = 20;

/** Request statuses that count as an open request on a node in the data map. */
const OPEN = new Set(["draft", "approved", "sent", "id_requested", "redirected", "no_reply", "escalated"]);

interface Group {
  key: string;
  company: Company | null;
  domains: Set<string>;
  evidence: EvidenceRef[];
  signals: Partial<Record<EvidenceKind, number>>;
}

/**
 * Groups classified messages by company. Brands under one legal entity share a directory id, so they merge.
 * Messages whose subject is neither an account nor a usage signal (marketing, chit-chat) are dropped here.
 */
export function groupMessages(messages: MessageMeta[], directory: Directory, userEmail: string): Map<string, Group> {
  const userDomain = userEmail.split("@")[1] ?? "";
  const groups = new Map<string, Group>();
  for (const m of messages) {
    const domain = m.from_domain;
    if (!domain || PERSONAL_DOMAINS.has(domain) || domain === userDomain || m.from_email === userEmail) continue;
    const kind = classifySubject(m.subject);
    if (!kind) continue;
    const { key, company, domain: reg } = directory.keyForDomain(domain);
    const g = groups.get(key) ?? { key, company, domains: new Set<string>(), evidence: [], signals: {} };
    g.domains.add(company ? domain : reg);
    g.evidence.push({ message_id: m.id, date: m.date, kind, subject: maskSubject(m.subject), from_domain: domain });
    g.signals[kind] = (g.signals[kind] ?? 0) + 1;
    groups.set(key, g);
  }
  return groups;
}

/** Earliest account proof first (when they signed up), then the newest messages (how recently used). */
function pickEvidence(all: EvidenceRef[]): EvidenceRef[] {
  const list = [...new Map(all.map((e) => [e.message_id, e])).values()].sort((a, b) => b.date.localeCompare(a.date));
  const proof = [...list].reverse().find((e) => ACCOUNT_KINDS.has(e.kind));
  const rest = list.filter((e) => e !== proof);
  return (proof ? [proof, ...rest] : rest).slice(0, MAX_EVIDENCE);
}

function addSignals(a: Footprint["signals"] = {}, b: Footprint["signals"] = {}): Partial<Record<EvidenceKind, number>> {
  const out: Partial<Record<EvidenceKind, number>> = { ...a };
  for (const [k, v] of Object.entries(b) as Array<[EvidenceKind, number]>) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** incremental: g holds only messages newer than the last scan, so counts add up. Otherwise g is the full picture. */
function mergeFootprint(ctx: Ctx, g: Group, prev: Footprint | undefined, incremental: boolean): Footprint {
  const carried = incremental ? (prev?.evidence ?? []) : [];
  const all = [...g.evidence, ...carried];
  const evidence = pickEvidence(all);
  const dates = all.map((e) => e.date).sort();
  const first = prev && prev.first_seen < dates[0] ? prev.first_seen : dates[0];
  // Last use = newest account or usage signal. Marketing never gets here, so it cannot make a dormant account look active.
  const newest = dates[dates.length - 1];
  const last = incremental && prev && prev.last_interaction > newest ? prev.last_interaction : newest;
  const signals = incremental ? addSignals(prev?.signals, g.signals) : g.signals;
  const joinDates = all.filter((e) => e.kind === "signup" || e.kind === "welcome" || e.kind === "otp").map((e) => e.date);
  if (incremental && prev?.signed_up_at) joinDates.push(prev.signed_up_at);
  const matched = !!g.company;
  return {
    user_id: ctx.userId,
    company_id: g.key,
    first_seen: first,
    last_interaction: last,
    evidence_message_ids: evidence.map((e) => e.message_id),
    sensitivity_score: sensitivityScore({ data_categories: g.company?.data_categories ?? [], last_interaction: last, matched, now: ctx.now() }),
    matched,
    display_name: g.company ? Directory.displayName(g.company) : g.key.replace(/^unknown:/, ""),
    domains: [...new Set([...(prev?.domains ?? []), ...g.domains])],
    message_count: Object.values(signals).reduce((n, v) => n + (v ?? 0), 0),
    signals,
    signed_up_at: joinDates.sort()[0] ?? null,
    evidence,
  };
}

export async function discoverFootprint(ctx: Ctx, input: { since?: string; max_messages?: number } = {}) {
  const now = ctx.now();
  const years = ctx.config.discoveryLookbackYears;
  // Default: the whole mailbox. Old signups are the most forgotten accounts, so they must not fall outside a window.
  const after = input.since ? new Date(input.since) : years > 0 ? new Date(now.getTime() - years * 365 * DAY_MS) : undefined;
  const max = Math.min(input.max_messages ?? ctx.config.discoveryMaxMessages, ctx.config.discoveryMaxMessages);
  const userEmail = await ctx.gmail.userEmail();
  // Two searches, so a busy inbox full of receipts can never push old signup and OTP mails past the cap.
  const [accountMsgs, activityMsgs] = await Promise.all([
    ctx.gmail.search({ subject_any: ACCOUNT_PHRASES, after, exclude_sent: true, max }),
    ctx.gmail.search({ subject_any: ACTIVITY_PHRASES, after, exclude_sent: true, max }),
  ]);
  const messages = [...new Map([...accountMsgs, ...activityMsgs].map((m) => [m.id, m])).values()];

  const existing = new Map((await ctx.store.listFootprints(ctx.userId)).map((f) => [f.company_id, f]));
  // An incremental scan (since given) adds to counts; a full scan replaces them, so nothing double-counts.
  const incremental = !!input.since;
  const seenIds = new Set([...existing.values()].flatMap((f) => f.evidence_message_ids));
  const fresh = incremental ? messages.filter((m) => !seenIds.has(m.id)) : messages;
  const groups = groupMessages(fresh, ctx.directory, userEmail);

  const updated: Footprint[] = [];
  const created: Footprint[] = [];
  for (const g of groups.values()) {
    const prev = existing.get(g.key);
    const fp = mergeFootprint(ctx, g, prev, incremental);
    updated.push(fp);
    if (!prev) created.push(fp);
  }
  // Rescore untouched footprints too: dormancy grows over time.
  for (const f of existing.values()) {
    if (groups.has(f.company_id)) continue;
    const c = ctx.directory.get(f.company_id);
    const score = sensitivityScore({ data_categories: c?.data_categories ?? [], last_interaction: f.last_interaction, matched: f.matched, now });
    if (score !== f.sensitivity_score) updated.push({ ...f, sensitivity_score: score });
  }
  await ctx.store.upsertFootprints(ctx.userId, updated);
  await ctx.store.saveSettings(ctx.userId, { last_scan_at: now.toISOString(), user_email: userEmail });

  const signals: Partial<Record<EvidenceKind, number>> = {};
  for (const g of groups.values()) for (const [k, v] of Object.entries(g.signals) as Array<[EvidenceKind, number]>) signals[k] = (signals[k] ?? 0) + v;
  const used = [...groups.values()].reduce((n, g) => n + g.evidence.length, 0);
  const truncated = accountMsgs.length >= max || activityMsgs.length >= max;
  await audit(ctx, {
    actor: "agent",
    action: "discover_footprint",
    details: { scanned_messages: messages.length, used_messages: used, new_companies: created.length, since: after?.toISOString() ?? null, truncated },
  });

  const map = await getDataMap(ctx, { limit: 15 });
  return {
    scanned_messages: messages.length,
    used_messages: used,
    signals,
    since: after?.toISOString() ?? "whole mailbox",
    truncated,
    new_companies: created.map((f) => f.company_id),
    headline: map.headline,
    top_risk: map.nodes,
    note:
      "Headers only were read. Signup, welcome and OTP emails prove an account; orders, payments and statements prove use; marketing is ignored. " +
      (truncated ? "The message cap was reached: call again with a larger max_messages for a complete picture. " : "") +
      "Call get_data_map for the full graph.",
  };
}

export interface DataMapNode {
  company_id: string;
  name: string;
  legal_name: string | null;
  matched: boolean;
  sensitivity: Sensitivity;
  sensitivity_score: number;
  data_categories: string[];
  holds_id_or_bank: boolean;
  retention_rule: string | null;
  sector: string | null;
  first_seen: string;
  signed_up_at: string | null;
  last_interaction: string;
  months_inactive: number;
  message_count: number;
  signals: Partial<Record<EvidenceKind, number>>;
  domains: string[];
  evidence_message_ids: string[];
  /** "Why we found it": up to 3 messages, signup proof first. */
  evidence: EvidenceRef[];
  open_request: { id: string; type: string; status: string } | null;
}

export async function getDataMap(ctx: Ctx, input: { limit?: number; unused_months?: number; company_ids?: string[] } = {}) {
  const now = ctx.now();
  const limit = input.limit ?? 80;
  const [footprints, requests] = await Promise.all([ctx.store.listFootprints(ctx.userId), ctx.store.listRequests(ctx.userId)]);
  const openByCompany = new Map<string, { id: string; type: string; status: string }>();
  for (const r of requests) {
    if (!r.cancelled_at && !r.parent_id && OPEN.has(r.status)) openByCompany.set(r.company_id, { id: r.id, type: r.type, status: r.status });
  }

  const all: DataMapNode[] = footprints.map((f) => {
    const c = ctx.directory.get(f.company_id);
    const cats = c?.data_categories ?? [];
    return {
      company_id: f.company_id,
      name: f.display_name,
      legal_name: c?.legal_name ?? null,
      matched: f.matched,
      sensitivity: c?.sensitivity ?? "low",
      sensitivity_score: f.sensitivity_score,
      data_categories: cats,
      holds_id_or_bank: holdsIdOrBankData(cats),
      retention_rule: c?.retention_rule ?? null,
      sector: c?.sector ?? null,
      first_seen: f.first_seen,
      signed_up_at: f.signed_up_at ?? null,
      last_interaction: f.last_interaction,
      months_inactive: monthsSince(f.last_interaction, now),
      message_count: f.message_count,
      signals: f.signals ?? {},
      domains: f.domains,
      evidence_message_ids: f.evidence_message_ids.slice(0, 5),
      evidence: (f.evidence ?? []).slice(0, 3),
      open_request: openByCompany.get(f.company_id) ?? null,
    };
  });

  const headline = {
    companies: all.length,
    unused_1y: all.filter((n) => n.months_inactive >= 12).length,
    unused_3y: all.filter((n) => n.months_inactive >= 36).length,
    hold_id_or_bank: all.filter((n) => n.holds_id_or_bank).length,
    high_sensitivity: all.filter((n) => n.sensitivity === "high").length,
    unrecognised: all.filter((n) => !n.matched).length,
    signed_up: all.filter((n) => n.signed_up_at).length,
  };

  let nodes = all;
  if (input.company_ids?.length) nodes = nodes.filter((n) => input.company_ids!.includes(n.company_id));
  if (input.unused_months !== undefined) nodes = nodes.filter((n) => n.months_inactive >= input.unused_months!);
  nodes.sort((a, b) => b.sensitivity_score - a.sensitivity_score || a.name.localeCompare(b.name));

  // Cap nodes for the graph; the rest become one low-risk cluster.
  const shown = nodes.slice(0, limit);
  const rest = nodes.slice(limit);
  const top_risk_dormant = all
    .filter((n) => n.months_inactive >= 12 && n.matched)
    .sort((a, b) => b.sensitivity_score - a.sensitivity_score)
    .slice(0, 12)
    .map((n) => n.company_id);

  return {
    generated_at: now.toISOString(),
    headline,
    headline_text: `${headline.companies} companies, ${headline.unused_3y} unused for 3 years, ${headline.hold_id_or_bank} hold your Aadhaar, PAN or bank details`,
    nodes: shown,
    others: rest.length ? { count: rest.length, max_score: rest[0].sensitivity_score, company_ids: rest.map((n) => n.company_id) } : null,
    top_risk_dormant,
  };
}

/** Scheduled re-scan: new signups since the last scan, with a privacy summary for each. */
export async function checkNewSignups(ctx: Ctx) {
  const settings = await ctx.store.getSettings(ctx.userId);
  const since = settings.last_scan_at ?? new Date(ctx.now().getTime() - 7 * DAY_MS).toISOString();
  const result = await discoverFootprint(ctx, { since });
  const footprints = new Map((await ctx.store.listFootprints(ctx.userId)).map((f) => [f.company_id, f]));
  const signups = result.new_companies.map((id) => {
    const c = ctx.directory.get(id);
    const f = footprints.get(id)!;
    return {
      company_id: id,
      name: f.display_name,
      first_seen: f.first_seen,
      signed_up_at: f.signed_up_at ?? null,
      found_by: f.signed_up_at ? "signup_or_otp" : "receipt_only",
      evidence: (f.evidence ?? []).slice(0, 3),
      evidence_message_ids: f.evidence_message_ids.slice(0, 3),
      likely_data: c?.data_categories ?? [],
      sensitivity: c?.sensitivity ?? "low",
      retention_rule: c?.retention_rule ?? null,
      expiry_suggestion: c?.retention_rule
        ? "Regulated: data must be kept for a period. Suggest a restrict-use request when the account is no longer needed."
        : "Offer auto-expiry: if unused for 6 months, draft an erasure request.",
    };
  });
  return { since, scanned_messages: result.scanned_messages, new_signups: signups };
}
