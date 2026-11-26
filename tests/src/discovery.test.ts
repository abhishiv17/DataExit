// Discovery must be driven by what Gmail messages say: signups, welcome mails and OTPs prove an account,
// orders/payments/statements prove use, and marketing proves neither.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifySubject, discoverFootprint, getDataMap, maskSubject } from "@dataexit/discovery/ops";
import { testContext, ROOT } from "./helpers.js";

test("subject classifier: OTP, signup, welcome, account, receipt; marketing ignored", () => {
  const cases: Array<[string, string | null]> = [
    ["482913 is your OTP for Paytm login", "otp"],
    ["Your one-time password for Bajaj Finserv", "otp"],
    ["Use 551203 to sign in to CRED", "otp"],
    ["Your verification code is 7781", "otp"],
    ["Verify your email address for Moj", "signup"],
    ["Thanks for signing up with Zepto", "signup"],
    ["Confirm your mobile number", "signup"],
    ["Welcome to HSBC India, Priya!", "welcome"],
    ["Reset your password", "account"],
    ["Your KYC is complete", "account"],
    ["Bank of Baroda: account statement for Jul 2023", "account"],
    ["Sharekhan: contract note for 08-09-2021", "account"],
    ["Your Pepperfry order #48213 has been shipped", "receipt"],
    ["Your Zepto order #9921 was delivered", "receipt"],
    ["OneCard: payment of Rs 1499 successful", "receipt"],
    ["Booking confirmed - Delhi to Goa", "receipt"],
    ["Transaction alert for your HDFC Bank account", "receipt"],
    ["PokerBaazi: Rs 424 added to your wallet", "receipt"],
    ["Rs 2,000 debited from your account", "receipt"],
    ["Zepto: offers picked for you", null],
    ["Priya, we miss you at IRCTC", null],
    ["What's new on CRED this week", null],
    ["Weekend plans with Swiggy One", null],
    ["Hotpot recipes for winter", null],
    ["Order now and get 50% off!", null],
    ["Order Confirmed: Your order for boAt Earphones", "receipt"],
    ["Your order from Meghana Foods", "receipt"],
    ["Your Tata CLiQ order #4410 has been shipped", "receipt"],
  ];
  for (const [subject, kind] of cases) assert.equal(classifySubject(subject), kind, subject);
  assert.equal(maskSubject("482913 is your OTP"), "•••••• is your OTP");
});

test("Person B's demo inbox: every company found, last use from receipts, marketing ignored", async () => {
  type Seed = { messageId: string; date: string; subject: string; kind: string; companyId?: string };
  const seeds = JSON.parse(readFileSync(join(ROOT, "demo", "seed-inbox", "messages.json"), "utf8")) as Seed[];
  const ctx = await testContext({
    gmailFixturePath: join(ROOT, "demo", "seed-inbox", "messages.json"),
    directoryCsvPath: join(ROOT, "servers", "company-directory", "data", "companies.csv"),
  });
  // testContext injects the small test inbox; rebuild the gmail backend on the demo inbox.
  const { FixtureGmail } = await import("@dataexit/google");
  ctx.gmail = new FixtureGmail(join(ROOT, "demo", "seed-inbox", "messages.json"), join(ctx.config.dataDir, "fx.json"), ctx.now);

  const d = await discoverFootprint(ctx);
  const companies = new Set(seeds.filter((s) => s.companyId && ["signup", "welcome", "otp", "receipt"].includes(s.kind)).map((s) => s.companyId!));
  assert.equal(d.headline.companies, companies.size, "every company with a signup, OTP or receipt is found, including pre-2016 signups");
  assert.equal(d.headline.unrecognised, 0);
  assert.equal(d.truncated, false);
  assert.ok((d.signals.otp ?? 0) > 0 && (d.signals.receipt ?? 0) > 0 && (d.signals.welcome ?? 0) > 0);

  const fps = new Map((await ctx.store.listFootprints(ctx.userId)).map((f) => [f.company_id, f]));
  let checked = 0;
  for (const id of companies) {
    const mine = seeds.filter((s) => s.companyId === id);
    const used = mine.filter((s) => ["signup", "welcome", "otp", "receipt"].includes(s.kind)).map((s) => s.date).sort();
    const fp = fps.get(id);
    assert.ok(fp, `missing ${id}`);
    // Last use is the newest signup/OTP/receipt, never a newer newsletter.
    assert.equal(new Date(fp.last_interaction).toISOString(), new Date(used[used.length - 1]).toISOString(), `last use for ${id}`);
    const joined = mine.filter((s) => ["signup", "welcome", "otp"].includes(s.kind)).map((s) => s.date).sort()[0];
    if (joined) assert.equal(new Date(fp.signed_up_at!).toISOString(), new Date(joined).toISOString(), `signup date for ${id}`);
    assert.ok(fp.evidence && fp.evidence.length > 0 && fp.evidence.every((e) => !/\d{4,}/.test(e.subject)), `evidence for ${id}`);
    checked++;
  }
  assert.equal(checked, companies.size);

  // The oldest accounts (2015 signups) are found: these fell outside the old 10-year window.
  assert.ok(fps.has("hsbc-india") && fps.has("kissht") && fps.has("cashe"));

  const map = await getDataMap(ctx, { limit: 5 });
  assert.equal(map.headline.companies, companies.size);
  assert.ok(map.nodes[0].evidence.length > 0);
  assert.ok(["signup", "welcome", "otp", "account"].includes(map.nodes[0].evidence[0].kind), "signup proof shown first");
  await ctx.close();
});
