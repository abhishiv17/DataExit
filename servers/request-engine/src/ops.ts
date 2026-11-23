import { randomUUID } from "node:crypto";
import { Directory } from "@dataexit/directory";
import { approve, classifyTier, isHighRiskCompany, PolicyError, reject, sendBlocker, undo } from "@dataexit/policy";
import { audit, UserFacingError, type Ctx } from "@dataexit/runtime";
import {
  adjustForRetention,
  DAY_MS,
  enforceabilityOn,
  GRIEVANCE_RESPONSE_DAYS,
  RESPONSE_DEADLINE_DAYS,
  retentionLabel,
  SECTION_REFS,
  type Company,
  type DataRequest,
  type EscalationLevel,
  type Language,
  type RequestType,
  type Tier,
  type UserSettings,
} from "@dataexit/shared";
import { LEGAL_BASIS_NOTE, loadTemplate, missingPlaceholders, render, type TemplateName } from "./templates.js";

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  stop_marketing: "stop marketing",
  withdraw_consent: "withdraw consent",
  access: "access",
  correct: "correction",
  erase: "erasure",
  restrict: "restrict use",
};

const ESCALATION_SECTION = "Section 13 [verify]";
const dateOnly = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

interface Target {
  id: string;
  company: Company | null;
  name: string;
  recipient: string | null;
}

function resolveTarget(ctx: Ctx, id: string): Target {
  const company = ctx.directory.get(id) ?? null;
  if (company) {
    const brand = Directory.displayName(company);
    return {
      id,
      company,
      name: brand.toLowerCase() === company.legal_name.toLowerCase() ? company.legal_name : `${brand} (${company.legal_name})`,
      recipient: company.grievance_email ?? company.support_email ?? null,
    };
  }
  if (id.startsWith("unknown:")) return { id, company: null, name: id.slice("unknown:".length), recipient: null };
  throw new UserFacingError("UNKNOWN_COMPANY", `No company with id ${id}.`, "Use company ids from get_data_map or lookup_company.");
}

async function requireIdentity(ctx: Ctx, input: { user_name?: string; user_email?: string }): Promise<UserSettings> {
  let settings = await ctx.store.getSettings(ctx.userId);
  const patch: Partial<UserSettings> = {};
  if (input.user_name && input.user_name !== settings.user_name) patch.user_name = input.user_name;
  if (input.user_email && input.user_email !== settings.user_email) patch.user_email = input.user_email;
  if (!settings.user_email && !patch.user_email) patch.user_email = await ctx.gmail.userEmail();
  if (Object.keys(patch).length) settings = await ctx.store.saveSettings(ctx.userId, patch);
  if (!settings.user_name) {
    throw new UserFacingError(
      "NEED_USER_NAME",
      "The user's full name is needed to sign requests.",
      "Ask the user for their full name as registered with these companies, then call again with user_name.",
    );
  }
  return settings;
}

function baseVars(ctx: Ctx, settings: UserSettings, lang: Language, companyName: string) {
  return {
    company_name: companyName,
    user_name: settings.user_name!,
    user_email: settings.user_email!,
    date: dateOnly(ctx.now()),
    legal_basis_note: LEGAL_BASIS_NOTE[lang][enforceabilityOn(ctx.now())],
    deadline_days: RESPONSE_DEADLINE_DAYS,
  };
}

function renderOrThrow(lang: Language, template: TemplateName, vars: Record<string, string | number | null | undefined>) {
  const t = loadTemplate(lang, template);
  const subject = render(t.subject, vars);
  const body = render(t.body, vars);
  const missing = missingPlaceholders(subject + body);
  if (missing.length) {
    throw new UserFacingError("MISSING_DETAILS", `Template ${lang}/${template} still needs: ${missing.join(", ")}.`, "Ask the user and call again.");
  }
  return { subject, body };
}

export interface DraftInput {
  company_ids: string[];
  type: RequestType;
  language?: Language;
  recipient?: string;
  account_identifier?: string;
  correction_details?: string;
  user_name?: string;
  user_email?: string;
}

export async function draftRequests(ctx: Ctx, input: DraftInput) {
  const settings = await requireIdentity(ctx, input);
  const lang = input.language ?? settings.language;
  if (input.type === "correct" && !input.correction_details) {
    throw new UserFacingError("MISSING_DETAILS", "A correction request needs correction_details.", "Ask the user what is wrong and what it should be.");
  }
  const [footprints, existing] = await Promise.all([ctx.store.listFootprints(ctx.userId), ctx.store.listRequests(ctx.userId)]);
  const fpById = new Map(footprints.map((f) => [f.company_id, f]));
  const now = ctx.now();

  const drafts: DataRequest[] = [];
  const skipped: Array<{ company_id: string; reason: string }> = [];

  for (const companyId of [...new Set(input.company_ids)]) {
    let target: Target;
    try {
      target = resolveTarget(ctx, companyId);
    } catch (e) {
      skipped.push({ company_id: companyId, reason: (e as Error).message });
      continue;
    }
    const adj = adjustForRetention(input.type, target.company?.retention_rule ?? null);
    const dup = existing.find(
      (r) => r.company_id === companyId && r.type === adj.type && !r.parent_id && !r.cancelled_at && ["draft", "approved", "sent"].includes(r.status),
    );
    if (dup) {
      skipped.push({ company_id: companyId, reason: `An open ${adj.type} request already exists (${dup.id}, ${dup.status}).` });
      continue;
    }
    const fp = fpById.get(companyId);
    const vars = {
      ...baseVars(ctx, settings, lang, target.name),
      account_identifier: input.account_identifier ?? settings.user_email!,
      section_ref: SECTION_REFS[adj.type],
      correction_details: input.correction_details,
      retention_law: retentionLabel(target.company?.retention_rule ?? null),
      last_interaction: fp ? dateOnly(fp.last_interaction) : null,
    };
    let rendered: { subject: string; body: string };
    try {
      rendered = renderOrThrow(lang, adj.type, vars);
    } catch (e) {
      skipped.push({ company_id: companyId, reason: (e as Error).message });
      continue;
    }

    let req: DataRequest = {
      id: randomUUID(),
      company_id: companyId,
      type: adj.type,
      legal_basis: SECTION_REFS[adj.type],
      language: lang,
      body: rendered.body,
      tier: classifyTier(adj.type, target.company),
      status: "draft",
      sent_at: null,
      deadline: null,
      replies: [],
      user_id: ctx.userId,
      company_name: target.name,
      subject: rendered.subject,
      recipient: input.recipient ?? target.recipient,
      created_at: now.toISOString(),
      enforceability: enforceabilityOn(now),
      requested_type: input.type,
      retention_note: adj.reason,
      approved_at: null,
      undo_until: null,
      cancelled_at: null,
      gmail_message_id: null,
      gmail_thread_id: null,
      rfc822_message_id: null,
      calendar_event_id: null,
      source_message_ids: fp?.evidence_message_ids.slice(0, 5) ?? [],
      parent_id: null,
      escalation_level: null,
      sendable: true,
    };
    const autoApprove = req.tier === "auto" && settings.auto_low_risk;
    if (autoApprove) req = approve(req, { now, undoWindowMs: ctx.config.undoWindowMs, auto: true });
    await ctx.store.saveRequest(req);
    await audit(ctx, {
      actor: "agent",
      action: "draft_request",
      approval: autoApprove ? "auto" : null,
      target: req.id,
      details: { company_id: companyId, type: req.type, requested_type: input.type, tier: req.tier, source_message_ids: req.source_message_ids },
    });
    drafts.push(req);
  }

  const counts: Partial<Record<RequestType, number>> = {};
  for (const d of drafts) counts[d.type] = (counts[d.type] ?? 0) + 1;
  return {
    summary: counts,
    switched_to_restrict: drafts.filter((d) => d.type !== d.requested_type).map((d) => ({ id: d.id, company: d.company_name, reason: d.retention_note })),
    drafts: drafts.map(publicDraft),
    skipped,
    next_step:
      "Show each draft to the user with its tier and source email. full_review drafts need the full text shown and approve_request with reviewed: true. " +
      "Drafts without a recipient need the user to supply the company's grievance email.",
  };
}

export function publicDraft(r: DataRequest) {
  return {
    id: r.id,
    company_id: r.company_id,
    company_name: r.company_name,
    type: r.type,
    requested_type: r.requested_type,
    retention_note: r.retention_note,
    tier: r.tier,
    status: r.status,
    language: r.language,
    legal_basis: r.legal_basis,
    enforceability: r.enforceability,
    recipient: r.recipient,
    subject: r.subject,
    body: r.body,
    source_message_ids: r.source_message_ids,
    undo_until: r.undo_until,
    sendable: r.sendable,
    escalation_level: r.escalation_level,
    parent_id: r.parent_id,
  };
}

async function loadRequest(ctx: Ctx, id: string): Promise<DataRequest> {
  const r = await ctx.store.getRequest(ctx.userId, id);
  if (!r) throw new UserFacingError("UNKNOWN_REQUEST", `No request with id ${id}.`);
  return r;
}

type ItemResult = { id: string; ok: boolean; status?: string; undo_until?: string | null; error?: string; message?: string; hint?: string | null };

function failure(id: string, e: unknown): ItemResult {
  if (e instanceof PolicyError || e instanceof UserFacingError) return { id, ok: false, error: e.code, message: e.message, hint: e.hint ?? null };
  throw e;
}

/** Call only after the user explicitly approves. */
export async function approveRequests(ctx: Ctx, input: { request_ids: string[]; reviewed?: boolean; recipient?: string }) {
  if (input.recipient && input.request_ids.length !== 1) {
    throw new UserFacingError("BAD_INPUT", "recipient can only be set when approving a single request.");
  }
  const results: ItemResult[] = [];
  for (const id of input.request_ids) {
    try {
      let req = await loadRequest(ctx, id);
      if (input.recipient) req = { ...req, recipient: input.recipient };
      const next = approve(req, { now: ctx.now(), undoWindowMs: ctx.config.undoWindowMs, reviewed: input.reviewed });
      await ctx.store.saveRequest(next);
      await audit(ctx, { actor: "user", action: "approve_request", approval: "approved", target: id, details: { tier: next.tier, reviewed: !!input.reviewed } });
      results.push({ id, ok: true, status: next.status, undo_until: next.undo_until });
    } catch (e) {
      results.push(failure(id, e));
    }
  }
  return {
    results,
    undo_window_minutes: ctx.config.undoWindowMs / 60000,
    next_step: "Call send_request. full_review requests stay in their undo window until undo_until.",
  };
}

export async function undoRequest(ctx: Ctx, input: { request_id: string }) {
  const req = await loadRequest(ctx, input.request_id);
  const next = undo(req);
  await ctx.store.saveRequest(next);
  await audit(ctx, { actor: "user", action: "undo_request", approval: "undone", target: req.id });
  return { id: req.id, status: next.status, message: "Approval withdrawn. Nothing was sent." };
}

export async function rejectRequest(ctx: Ctx, input: { request_id: string; reason?: string }) {
  const req = await loadRequest(ctx, input.request_id);
  const next = reject(req, ctx.now());
  await ctx.store.saveRequest(next);
  await audit(ctx, { actor: "user", action: "reject_request", approval: "rejected", target: req.id, details: { reason: input.reason ?? null } });
  return { id: req.id, cancelled_at: next.cancelled_at };
}

export async function getRequest(ctx: Ctx, input: { request_id: string }) {
  const req = await loadRequest(ctx, input.request_id);
  return { ...publicDraft(req), sent_at: req.sent_at, deadline: req.deadline, replies: req.replies, cancelled_at: req.cancelled_at };
}

function deadlineDays(req: DataRequest): number | null {
  if (req.escalation_level === "reminder") return null; // the original deadline still applies
  if (req.escalation_level === "grievance_officer") return GRIEVANCE_RESPONSE_DAYS;
  return RESPONSE_DEADLINE_DAYS;
}

/**
 * Sends approved requests whose undo window has passed. With no ids, sends every such request.
 * SEND_MODE=dry_run sends nothing; sandbox redirects every email to SANDBOX_EMAIL.
 */
export async function sendRequests(ctx: Ctx, input: { request_ids?: string[] } = {}) {
  const now = ctx.now();
  const mode = ctx.config.sendMode;
  const all = await ctx.store.listRequests(ctx.userId);
  const candidates = input.request_ids?.length
    ? await Promise.all(input.request_ids.map((id) => loadRequest(ctx, id)))
    : all.filter((r) => r.status === "approved" && !r.sent_at && !r.cancelled_at && r.sendable);

  const sent: Array<{ id: string; company: string; to: string; gmail_message_id: string; deadline: string | null; calendar_event_id: string | null }> = [];
  const pending: Array<{ id: string; company: string; send_after: string }> = [];
  const blocked: ItemResult[] = [];
  const previews: Array<{ id: string; to: string; subject: string; body: string }> = [];
  const warnings: string[] = [];

  for (const req of candidates) {
    const blocker = sendBlocker(req, now);
    if (blocker?.code === "IN_UNDO_WINDOW") {
      pending.push({ id: req.id, company: req.company_name, send_after: req.undo_until! });
      continue;
    }
    if (blocker) {
      blocked.push(failure(req.id, blocker));
      continue;
    }
    const to = mode === "sandbox" ? ctx.config.sandboxEmail! : req.recipient!;
    const subject = mode === "sandbox" ? `[SANDBOX → ${req.recipient}] ${req.subject}` : req.subject;
    if (mode === "dry_run") {
      previews.push({ id: req.id, to, subject, body: req.body });
      continue;
    }
    if (!ctx.sendLimit.tryTake(Date.now())) {
      blocked.push({ id: req.id, ok: false, error: "RATE_LIMITED", message: `Send limit of ${ctx.config.sendLimitPerHour}/hour reached.`, hint: "Try again later." });
      continue;
    }

    // Reminders and same-recipient escalations reply in the original thread.
    const parent = req.parent_id ? all.find((p) => p.id === req.parent_id) : undefined;
    const sameThread = parent && parent.gmail_thread_id && parent.recipient === req.recipient;
    const result = await ctx.gmail.send({
      to,
      subject,
      body: req.body,
      thread_id: sameThread ? parent.gmail_thread_id : null,
      in_reply_to: sameThread ? parent.rfc822_message_id : null,
    });

    const days = deadlineDays(req);
    const deadline = days === null ? null : new Date(now.getTime() + days * DAY_MS).toISOString();
    let calendarId: string | null = null;
    if (deadline) {
      try {
        calendarId = await ctx.calendar.createDeadlineEvent({
          title: `DPDP deadline: ${req.company_name} (${REQUEST_TYPE_LABEL[req.type]})`,
          description:
            `Data Exit request ${req.id}${req.escalation_level ? ` (${req.escalation_level})` : ""} sent ${dateOnly(now)} to ${req.recipient}.\n` +
            `If there is no reply by today, Data Exit will suggest escalating.\n` +
            (ctx.gmail.kind === "google" ? `Email: https://mail.google.com/mail/u/0/#all/${result.id}` : ""),
          date: dateOnly(deadline),
        });
      } catch (e) {
        warnings.push(`Calendar event for ${req.id} failed: ${(e as Error).message}`);
      }
    }

    const next: DataRequest = {
      ...req,
      status: "sent",
      sent_at: now.toISOString(),
      deadline,
      gmail_message_id: result.id,
      gmail_thread_id: result.thread_id,
      rfc822_message_id: result.rfc822_message_id,
      calendar_event_id: calendarId,
    };
    await ctx.store.saveRequest(next);
    await audit(ctx, {
      actor: "agent",
      action: "send_request",
      target: req.id,
      details: { mode, to, intended_recipient: req.recipient, gmail_message_id: result.id, deadline, calendar_event_id: calendarId },
    });
    sent.push({ id: req.id, company: req.company_name, to, gmail_message_id: result.id, deadline, calendar_event_id: calendarId });
  }

  return {
    mode,
    mode_note:
      mode === "dry_run"
        ? "DRY RUN: nothing was sent. Set SEND_MODE=sandbox (with SANDBOX_EMAIL) or live to send."
        : mode === "sandbox"
          ? `SANDBOX: every email went to ${ctx.config.sandboxEmail}, not to the companies.`
          : "LIVE: emails went to the companies.",
    sent,
    pending_undo_window: pending,
    blocked,
    previews,
    warnings,
  };
}

/** Builds an escalation (reminder, grievance officer or DPB complaint) as a new draft linked to the original. */
export async function draftEscalation(ctx: Ctx, parent: DataRequest, level: EscalationLevel, recipient?: string): Promise<DataRequest> {
  const settings = await requireIdentity(ctx, {});
  const company = ctx.directory.get(parent.company_id) ?? null;
  const now = ctx.now();
  const template: TemplateName = level === "reminder" ? "reminder" : `escalation_${level}`;
  const vars = {
    ...baseVars(ctx, settings, parent.language, parent.company_name),
    original_date: parent.sent_at ? dateOnly(parent.sent_at) : dateOnly(parent.created_at),
    reference: parent.rfc822_message_id ?? parent.gmail_message_id ?? parent.id,
  };
  const r = renderOrThrow(parent.language, template, vars);
  const originalHeader = parent.language === "hi" ? "--- मूल अनुरोध" : "--- Original request";
  const body = `${r.body}\n\n${originalHeader} (${vars.original_date}) ---\nSubject: ${parent.subject}\n\n${parent.body}`;

  let tier: Tier;
  if (level === "dpb" || isHighRiskCompany(company)) tier = "full_review";
  else tier = "one_tap";

  const to =
    level === "dpb" ? null : level === "reminder" ? parent.recipient : (recipient ?? company?.grievance_email ?? parent.recipient);

  const child: DataRequest = {
    ...parent,
    id: randomUUID(),
    legal_basis: level === "reminder" ? parent.legal_basis : ESCALATION_SECTION,
    body,
    subject: r.subject,
    tier,
    status: "draft",
    sent_at: null,
    deadline: null,
    replies: [],
    recipient: to,
    created_at: now.toISOString(),
    enforceability: enforceabilityOn(now),
    retention_note: null,
    approved_at: null,
    undo_until: null,
    cancelled_at: null,
    gmail_message_id: null,
    gmail_thread_id: null,
    rfc822_message_id: null,
    calendar_event_id: null,
    parent_id: parent.id,
    escalation_level: level,
    sendable: level !== "dpb",
  };
  await ctx.store.saveRequest(child);
  return child;
}
