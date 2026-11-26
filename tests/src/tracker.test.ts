// Tracker edge cases the end-to-end flow does not reach: redirects, escalation outcomes rolling up
// to the original request, classify_reply validation, and next_action for the UI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverFootprint } from "@dataexit/discovery/ops";
import { approveRequests, draftRequests, sendRequests } from "@dataexit/request-engine/ops";
import { checkReplies, classifyReply, escalateRequest, listRequests, weeklyDigest } from "@dataexit/tracker/ops";
import { UserFacingError } from "@dataexit/runtime";
import { DAY, MIN, testContext } from "./helpers.js";

const rejectsWith = async (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof UserFacingError && e.code === code);

test("tracker: redirects, escalation roll-up, reply validation, next_action", async () => {
  const ctx = await testContext();
  const { clock, fixture } = ctx;

  await discoverFootprint(ctx);
  const drafted = await draftRequests(ctx, { company_ids: ["swiggy", "flipkart", "makemytrip"], type: "erase", user_name: "Priya Demo" });
  await approveRequests(ctx, { request_ids: drafted.drafts.map((d) => d.id), reviewed: true });
  clock.advance(11 * MIN);
  assert.equal((await sendRequests(ctx)).sent.length, 3);

  const roots = async () =>
    Object.fromEntries((await listRequests(ctx, {})).requests.filter((r) => !r.parent_id).map((r) => [r.company_id, r]));
  const sentAt = (await roots())["swiggy"].sent_at!;

  // Freshly sent: wait for the 30-day reminder point.
  const fresh = (await roots())["swiggy"].next_action;
  assert.equal(fresh?.action, "wait");
  assert.equal(fresh?.action === "wait" && fresh.until?.slice(0, 10), new Date(new Date(sentAt).getTime() + 30 * DAY).toISOString().slice(0, 10));

  const req = Object.fromEntries((await ctx.store.listRequests(ctx.userId)).map((r) => [r.company_id, r]));
  const reply = (co: string, from: string, body: string, thread = req[co].gmail_thread_id!) =>
    fixture.inject({ thread_id: thread, from, subject: `Re: ${req[co].subject}`, date: clock.now.toISOString(), body });

  // ---- Redirect: skip the reminder, write to the address the company gave ---------------
  clock.advance(DAY);
  reply("flipkart", "Flipkart <privacy@flipkart.example>", "This mailbox is not monitored. Kindly write to dpo@flipkart.example for privacy matters.");
  const swiggyMsg = reply("swiggy", "Swiggy <grievance@swiggy.example>", "Hello, about your mail.");
  const checked = await checkReplies(ctx);
  assert.deepEqual(checked.new_replies.map((r) => r.classification), ["redirected"]);
  assert.deepEqual((await roots())["flipkart"].next_action, { action: "escalate", level: "grievance_officer" });

  const redirectEsc = await escalateRequest(ctx, { request_id: req["flipkart"].id });
  assert.equal(redirectEsc.level, "grievance_officer");
  assert.equal(redirectEsc.recipient_source, "company_reply");
  assert.equal(redirectEsc.draft.recipient, "dpo@flipkart.example");
  const fk = (await roots())["flipkart"];
  assert.equal(fk.status, "escalated");
  assert.deepEqual(fk.next_action, { action: "approve", request_id: redirectEsc.draft.id, level: "grievance_officer" });

  // ---- classify_reply checks the message belongs to the request ------------------------
  const mmtOwn = req["makemytrip"].gmail_message_id!;
  await rejectsWith(classifyReply(ctx, { request_id: req["swiggy"].id, message_id: mmtOwn, classification: "confirmed" }), "UNKNOWN_MESSAGE");
  await rejectsWith(classifyReply(ctx, { request_id: req["swiggy"].id, message_id: req["swiggy"].gmail_message_id!, classification: "confirmed" }), "NOT_A_REPLY");
  await rejectsWith(classifyReply(ctx, { request_id: req["swiggy"].id, message_id: swiggyMsg.id, classification: "redirected" }), "BAD_INPUT");
  clock.advance(3 * DAY);
  await classifyReply(ctx, { request_id: req["swiggy"].id, message_id: swiggyMsg.id, classification: "acknowledged" });
  const sw = (await roots())["swiggy"];
  assert.equal(sw.status, "sent", "an acknowledgement changes nothing");
  const msgDate = (await ctx.gmail.getThread(req["swiggy"].gmail_thread_id!)).find((m) => m.id === swiggyMsg.id)!.date;
  assert.equal(sw.replies[0].received_at, msgDate, "recorded with the message's date, not the time of classification");

  // ---- Grievance officer (own thread) confirms → the original is resolved ----------------
  clock.advance(90 * DAY);
  assert.deepEqual((await roots())["makemytrip"].next_action, { action: "escalate", level: "reminder" });
  const go = await escalateRequest(ctx, { request_id: req["makemytrip"].id, level: "grievance_officer", recipient: "go@mmt.example" });
  assert.equal(go.recipient_source, "user");
  await approveRequests(ctx, { request_ids: [go.draft.id], reviewed: true });
  clock.advance(11 * MIN);
  await sendRequests(ctx, { request_ids: [go.draft.id] });
  const goReq = (await ctx.store.getRequest(ctx.userId, go.draft.id))!;
  assert.notEqual(goReq.gmail_thread_id, req["makemytrip"].gmail_thread_id, "a different recipient starts its own thread");
  assert.equal((await roots())["makemytrip"].next_action?.action, "wait");

  clock.advance(5 * DAY);
  reply("makemytrip", "MMT Grievance <go@mmt.example>", "Your account has been deleted successfully.", goReq.gmail_thread_id!);
  const c2 = await checkReplies(ctx);
  assert.deepEqual(c2.new_replies.map((r) => [r.request_id, r.classification]), [[go.draft.id, "confirmed"]]);
  const mmt = (await roots())["makemytrip"];
  assert.equal(mmt.status, "confirmed");
  assert.deepEqual(mmt.next_action, { action: "none" });
  await rejectsWith(escalateRequest(ctx, { request_id: req["makemytrip"].id }), "ALREADY_RESOLVED");
  await rejectsWith(escalateRequest(ctx, { request_id: go.draft.id, level: "dpb" }), "ALREADY_RESOLVED");

  const digest = await weeklyDigest(ctx, { days: 7 });
  assert.equal(digest.counts.confirmed, 1);
  assert.deepEqual(digest.replies.map((r) => [r.request_id, r.to, r.classification]), [[req["makemytrip"].id, "grievance_officer", "confirmed"]]);

  const log = await ctx.store.listAudit(ctx.userId);
  assert.ok(log.some((e) => e.action === "status_change" && e.target === req["makemytrip"].id && (e.details as { to?: string }).to === "confirmed"));
  await ctx.close();
});
