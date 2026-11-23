import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verifyAuditChain } from "@dataexit/policy";
import { draftEscalation, publicDraft } from "@dataexit/request-engine/ops";
import { audit, UserFacingError, type Ctx } from "@dataexit/runtime";
import {
  DAY_MS,
  REMINDER_AFTER_DAYS,
  retentionConvertsErase,
  type DataRequest,
  type EscalationLevel,
  type Language,
  type Reply,
  type RequestStatus,
} from "@dataexit/shared";
import { classifyReplyText } from "./classify.js";
import { createZip } from "./zip.js";

const CONCLUSIVE: ReadonlySet<RequestStatus> = new Set(["confirmed", "id_requested", "refused_retention", "redirected"]);
const TRACKED: ReadonlySet<RequestStatus> = new Set(["sent", "id_requested", "refused_retention", "redirected", "no_reply", "escalated"]);

/** confirmed wins; otherwise the latest classified reply decides; acknowledgements ("sent") change nothing. */
export function statusFromReplies(current: RequestStatus, replies: Reply[]): RequestStatus {
  if (replies.some((r) => r.classification === "confirmed")) return "confirmed";
  const latest = [...replies].reverse().find((r) => r.classification !== "sent");
  if (!latest) return current;
  return current === "escalated" && latest.classification !== "confirmed" ? "escalated" : latest.classification;
}

function daysLeft(r: DataRequest, now: Date): number | null {
  return r.deadline ? Math.ceil((new Date(r.deadline).getTime() - now.getTime()) / DAY_MS) : null;
}

/** Marks sent requests past their deadline with no conclusive reply as no_reply. */
export async function refreshOverdue(ctx: Ctx): Promise<DataRequest[]> {
  const now = ctx.now();
  const changed: DataRequest[] = [];
  for (const r of await ctx.store.listRequests(ctx.userId)) {
    if (r.status !== "sent" || !r.deadline || new Date(r.deadline) > now) continue;
    if (r.replies.some((x) => CONCLUSIVE.has(x.classification))) continue;
    const next = { ...r, status: "no_reply" as const };
    await ctx.store.saveRequest(next);
    await audit(ctx, { actor: "agent", action: "status_change", target: r.id, details: { from: r.status, to: "no_reply", reason: "deadline passed" } });
    changed.push(next);
  }
  return changed;
}

export async function listRequests(
  ctx: Ctx,
  input: { status?: RequestStatus; company_id?: string; overdue_only?: boolean; include_cancelled?: boolean } = {},
) {
  await refreshOverdue(ctx);
  const now = ctx.now();
  const rows = (await ctx.store.listRequests(ctx.userId))
    .filter((r) => input.include_cancelled || !r.cancelled_at)
    .filter((r) => !input.status || r.status === input.status)
    .filter((r) => !input.company_id || r.company_id === input.company_id)
    .filter((r) => !input.overdue_only || r.status === "no_reply")
    .map((r) => ({
      id: r.id,
      company_id: r.company_id,
      company_name: r.company_name,
      type: r.type,
      tier: r.tier,
      status: r.status,
      escalation_level: r.escalation_level,
      parent_id: r.parent_id,
      recipient: r.recipient,
      sent_at: r.sent_at,
      deadline: r.deadline,
      days_left: daysLeft(r, now),
      replies: r.replies,
      undo_until: r.undo_until,
      cancelled: !!r.cancelled_at,
    }));
  const by_status: Record<string, number> = {};
  for (const r of rows) by_status[r.status] = (by_status[r.status] ?? 0) + 1;
  return { count: rows.length, by_status, requests: rows };
}

async function recordReply(
  ctx: Ctx,
  req: DataRequest,
  reply: Reply,
): Promise<DataRequest> {
  if (req.replies.some((r) => r.message_id === reply.message_id)) return req;
  const replies = [...req.replies, reply].sort((a, b) => a.received_at.localeCompare(b.received_at));
  const status = statusFromReplies(req.status, replies);
  const next = { ...req, replies, status };
  await ctx.store.saveRequest(next);
  await audit(ctx, {
    actor: "agent",
    action: "classify_reply",
    target: req.id,
    details: { message_id: reply.message_id, classification: reply.classification, by: reply.classified_by, from: req.status, to: status },
  });
  return next;
}

/** Reads new replies in each request's Gmail thread, classifies them by rules and updates statuses. */
export async function checkReplies(ctx: Ctx, input: { request_ids?: string[] } = {}) {
  const me = await ctx.gmail.userEmail();
  const all = await ctx.store.listRequests(ctx.userId);
  const byId = new Map(all.map((r) => [r.id, r]));
  const candidates = all.filter((r) => {
    if (input.request_ids?.length && !input.request_ids.includes(r.id)) return false;
    if (!r.gmail_thread_id || r.cancelled_at || !TRACKED.has(r.status)) return false;
    // Children replying in the parent's thread are tracked on the parent.
    const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
    return !(parent && parent.gmail_thread_id === r.gmail_thread_id);
  });

  const updates: Array<{ request_id: string; company: string; message_id: string; classification: string; redirect_to?: string[] }> = [];
  const needs_review: Array<{ request_id: string; company: string; message_id: string; received_at: string; excerpt: string }> = [];

  for (let req of candidates) {
    const thread = await ctx.gmail.getThread(req.gmail_thread_id!);
    const known = new Set(req.replies.map((r) => r.message_id));
    for (const m of thread) {
      if (m.from_email === me || known.has(m.id) || (req.sent_at && m.date < req.sent_at)) continue;
      if (m.id === req.gmail_message_id) continue;
      // Body is read transiently for classification and never stored.
      const text = await ctx.gmail.getBodyText(m.id);
      const c = classifyReplyText(text, [me]);
      if (c.kind === "unclear") {
        needs_review.push({ request_id: req.id, company: req.company_name, message_id: m.id, received_at: m.date, excerpt: text.slice(0, 600) });
        continue;
      }
      req = await recordReply(ctx, req, {
        message_id: m.id,
        received_at: m.date,
        classification: c.status ?? "sent",
        classified_by: "rules",
        ...(c.redirect_to.length ? { redirect_to: c.redirect_to } : {}),
      });
      updates.push({ request_id: req.id, company: req.company_name, message_id: m.id, classification: c.kind, ...(c.redirect_to.length ? { redirect_to: c.redirect_to } : {}) });
    }
  }
  const overdue = await refreshOverdue(ctx);
  return {
    checked_requests: candidates.length,
    new_replies: updates,
    needs_review,
    newly_overdue: overdue.map((r) => ({ request_id: r.id, company: r.company_name, deadline: r.deadline })),
    next_step: needs_review.length
      ? "Read each needs_review excerpt and call classify_reply with request_id, message_id and your classification. Do not quote ID numbers back."
      : null,
  };
}

/**
 * Classifies reply text. With request_id + message_id the result is recorded on the request;
 * pass classification to record the agent's own judgement when the rules say "unclear".
 */
export async function classifyReply(
  ctx: Ctx,
  input: { text?: string; request_id?: string; message_id?: string; classification?: "confirmed" | "id_requested" | "refused_retention" | "redirected" | "acknowledged"; redirect_to?: string[] },
) {
  const rules = input.text ? classifyReplyText(input.text, [await ctx.gmail.userEmail()]) : null;
  if (!input.request_id) {
    if (!rules) throw new UserFacingError("BAD_INPUT", "Give text to classify, or request_id + message_id to record a classification.");
    return { classification: rules.kind, matched_rule: rules.matched, redirect_to: rules.redirect_to };
  }
  if (!input.message_id) throw new UserFacingError("BAD_INPUT", "message_id is required with request_id.");
  const req = await ctx.store.getRequest(ctx.userId, input.request_id);
  if (!req) throw new UserFacingError("UNKNOWN_REQUEST", `No request with id ${input.request_id}.`);
  const kind = input.classification ?? rules?.kind;
  if (!kind || kind === "unclear") {
    throw new UserFacingError("UNCLEAR", "The rules could not classify this reply.", "Read it and pass classification explicitly.");
  }
  const redirect = input.redirect_to ?? rules?.redirect_to ?? [];
  const next = await recordReply(ctx, req, {
    message_id: input.message_id,
    received_at: ctx.now().toISOString(),
    classification: kind === "acknowledged" ? "sent" : kind,
    classified_by: input.classification ? "agent" : "rules",
    ...(kind === "redirected" && redirect.length ? { redirect_to: redirect } : {}),
  });
  return { request_id: next.id, status: next.status, classification: kind };
}

const LADDER: EscalationLevel[] = ["reminder", "grievance_officer", "dpb"];

/** Next step on the ladder: reminder → grievance officer → DPB complaint draft. Creates a draft for approval. */
export async function escalateRequest(ctx: Ctx, input: { request_id: string; level?: EscalationLevel; recipient?: string }) {
  const now = ctx.now();
  await refreshOverdue(ctx);
  const all = await ctx.store.listRequests(ctx.userId);
  let root = all.find((r) => r.id === input.request_id);
  if (!root) throw new UserFacingError("UNKNOWN_REQUEST", `No request with id ${input.request_id}.`);
  if (root.parent_id) root = all.find((r) => r.id === root!.parent_id) ?? root;
  if (!root.sent_at) throw new UserFacingError("NOT_SENT", "Only sent requests can be escalated.");
  if (root.status === "confirmed") throw new UserFacingError("ALREADY_RESOLVED", `${root.company_name} already confirmed this request.`);
  if (root.status === "id_requested") {
    throw new UserFacingError(
      "ID_REQUESTED",
      `${root.company_name} asked for identity verification.`,
      "Guide the user: they may verify through the company's official app or website. Data Exit never sends ID documents. Do not escalate yet.",
    );
  }
  const company = ctx.directory.get(root.company_id);
  if (root.status === "refused_retention" && root.type === "erase" && retentionConvertsErase(company?.retention_rule ?? null)) {
    throw new UserFacingError(
      "RETENTION_REFUSAL",
      `${root.company_name} cited a legal duty to keep the data, which is valid for this company.`,
      "Do not escalate. Offer a restrict-use request instead (draft_request with type=restrict).",
    );
  }

  const children = all.filter((r) => r.parent_id === root!.id && !r.cancelled_at);
  const sentLevels = new Set(children.filter((c) => c.sent_at).map((c) => c.escalation_level));
  const level = input.level ?? LADDER.find((l) => !sentLevels.has(l)) ?? "dpb";
  const pendingDraft = children.find((c) => c.escalation_level === level && !c.sent_at);
  if (pendingDraft) return { level, draft: publicDraft(pendingDraft), note: "An escalation draft at this level already exists." };

  const overdue = root.status === "no_reply" || (!!root.deadline && new Date(root.deadline) < now);
  if (level === "reminder") {
    const due = new Date(root.sent_at).getTime() + REMINDER_AFTER_DAYS * DAY_MS;
    if (now.getTime() < due && !overdue) {
      throw new UserFacingError("TOO_EARLY", `A reminder is due from ${new Date(due).toISOString().slice(0, 10)}.`);
    }
  }
  if (level === "grievance_officer" && !overdue && !["refused_retention", "no_reply", "redirected"].includes(root.status)) {
    throw new UserFacingError("TOO_EARLY", `The company has until ${root.deadline?.slice(0, 10)} to respond.`);
  }
  if (level === "dpb") {
    const go = children.find((c) => c.escalation_level === "grievance_officer" && c.sent_at);
    const goDone = go && (go.status === "no_reply" || go.status === "refused_retention" || (go.deadline && new Date(go.deadline) < now));
    if (!goDone) {
      throw new UserFacingError(
        "GRIEVANCE_FIRST",
        "A Data Protection Board complaint comes after the Grievance Officer has had the prescribed time to respond.",
        go ? `Wait until ${go.deadline?.slice(0, 10)}.` : "Escalate to the grievance officer first.",
      );
    }
  }

  const child = await draftEscalation(ctx, root, level, input.recipient);
  if (level !== "reminder" && root.status !== "escalated") {
    await ctx.store.saveRequest({ ...root, status: "escalated" });
  }
  await audit(ctx, { actor: "agent", action: "escalate_request", target: root.id, details: { level, escalation_id: child.id } });
  return {
    level,
    draft: publicDraft(child),
    note:
      level === "dpb"
        ? "This is a complaint draft for the user to review and file personally with the Data Protection Board. It cannot be sent by Data Exit."
        : "Show the draft to the user; it goes through approve_request and send_request like any request.",
  };
}

/** Evidence bundle (ZIP): requests, timeline, Gmail message ids, sent texts and the verified audit chain. */
export async function exportEvidence(ctx: Ctx, input: { request_id: string }) {
  const all = await ctx.store.listRequests(ctx.userId);
  const first = all.find((r) => r.id === input.request_id);
  if (!first) throw new UserFacingError("UNKNOWN_REQUEST", `No request with id ${input.request_id}.`);
  const root = first.parent_id ? (all.find((r) => r.id === first.parent_id) ?? first) : first;
  const family = [root, ...all.filter((r) => r.parent_id === root.id)];
  const ids = new Set(family.map((r) => r.id));
  const chain = await ctx.store.listAudit(ctx.userId);
  const verification = verifyAuditChain(chain);
  const events = chain.filter((e) => e.target && ids.has(e.target));

  const gmailLink = (id: string) => (ctx.gmail.kind === "google" ? `https://mail.google.com/mail/u/0/#all/${id}` : `(fixture) ${id}`);
  const timeline = [
    `# Evidence: ${root.company_name}`,
    "",
    `Generated ${ctx.now().toISOString()} by Data Exit. Audit chain intact: ${verification.ok ? "yes" : `NO (broken at event ${verification.broken_at})`}.`,
    "",
    "| When | Event | Details |",
    "| --- | --- | --- |",
    ...events.map((e) => `| ${e.timestamp} | ${e.action}${e.approval ? ` (${e.approval})` : ""} | ${e.actor}; ${JSON.stringify(e.details).replace(/\|/g, "/")} |`),
    ...family.flatMap((r) => r.replies.map((x) => `| ${x.received_at} | reply: ${x.classification} | message ${x.message_id} |`)),
  ].join("\n");
  const messages = [
    "# Gmail messages",
    "",
    ...family.flatMap((r) => [
      `## ${r.escalation_level ?? "request"} (${r.type}) – ${r.id}`,
      r.gmail_message_id ? `- Sent: ${gmailLink(r.gmail_message_id)} on ${r.sent_at}` : "- Not sent",
      ...r.source_message_ids.map((m) => `- Source email: ${gmailLink(m)}`),
      ...r.replies.map((x) => `- Reply (${x.classification}): ${gmailLink(x.message_id)} on ${x.received_at}`),
      "",
    ]),
  ].join("\n");

  const files = [
    {
      name: "README.txt",
      data:
        "Data Exit evidence bundle.\n\nrequests.json: the requests and escalations.\ntimeline.md: what happened when.\n" +
        "messages.md: Gmail message ids and links.\nsent/: the exact text sent.\naudit-chain.json: the full hash-chained audit log; " +
        "verification.json shows whether it is intact (sha256(prev_hash + canonical JSON of each event)).\n" +
        "Company replies are referenced by Gmail id, not copied: Data Exit does not store email bodies.\n",
    },
    { name: "requests.json", data: JSON.stringify(family, null, 2) },
    { name: "timeline.md", data: timeline },
    { name: "messages.md", data: messages },
    ...family.map((r) => ({ name: `sent/${r.escalation_level ?? "request"}-${r.id}.txt`, data: `To: ${r.recipient ?? "(user files personally)"}\nSubject: ${r.subject}\n\n${r.body}\n` })),
    { name: "audit-chain.json", data: JSON.stringify(chain, null, 2) },
    { name: "verification.json", data: JSON.stringify(verification, null, 2) },
  ];
  const dir = join(ctx.config.dataDir, "evidence");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `evidence-${root.company_id.replace(/[^a-z0-9-]/gi, "_")}-${ctx.now().toISOString().slice(0, 10)}.zip`);
  writeFileSync(path, createZip(files, ctx.now()));
  await audit(ctx, { actor: "user", action: "export_evidence", target: root.id, details: { file: path } });
  return { path, files: files.map((f) => f.name), audit_chain_intact: verification.ok, events: events.length };
}

export async function weeklyDigest(ctx: Ctx, input: { days?: number; language?: Language } = {}) {
  await refreshOverdue(ctx);
  const now = ctx.now();
  const days = input.days ?? 7;
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const soon = new Date(now.getTime() + 14 * DAY_MS).toISOString();
  const settings = await ctx.store.getSettings(ctx.userId);
  const lang = input.language ?? settings.language;
  const [requests, footprints] = await Promise.all([ctx.store.listRequests(ctx.userId), ctx.store.listFootprints(ctx.userId)]);
  const live = requests.filter((r) => !r.cancelled_at && !r.parent_id);

  const count = (s: RequestStatus) => live.filter((r) => r.status === s).length;
  const newSignups = footprints.filter((f) => f.first_seen >= since).map((f) => ({ company_id: f.company_id, name: f.display_name, first_seen: f.first_seen }));
  const recentReplies = live.flatMap((r) =>
    r.replies.filter((x) => x.received_at >= since).map((x) => ({ request_id: r.id, company: r.company_name, classification: x.classification, received_at: x.received_at })),
  );
  const upcoming = live
    .filter((r) => r.status === "sent" && r.deadline && r.deadline >= now.toISOString() && r.deadline <= soon)
    .map((r) => ({ request_id: r.id, company: r.company_name, deadline: r.deadline }));
  const escalate = live.filter((r) => r.status === "no_reply").map((r) => ({ request_id: r.id, company: r.company_name }));
  const awaiting = requests.filter((r) => !r.cancelled_at && (r.status === "draft" || r.status === "approved") && !r.sent_at).length;

  const c = { confirmed: count("confirmed"), id: count("id_requested"), ignored: escalate.length, refused: count("refused_retention") };
  const text =
    lang === "hi"
      ? `${c.confirmed} ने हटाने की पुष्टि की, ${c.id} ने पहचान माँगी, ${c.ignored} ने जवाब नहीं दिया।` +
        (c.refused ? ` ${c.refused} ने कानूनी कारण से डेटा रखा।` : "") +
        (newSignups.length ? ` इस हफ़्ते ${newSignups.length} नए साइनअप।` : "") +
        (escalate.length ? " शिकायत आगे बढ़ाएँ?" : "")
      : `${c.confirmed} confirmed deletion, ${c.id} asked for ID, ${c.ignored} ignored you.` +
        (c.refused ? ` ${c.refused} kept data citing a legal duty.` : "") +
        (newSignups.length ? ` ${newSignups.length} new signup${newSignups.length === 1 ? "" : "s"} this week.` : "") +
        (escalate.length ? " Escalate?" : "");

  return {
    period: { from: since, to: now.toISOString() },
    text,
    counts: { ...c, open: count("sent") + count("escalated"), awaiting_approval_or_send: awaiting },
    new_signups: newSignups,
    replies: recentReplies,
    upcoming_deadlines: upcoming,
    escalate_candidates: escalate,
  };
}

export async function getAuditLog(ctx: Ctx, input: { target?: string; limit?: number } = {}) {
  const chain = await ctx.store.listAudit(ctx.userId);
  const verification = verifyAuditChain(chain);
  const events = chain.filter((e) => !input.target || e.target === input.target).slice(-(input.limit ?? 100));
  return { verification, total: chain.length, events };
}

/** One-click "delete everything Data Exit holds about me". */
export async function deleteMyData(ctx: Ctx, input: { confirm: string; disconnect_google?: boolean }) {
  if (input.confirm !== "DELETE") {
    throw new UserFacingError("CONFIRMATION_REQUIRED", 'Pass confirm: "DELETE" after the user confirms.', "This cannot be undone.");
  }
  const counts = await ctx.store.deleteUser(ctx.userId);
  const removed: string[] = [];
  const evidence = join(ctx.config.dataDir, "evidence");
  if (existsSync(evidence)) {
    rmSync(evidence, { recursive: true, force: true });
    removed.push("evidence bundles");
  }
  if (input.disconnect_google !== false && existsSync(ctx.config.google.tokenPath)) {
    rmSync(ctx.config.google.tokenPath, { force: true });
    removed.push("Google sign-in token");
  }
  ctx.log.info("user data deleted", { user: ctx.userId });
  return {
    deleted: counts,
    removed,
    note:
      "Data Exit's copy is gone. Emails already sent stay in the user's Gmail Sent folder, and calendar events stay in their calendar. " +
      (removed.includes("Google sign-in token") ? "Also remove Data Exit at myaccount.google.com/permissions to revoke access fully." : ""),
  };
}
