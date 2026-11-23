import { Directory, PERSONAL_DOMAINS } from "@dataexit/directory";
import type { MessageMeta } from "@dataexit/google";
import { audit, type Ctx } from "@dataexit/runtime";
import {
  DAY_MS,
  holdsIdOrBankData,
  monthsSince,
  sensitivityScore,
  type Company,
  type Footprint,
  type Sensitivity,
} from "@dataexit/shared";

/**
 * Subject phrases that mark a relationship with a company: signups, OTPs, orders, receipts.
 * Searched as headers only (format=metadata); bodies are never fetched during discovery.
 */
export const SIGNUP_SUBJECT_PHRASES = [
  "welcome",
  "verify your email",
  "confirm your email",
  "verify your account",
  "activate your account",
  "account created",
  "thanks for signing up",
  "thank you for signing up",
  "registration",
  "successfully registered",
  "otp",
  "one time password",
  "verification code",
  "login code",
  "password reset",
  "reset your password",
  "your order",
  "order confirmed",
  "order placed",
  "booking confirmed",
  "receipt",
  "invoice",
  "payment received",
  "payment successful",
  "transaction alert",
  "subscription",
  "kyc",
  "e-statement",
];

const MAX_EVIDENCE_IDS = 20;

/** Request statuses that count as an open request on a node in the data map. */
const OPEN = new Set(["draft", "approved", "sent", "id_requested", "redirected", "no_reply", "escalated"]);

interface Group {
  key: string;
  company: Company | null;
  domains: Set<string>;
  ids: string[];
  first: string;
  last: string;
  count: number;
}

/** Groups messages by company. Brands under one legal entity share a directory id, so they merge. */
export function groupMessages(messages: MessageMeta[], directory: Directory, userEmail: string): Map<string, Group> {
  const userDomain = userEmail.split("@")[1] ?? "";
  const groups = new Map<string, Group>();
  for (const m of messages) {
    const domain = m.from_domain;
    if (!domain || PERSONAL_DOMAINS.has(domain) || domain === userDomain || m.from_email === userEmail) continue;
    const { key, company, domain: reg } = directory.keyForDomain(domain);
    const g = groups.get(key) ?? { key, company, domains: new Set<string>(), ids: [], first: m.date, last: m.date, count: 0 };
    g.domains.add(company ? domain : reg);
    g.ids.push(m.id);
    g.count++;
    if (m.date < g.first) g.first = m.date;
    if (m.date > g.last) g.last = m.date;
    groups.set(key, g);
  }
  return groups;
}

/** incremental: g holds only messages newer than the last scan, so counts add up. Otherwise g is the full picture. */
function mergeFootprint(ctx: Ctx, g: Group, prev: Footprint | undefined, incremental: boolean): Footprint {
  const first = prev && prev.first_seen < g.first ? prev.first_seen : g.first;
  const last = prev && prev.last_interaction > g.last ? prev.last_interaction : g.last;
  // Newest evidence first, capped.
  const ids = [...new Set([...g.ids, ...(prev?.evidence_message_ids ?? [])])].slice(0, MAX_EVIDENCE_IDS);
  const matched = !!g.company;
  return {
    user_id: ctx.userId,
    company_id: g.key,
    first_seen: first,
    last_interaction: last,
    evidence_message_ids: ids,
    sensitivity_score: sensitivityScore({
      data_categories: g.company?.data_categories ?? [],
      last_interaction: last,
      matched,
      now: ctx.now(),
    }),
    matched,
    display_name: g.company ? Directory.displayName(g.company) : g.key.replace(/^unknown:/, ""),
    domains: [...new Set([...(prev?.domains ?? []), ...g.domains])],
    message_count: incremental ? (prev?.message_count ?? 0) + g.count : Math.max(g.count, prev?.message_count ?? 0),
  };
}

export async function discoverFootprint(ctx: Ctx, input: { since?: string; max_messages?: number } = {}) {
  const now = ctx.now();
  const after = input.since
    ? new Date(input.since)
    : new Date(now.getTime() - ctx.config.discoveryLookbackYears * 365 * DAY_MS);
  const userEmail = await ctx.gmail.userEmail();
  const messages = await ctx.gmail.search({
    subject_any: SIGNUP_SUBJECT_PHRASES,
    after,
    exclude_sent: true,
    max: Math.min(input.max_messages ?? ctx.config.discoveryMaxMessages, ctx.config.discoveryMaxMessages),
  });

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
  await audit(ctx, {
    actor: "agent",
    action: "discover_footprint",
    details: { scanned_messages: messages.length, new_companies: created.length, since: after.toISOString() },
  });

  const map = await getDataMap(ctx, { limit: 15 });
  return {
    scanned_messages: messages.length,
    since: after.toISOString(),
    new_companies: created.map((f) => f.company_id),
    headline: map.headline,
    top_risk: map.nodes,
    note: "Headers only were read. Call get_data_map for the full graph.",
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
  last_interaction: string;
  months_inactive: number;
  message_count: number;
  domains: string[];
  evidence_message_ids: string[];
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
      last_interaction: f.last_interaction,
      months_inactive: monthsSince(f.last_interaction, now),
      message_count: f.message_count,
      domains: f.domains,
      evidence_message_ids: f.evidence_message_ids.slice(0, 5),
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
