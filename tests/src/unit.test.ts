import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { normalizeSmsSender, parseCsv, registrableDomain, Directory, companiesFromRows, parseCsvObjects } from "@dataexit/directory";
import { buildMime, decodeHeader, encodeHeader, parseAddress, toGmailQuery } from "@dataexit/google";
import { approve, buildAuditEvent, classifyTier, PolicyError, reject, sendBlocker, undo, verifyAuditChain } from "@dataexit/policy";
import { checkScam } from "@dataexit/scam-shield/ops";
import { adjustForRetention, companySensitivity, enforceabilityOn, sensitivityScore, type DataRequest } from "@dataexit/shared";
import { classifyReplyText } from "@dataexit/tracker/classify";
import { createZip } from "@dataexit/tracker/zip";

const now = new Date("2026-11-24T00:00:00Z");

function req(over: Partial<DataRequest> = {}): DataRequest {
  return {
    id: "r1", company_id: "c", type: "erase", legal_basis: "s", language: "en", body: "b", tier: "full_review", status: "draft",
    sent_at: null, deadline: null, replies: [], user_id: "u", company_name: "C", subject: "s", recipient: "x@y.example",
    created_at: now.toISOString(), enforceability: "policy_based", requested_type: "erase", retention_note: null, approved_at: null,
    undo_until: null, cancelled_at: null, gmail_message_id: null, gmail_thread_id: null, rfc822_message_id: null, calendar_event_id: null,
    source_message_ids: [], parent_id: null, escalation_level: null, sendable: true, ...over,
  };
}

test("tiers: base tiers and high-risk sector floor", () => {
  assert.equal(classifyTier("stop_marketing", { sector: "food_delivery", retention_rule: null }), "auto");
  assert.equal(classifyTier("access", { sector: "ecommerce", retention_rule: null }), "one_tap");
  assert.equal(classifyTier("erase", { sector: "ecommerce", retention_rule: null }), "full_review");
  assert.equal(classifyTier("stop_marketing", { sector: "bank", retention_rule: null }), "full_review");
  assert.equal(classifyTier("access", { sector: "fintech", retention_rule: "RBI_KYC|PMLA" }), "full_review");
  assert.equal(classifyTier("restrict", { sector: "broker", retention_rule: "SEBI" }), "one_tap");
});

test("approval: full review, undo window, undo and reject", () => {
  assert.throws(() => approve(req(), { now, undoWindowMs: 600_000 }), (e: PolicyError) => e.code === "REVIEW_REQUIRED");
  assert.throws(() => approve(req({ tier: "one_tap" }), { now, undoWindowMs: 0, auto: true }), (e: PolicyError) => e.code === "AUTO_NOT_ALLOWED");
  const a = approve(req(), { now, undoWindowMs: 600_000, reviewed: true });
  assert.equal(a.status, "approved");
  assert.equal(sendBlocker(a, now)?.code, "IN_UNDO_WINDOW");
  assert.equal(sendBlocker(a, new Date(now.getTime() + 600_000)), null);
  assert.equal(undo(a).status, "draft");
  assert.equal(sendBlocker(reject(a, now), now)?.code, "CANCELLED");
  assert.equal(sendBlocker(approve(req({ tier: "one_tap", recipient: null }), { now, undoWindowMs: 0 }), now)?.code, "NO_RECIPIENT");
  assert.equal(sendBlocker(req({ status: "approved", sendable: false }), now)?.code, "NOT_SENDABLE");
  assert.throws(() => undo(req({ status: "sent", sent_at: now.toISOString() })), (e: PolicyError) => e.code === "ALREADY_SENT");
});

test("audit chain: verifies and detects tampering", () => {
  const e1 = buildAuditEvent("u", null, { actor: "agent", action: "a" }, now);
  const e2 = buildAuditEvent("u", e1, { actor: "user", action: "b", approval: "approved", details: { x: 1 } }, now);
  assert.deepEqual(verifyAuditChain([e1, e2]), { ok: true, broken_at: null, length: 2 });
  assert.equal(verifyAuditChain([e1, { ...e2, details: { x: 2 } }]).broken_at, 2);
  assert.equal(verifyAuditChain([e2]).ok, false);
});

test("retention: erase becomes restrict for KYC/telecom/medical, not for tax", () => {
  assert.equal(adjustForRetention("erase", "RBI_KYC|PMLA").type, "restrict");
  assert.equal(adjustForRetention("erase", "TELECOM").type, "restrict");
  assert.equal(adjustForRetention("erase", "TAX").type, "erase");
  assert.equal(adjustForRetention("access", "RBI_KYC").type, "access");
  assert.equal(enforceabilityOn(now), "policy_based");
  assert.equal(enforceabilityOn(new Date("2027-05-13T12:00:00+05:30")), "statutory");
});

test("sensitivity: level and 0-100 score with dormancy", () => {
  assert.equal(companySensitivity(["contact", "location"]), "med");
  assert.equal(companySensitivity(["contact", "gov_id"]), "high");
  const recent = sensitivityScore({ data_categories: ["contact", "financial", "gov_id"], last_interaction: "2026-11-01", matched: true, now });
  const dormant = sensitivityScore({ data_categories: ["contact", "financial", "gov_id"], last_interaction: "2020-01-01", matched: true, now });
  assert.equal(recent, 69);
  assert.equal(dormant, 89);
  assert.equal(sensitivityScore({ data_categories: [], last_interaction: "2020-01-01", matched: false, now }), 30);
});

test("directory: csv, domains, sms senders, brand merge", () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","he said ""hi"""\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
  assert.equal(registrableDomain("mailer.swiggy.in"), "swiggy.in");
  assert.equal(registrableDomain("alerts.sbi.co.in"), "sbi.co.in");
  assert.equal(normalizeSmsSender("VM-HDFCBK-S"), "HDFCBK");
  assert.equal(normalizeSmsSender("AD-SWIGGY"), "SWIGGY");
  const { companies, issues } = companiesFromRows(
    parseCsvObjects("id,legal_name,brands,domains,data_categories,sector\neternal,Eternal Limited,Zomato|Blinkit,zomato.com|blinkit.com,,food_delivery\nx,X,,,bogus,martian\n"),
  );
  const d = new Directory(companies, issues);
  assert.equal(d.byDomain("noreply.blinkit.com")?.id, "eternal");
  assert.equal(d.byName("blinkit")?.id, "eternal");
  assert.deepEqual(d.get("eternal")?.data_categories, ["contact", "transaction", "location", "behavioural"]);
  assert.ok(issues.some((i) => i.problem.includes("unknown data category")));
  assert.ok(issues.some((i) => i.problem.includes("unknown sector")));
});

test("mime: UTF-8 subject and body round trip", () => {
  const subject = "डेटा मिटाने का अनुरोध – Priya";
  assert.equal(decodeHeader(encodeHeader(subject)), subject);
  assert.equal(encodeHeader("Plain"), "Plain");
  const mime = buildMime({ to: "a@b.example", subject, body: "नमस्ते\nline 2", inReplyTo: "<x@y>" });
  assert.match(mime, /In-Reply-To: <x@y>/);
  const body = mime.split("\r\n\r\n")[1].replace(/\r\n/g, "");
  assert.equal(Buffer.from(body, "base64").toString("utf8"), "नमस्ते\r\nline 2");
  assert.deepEqual(parseAddress('"Swiggy" <NoReply@Swiggy.in>'), { name: "Swiggy", email: "noreply@swiggy.in", domain: "swiggy.in" });
  assert.equal(
    toGmailQuery({ subject_any: ["welcome", "your order"], after: new Date("2020-01-05T00:00:00Z"), exclude_sent: true }),
    'subject:(welcome OR "your order") after:2020/1/5 -in:sent -in:chats',
  );
});

test("reply classifier", () => {
  assert.equal(classifyReplyText("Your account has been deleted successfully.").kind, "confirmed");
  assert.equal(classifyReplyText("Please upload a copy of your Aadhaar to verify your identity.").kind, "id_requested");
  assert.equal(classifyReplyText("We regret we cannot delete your data as per RBI KYC directions we are required to retain records.").kind, "refused_retention");
  assert.equal(classifyReplyText("We have closed your account. Records required by law to retain under PMLA are kept for 5 years.").kind, "confirmed");
  const r = classifyReplyText("This mailbox is not monitored. Kindly write to dpo@shop.example.", ["me@example.com"]);
  assert.equal(r.kind, "redirected");
  assert.deepEqual(r.redirect_to, ["dpo@shop.example"]);
  assert.equal(classifyReplyText("We have received your request. Ticket number 4521.").kind, "acknowledged");
  assert.equal(classifyReplyText("Hello, regarding your mail").kind, "unclear");
});

test("scam shield: English, Hinglish, Hindi, links, after-fraud", () => {
  const kyc = checkScam({ text: "Dear customer your SBI KYC has expired, account will be blocked today. Update now: http://sbi-kyc-update.xyz/login" });
  assert.equal(kyc.verdict, "scam");
  assert.ok(kyc.flags.some((f) => f.id === "lookalike_domain"));
  assert.match(kyc.reply_text, /never ask for your OTP/);

  const hinglish = checkScam({ text: "Sir galti se 5000 bhej diye aapko, please wapas kar do, collect request bheji hai, PIN daalo" });
  assert.ok(["scam", "likely_scam"].includes(hinglish.verdict));

  const hindi = checkScam({ text: "आपका बिजली कनेक्शन आज रात बंद हो जाएगा। तुरंत इस नंबर पर ओटीपी बताएं।" });
  assert.equal(hindi.language, "hi");
  assert.ok(hindi.flags.some((f) => f.id === "asks_otp"));
  assert.match(hindi.reply_text, /OTP, PIN या आधार/);

  const lost = checkScam({ text: "I paid them 20000 for the parcel customs fee and money debited, now they say CBI case" });
  assert.equal(lost.lost_money, true);
  assert.match(lost.next_steps[0], /1930/);

  const benign = checkScam({ text: "Hi, are we still meeting for lunch tomorrow?" });
  assert.equal(benign.verdict, "no_red_flags");
  assert.ok(!/safe/i.test(benign.verdict));
});

test("zip: valid structure with deflated entries", () => {
  const zip = createZip([{ name: "a.txt", data: "hello" }, { name: "dir/हिंदी.txt", data: "नमस्ते" }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  const eocd = zip.subarray(zip.length - 22);
  assert.equal(eocd.readUInt32LE(0), 0x06054b50);
  assert.equal(eocd.readUInt16LE(10), 2);
  const nameLen = zip.readUInt16LE(26);
  const compLen = zip.readUInt32LE(18);
  assert.equal(inflateRawSync(zip.subarray(30 + nameLen, 30 + nameLen + compLen)).toString(), "hello");
});
