// End-to-end over the operations behind every MCP tool, on the fixture mailbox:
// discover → data map → draft (retention check) → approve (tiers, undo window) → send (Gmail + Calendar)
// → replies → overdue → escalation ladder → evidence → digest → audit → delete.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyAuditChain } from "@dataexit/policy";
import { discoverFootprint, getDataMap, checkNewSignups } from "@dataexit/discovery/ops";
import { approveRequests, draftRequests, rejectRequest, sendRequests, undoRequest } from "@dataexit/request-engine/ops";
import { checkReplies, classifyReply, deleteMyData, escalateRequest, exportEvidence, getAuditLog, listRequests, weeklyDigest } from "@dataexit/tracker/ops";
import { FixtureCalendar } from "@dataexit/google";
import { UserFacingError } from "@dataexit/runtime";
import { DAY, MIN, testContext } from "./helpers.js";

const rejectsWith = async (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof UserFacingError && e.code === code);

test("full Person A flow on the fixture inbox", async () => {
  const ctx = await testContext();
  const { clock, fixture } = ctx;

  // ---- Phase 1: discovery ----------------------------------------------------
  const d = await discoverFootprint(ctx);
  assert.equal(d.scanned_messages, 13); // "Weekend plans" does not match a signup phrase
  assert.equal(d.headline.companies, 10); // personal gmail.com sender excluded; Zomato + Blinkit merged
  assert.equal(d.headline.unrecognised, 1);
  assert.equal(d.headline.hold_id_or_bank, 5);
  const fps = await ctx.store.listFootprints(ctx.userId);
  const eternal = fps.find((f) => f.company_id === "eternal")!;
  assert.equal(eternal.message_count, 2);
  assert.deepEqual(eternal.domains.sort(), ["blinkit.com", "zomato.com"]);
  assert.ok(fps.some((f) => f.company_id === "unknown:randomshop.co.in"));
  assert.equal(fps.find((f) => f.company_id === "swiggy")!.message_count, 2);

  // Full re-scan does not double count.
  await discoverFootprint(ctx);
  assert.equal((await ctx.store.listFootprints(ctx.userId)).find((f) => f.company_id === "swiggy")!.message_count, 2);

  // ---- Phase 2: data map --------------------------------------------------------
  const map = await getDataMap(ctx, { limit: 4 });
  assert.equal(map.nodes.length, 4);
  assert.equal(map.others?.count, 6);
  assert.ok(map.nodes[0].sensitivity_score >= map.nodes[1].sensitivity_score);
  assert.ok(map.top_risk_dormant.includes("paytm"));
  assert.ok(!map.top_risk_dormant.includes("hdfc-bank"), "HDFC was used last month");
  assert.match(map.headline_text, /10 companies/);

  // ---- Phase 3: drafting ---------------------------------------------------------
  await rejectsWith(draftRequests(ctx, { company_ids: ["swiggy"], type: "erase" }), "NEED_USER_NAME");
  const targets = ["paytm", "hdfc-bank", "zerodha", "jio", "makemytrip", "practo", "swiggy"];
  const drafted = await draftRequests(ctx, { company_ids: targets, type: "erase", user_name: "Priya Demo" });
  assert.deepEqual(drafted.summary, { restrict: 5, erase: 2 });
  assert.equal(drafted.switched_to_restrict.length, 5);
  const byCo = Object.fromEntries(drafted.drafts.map((x) => [x.company_id, x]));
  assert.equal(byCo["hdfc-bank"].tier, "full_review");
  assert.equal(byCo["zerodha"].tier, "one_tap");
  assert.equal(byCo["makemytrip"].type, "erase");
  assert.equal(byCo["practo"].recipient, "support@practo.example"); // falls back to support email
  assert.deepEqual(byCo["paytm"].source_message_ids, ["m-paytm-1"]);
  assert.match(byCo["paytm"].body, /RBI Master Direction on KYC/);
  assert.match(byCo["paytm"].body, /13 May 2027/); // policy-based wording before Phase III
  assert.doesNotMatch(byCo["paytm"].body, /\{\{/);

  const again = await draftRequests(ctx, { company_ids: ["paytm"], type: "erase" });
  assert.equal(again.drafts.length, 0);
  assert.equal(again.skipped.length, 1);

  // Hindi + auto tier: stop_marketing runs without asking once the user enables it.
  await ctx.store.saveSettings(ctx.userId, { auto_low_risk: true });
  const hi = await draftRequests(ctx, { company_ids: ["flipkart"], type: "stop_marketing", language: "hi" });
  assert.equal(hi.drafts[0].tier, "auto");
  assert.equal(hi.drafts[0].status, "approved");
  assert.match(hi.drafts[0].subject, /मार्केटिंग/);

  // ---- Approvals -------------------------------------------------------------------
  const ids = drafted.drafts.map((x) => x.id);
  const first = await approveRequests(ctx, { request_ids: [byCo["hdfc-bank"].id] });
  assert.equal(first.results[0].error, "REVIEW_REQUIRED");
  const approved = await approveRequests(ctx, { request_ids: ids, reviewed: true });
  assert.ok(approved.results.every((r) => r.ok));

  // Undo window: one_tap goes now, full_review waits 10 minutes.
  const s1 = await sendRequests(ctx);
  const sentNow = s1.sent.map((x) => x.company).sort();
  assert.equal(s1.mode, "live");
  assert.equal(s1.sent.length, 3); // zerodha, jio (one_tap) + flipkart (auto)
  assert.ok(sentNow.some((c) => c.includes("Zerodha")));
  assert.equal(s1.pending_undo_window.length, 5);

  await undoRequest(ctx, { request_id: byCo["swiggy"].id });
  await rejectRequest(ctx, { request_id: byCo["swiggy"].id, reason: "still use it" });

  clock.advance(11 * MIN);
  const s2 = await sendRequests(ctx);
  assert.equal(s2.sent.length, 4); // paytm, hdfc, makemytrip, practo
  assert.equal(s2.blocked.length, 0);
  const cal = new FixtureCalendar(join(ctx.config.dataDir, "fixture-calendar.json")).events();
  assert.equal(cal.length, 7);
  assert.match(cal[0].title, /DPDP deadline/);

  const sentMail = await fixture.search({});
  assert.ok(sentMail.some((m) => m.subject.includes("मार्केटिंग") && m.to === "privacy@flipkart.example"));

  // ---- Phase 4: replies ---------------------------------------------------------------
  const reqs = Object.fromEntries((await ctx.store.listRequests(ctx.userId)).filter((r) => !r.parent_id).map((r) => [r.company_id, r]));
  const reply = (co: string, from: string, body: string) =>
    fixture.inject({ thread_id: reqs[co].gmail_thread_id!, from, subject: `Re: ${reqs[co].subject}`, date: clock.now.toISOString(), body });
  clock.advance(2 * DAY);
  reply("makemytrip", "MMT Privacy <privacy@mmt.example>", "Hi Priya, your account has been deleted successfully.");
  reply("hdfc-bank", "HDFC Grievance <grievance@hdfc.example>", "We regret we cannot erase records; as per RBI KYC directions we are required to retain them for 5 years.");
  reply("practo", "Practo Support <support@practo.example>", "To process this, please upload a copy of your Aadhaar to verify your identity.");
  reply("jio", "Jio Care <grievance@jio.example>", "We have received your request. Ticket number 88231.");
  const zMsg = reply("zerodha", "Zerodha <privacy@zerodha.example>", "Hello, regarding your mail dated last week.");
  reply("flipkart", "Flipkart <privacy@flipkart.example>", "This mailbox is not monitored. Kindly write to grievance.officer@flipkart.example for privacy matters.");

  const checked = await checkReplies(ctx);
  const cls = Object.fromEntries(checked.new_replies.map((r) => [r.company.split(" ")[0], r.classification]));
  assert.equal(cls["MakeMyTrip"], "confirmed");
  assert.equal(cls["HDFC"], "refused_retention");
  assert.equal(cls["Practo"], "id_requested");
  assert.equal(cls["Jio"], "acknowledged");
  assert.equal(cls["Flipkart"], "redirected");
  assert.equal(checked.needs_review.length, 1);
  assert.equal(checked.needs_review[0].message_id, zMsg.id);

  // The agent classifies the unclear one (LLM half of "rules plus LLM").
  await classifyReply(ctx, { request_id: reqs["zerodha"].id, message_id: zMsg.id, classification: "confirmed" });
  const again2 = await checkReplies(ctx);
  assert.equal(again2.new_replies.length, 0, "replies are not processed twice");

  const list = await listRequests(ctx, {});
  const st = Object.fromEntries(list.requests.filter((r) => !r.parent_id).map((r) => [r.company_id, r.status]));
  assert.deepEqual(st, {
    paytm: "sent", "hdfc-bank": "refused_retention", zerodha: "confirmed", jio: "sent", makemytrip: "confirmed",
    practo: "id_requested", flipkart: "redirected",
  });
  // The rejected Swiggy request is hidden unless asked for.
  const withCancelled = await listRequests(ctx, { include_cancelled: true, company_id: "swiggy" });
  assert.equal(withCancelled.requests[0].cancelled, true);
  const flip = list.requests.find((r) => r.company_id === "flipkart")!;
  assert.deepEqual(flip.replies[0].redirect_to, ["grievance.officer@flipkart.example"]);

  // ---- Escalation guards ---------------------------------------------------------------
  await rejectsWith(escalateRequest(ctx, { request_id: reqs["paytm"].id }), "TOO_EARLY");
  await rejectsWith(escalateRequest(ctx, { request_id: reqs["practo"].id }), "ID_REQUESTED");
  await rejectsWith(escalateRequest(ctx, { request_id: reqs["makemytrip"].id }), "ALREADY_RESOLVED");
  await rejectsWith(escalateRequest(ctx, { request_id: reqs["swiggy"].id }), "NOT_SENT");
  // An erase request refused by a bank under RBI KYC is not escalated.
  await ctx.store.saveRequest({ ...reqs["hdfc-bank"], id: "hdfc-erase", type: "erase", status: "refused_retention" });
  await rejectsWith(escalateRequest(ctx, { request_id: "hdfc-erase" }), "RETENTION_REFUSAL");

  // ---- Deadline passes: no_reply → reminder → grievance officer → DPB ------------------
  clock.advance(90 * DAY);
  const overdue = await listRequests(ctx, { overdue_only: true });
  assert.deepEqual(overdue.requests.map((r) => r.company_id).sort(), ["jio", "paytm"]);

  const rem = await escalateRequest(ctx, { request_id: reqs["paytm"].id });
  assert.equal(rem.level, "reminder");
  assert.equal(rem.draft.recipient, "grievance@paytm.example");
  assert.equal(rem.draft.tier, "full_review"); // Paytm is RBI-regulated
  await approveRequests(ctx, { request_ids: [rem.draft.id], reviewed: true });
  clock.advance(11 * MIN);
  const remSent = await sendRequests(ctx, { request_ids: [rem.draft.id] });
  assert.equal(remSent.sent.length, 1);
  const remReq = await ctx.store.getRequest(ctx.userId, rem.draft.id);
  assert.equal(remReq?.gmail_thread_id, reqs["paytm"].gmail_thread_id, "reminder replies in the original thread");
  assert.equal(remReq?.deadline, null);

  await rejectsWith(escalateRequest(ctx, { request_id: reqs["paytm"].id, level: "dpb" }), "GRIEVANCE_FIRST");
  const go = await escalateRequest(ctx, { request_id: reqs["paytm"].id });
  assert.equal(go.level, "grievance_officer");
  assert.match(go.draft.body, /Original request/);
  assert.equal((await ctx.store.getRequest(ctx.userId, reqs["paytm"].id))?.status, "escalated");
  await approveRequests(ctx, { request_ids: [go.draft.id], reviewed: true });
  clock.advance(11 * MIN);
  await sendRequests(ctx, { request_ids: [go.draft.id] });

  clock.advance(91 * DAY);
  const dpb = await escalateRequest(ctx, { request_id: reqs["paytm"].id });
  assert.equal(dpb.level, "dpb");
  assert.equal(dpb.draft.sendable, false);
  assert.equal(dpb.draft.recipient, null);
  await approveRequests(ctx, { request_ids: [dpb.draft.id], reviewed: true });
  clock.advance(11 * MIN);
  const dpbSend = await sendRequests(ctx, { request_ids: [dpb.draft.id] });
  assert.equal(dpbSend.blocked[0].error, "NOT_SENDABLE");

  // ---- Evidence, digest, audit ---------------------------------------------------------
  const ev = await exportEvidence(ctx, { request_id: reqs["paytm"].id });
  assert.ok(existsSync(ev.path));
  assert.equal(ev.audit_chain_intact, true);
  assert.ok(ev.files.includes("timeline.md") && ev.files.includes("audit-chain.json"));
  assert.equal(readFileSync(ev.path).readUInt32LE(0), 0x04034b50);

  const digest = await weeklyDigest(ctx, { days: 400 });
  assert.match(digest.text, /2 confirmed deletion, 1 asked for ID, 1 ignored you\. .*Escalate\?/);
  assert.deepEqual(digest.escalate_candidates.map((x) => x.company), ["Jio (Reliance Jio Infocomm Limited)"]);
  const digestHi = await weeklyDigest(ctx, { language: "hi" });
  assert.match(digestHi.text, /पुष्टि/);

  const log = await getAuditLog(ctx, {});
  assert.equal(log.verification.ok, true);
  assert.ok(log.events.some((e) => e.action === "approve_request" && e.actor === "user" && e.approval === "approved"));
  assert.ok(log.events.some((e) => e.action === "undo_request" && e.approval === "undone"));
  assert.ok(log.events.some((e) => e.action === "draft_request" && e.approval === "auto"));

  // Tampering with the stored log is detected.
  const storePath = join(ctx.config.dataDir, "store.json");
  const raw = JSON.parse(readFileSync(storePath, "utf8"));
  raw.users[ctx.userId].audit[3].details = { forged: true };
  const { writeFileSync } = await import("node:fs");
  writeFileSync(storePath, JSON.stringify(raw));
  assert.equal(verifyAuditChain(await ctx.store.listAudit(ctx.userId)).broken_at, 4);

  // ---- Scheduled re-scan picks up a new signup ------------------------------------------
  fixture.inject({ from: "Zepto <hello@zeptonow.com>", subject: "Welcome to Zepto", date: clock.now.toISOString() });
  clock.advance(MIN);
  const ns = await checkNewSignups(ctx);
  assert.deepEqual(ns.new_signups.map((s) => s.company_id), ["unknown:zeptonow.com"]);

  // ---- Delete everything ---------------------------------------------------------------
  await rejectsWith(deleteMyData(ctx, { confirm: "yes" }), "CONFIRMATION_REQUIRED");
  const del = await deleteMyData(ctx, { confirm: "DELETE" });
  assert.ok(del.deleted.requests > 0 && del.deleted.audit_events > 0);
  assert.ok(del.removed.includes("evidence bundles"));
  assert.equal((await ctx.store.listRequests(ctx.userId)).length, 0);
  await ctx.close();
});

test("send modes: dry_run sends nothing, sandbox redirects every email", async () => {
  for (const mode of ["dry_run", "sandbox"] as const) {
    const ctx = await testContext({ sendMode: mode, sandboxEmail: mode === "sandbox" ? "sandbox@team.example" : null, undoWindowMs: 0 });
    await discoverFootprint(ctx);
    const d = await draftRequests(ctx, { company_ids: ["zerodha"], type: "access", user_name: "Priya Demo" });
    await approveRequests(ctx, { request_ids: [d.drafts[0].id] });
    const s = await sendRequests(ctx);
    const out = await ctx.fixture.search({});
    if (mode === "dry_run") {
      assert.equal(s.sent.length, 0);
      assert.equal(s.previews.length, 1);
      assert.equal((await ctx.store.getRequest(ctx.userId, d.drafts[0].id))?.status, "approved");
      assert.ok(!out.some((m) => m.from_email === "priya.demo@example.com"));
    } else {
      assert.equal(s.sent[0].to, "sandbox@team.example");
      const mail = out.find((m) => m.from_email === "priya.demo@example.com")!;
      assert.equal(mail.to, "sandbox@team.example");
      assert.match(mail.subject, /^\[SANDBOX → privacy@zerodha\.example\]/);
    }
    await ctx.close();
  }
});

test("requests without a grievance contact are blocked until the user gives one", async () => {
  const ctx = await testContext({ undoWindowMs: 0 });
  const d = await draftRequests(ctx, { company_ids: ["nocontact", "unknown:randomshop.co.in", "not-a-company"], type: "access", user_name: "Priya" });
  assert.equal(d.drafts.length, 2);
  assert.equal(d.skipped[0].company_id, "not-a-company");
  await approveRequests(ctx, { request_ids: [d.drafts[0].id] });
  const s = await sendRequests(ctx);
  assert.equal(s.blocked[0].error, "NO_RECIPIENT");
  await rejectsWith(approveRequests(ctx, { request_ids: d.drafts.map((x) => x.id), recipient: "a@b.example" }), "BAD_INPUT");
  await approveRequests(ctx, { request_ids: [d.drafts[1].id], recipient: "privacy@randomshop.example" });
  const s2 = await sendRequests(ctx, { request_ids: [d.drafts[1].id] });
  assert.equal(s2.sent[0].to, "privacy@randomshop.example");
  await ctx.close();
});
