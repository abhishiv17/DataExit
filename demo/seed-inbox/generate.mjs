#!/usr/bin/env node
// Generates the fictional demo inbox for "Priya Demo" plus the mock JSON the web UI
// builds against until Person A's tools are live. Deterministic (seeded PRNG).
//
//   npm run demo:seed            (builds TS first)
//   SEED_NOW=2026-12-05 npm run demo:seed   (shift the demo date)
//
// Outputs
//   demo/seed-inbox/inbox.mbox          import into the demo Gmail account (never send)
//   demo/seed-inbox/messages.json       metadata index of every seeded message
//   apps/web/src/mock/footprint.json    FootprintResult (discover_footprint shape)
//   apps/web/src/mock/drafts.json       draft_request outputs (goal: erase) for every footprint, EN + HI
//   apps/web/src/mock/requests.json     tracker rows for the earlier batch of 7 requests
//
// Everything here is fictional. Never put real personal data in this folder.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  adjustForRetention, isHighSensitivity, legalBasisOn, RESPONSE_DEADLINE_DAYS,
  RETENTION_LABELS, SECTION_REFS, sensitivityScore,
} from "../../packages/shared/dist/ui/index.js";
import { classifyTier } from "../../packages/shared/dist/ui/index.js";
import { LEGAL_BASIS_NOTE, loadTemplate, missingPlaceholders, render } from "../../servers/request-engine/dist/templates.js";

const ROOT = new URL("../../", import.meta.url);
const OUT = new URL("./", import.meta.url);
const MOCK = new URL("apps/web/src/mock/", ROOT);

const persona = JSON.parse(readFileSync(new URL("persona.json", OUT), "utf8"));
const companies = JSON.parse(readFileSync(new URL("servers/company-directory/data/companies.json", ROOT), "utf8"));
const byId = new Map(companies.map((c) => [c.id, c]));

const NOW = new Date(process.env.SEED_NOW ? `${process.env.SEED_NOW}T10:00:00+05:30` : "2026-11-24T10:00:00+05:30");
const DAY = 864e5;
const T = persona.targets;

// ---------- deterministic randomness ----------
let seed = 20261124;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const shuffle = (xs) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const daysAgo = (d) => new Date(NOW.getTime() - d * DAY);
const between = (a, b) => new Date(a.getTime() + rand() * (b.getTime() - a.getTime()));

// ---------- who is in Priya's footprint ----------
// The 12 dormant high-sensitivity accounts for the wow moment: 2 banks (→ restrict_use) + 10 erasable.
const HIGH_RISK = ["kotak-bank", "yes-bank", "yatra", "zoomcar", "shaadi", "caratlane", "nobroker", "cars24", "paisabazaar", "bankbazaar", "cred", "yulu"];
// An earlier batch of requests (sent ~3.5 months ago) so the tracker and digest have replies.
const EARLIER = [
  { id: "dunzo", outcome: "confirmed" },
  { id: "snapdeal", outcome: "confirmed" },
  { id: "shopclues", outcome: "confirmed" },
  { id: "limeroad", outcome: "confirmed" },
  { id: "box8", outcome: "confirmed" },
  { id: "quikr", outcome: "id_requested" },
  { id: "gaana", outcome: "no_reply" },
];
// Everyday accounts Priya still uses (keeps the active side of the graph believable).
const ACTIVE_CORE = ["hdfc-bank", "jio", "swiggy", "zomato", "blinkit", "flipkart", "amazon-india", "myntra", "paytm", "phonepe", "zerodha", "groww", "makemytrip", "irctc", "uber", "ola", "indigo", "linkedin", "instagram", "netflix", "jiohotstar", "spotify", "practo", "tata-1mg", "lic", "star-health", "naukri", "urban-company", "bookmyshow", "cred"].filter((id) => !HIGH_RISK.includes(id));

for (const id of [...HIGH_RISK, ...EARLIER.map((e) => e.id), ...ACTIVE_CORE]) if (!byId.has(id)) throw new Error(`unknown company ${id}`);
for (const id of HIGH_RISK) if (!isHighSensitivity(byId.get(id))) throw new Error(`${id} is not high-sensitivity`);
const highRetention = HIGH_RISK.filter((id) => byId.get(id).retentionDuties.length);
if (highRetention.length !== T.banksWithKyc) throw new Error(`expected ${T.banksWithKyc} retention companies in HIGH_RISK, got ${highRetention}`);

const reserved = new Set([...HIGH_RISK, ...EARLIER.map((e) => e.id), ...ACTIVE_CORE]);
const pool = shuffle(companies.filter((c) => !reserved.has(c.id)));
const lowPool = pool.filter((c) => !isHighSensitivity(c));
const dormantLow = lowPool.slice(0, T.dormant3y - HIGH_RISK.length);
if (dormantLow.length !== T.dormant3y - HIGH_RISK.length) throw new Error("not enough low-sensitivity companies for dormant set");
const used = new Set([...reserved, ...dormantLow.map((c) => c.id)]);
const fillers = pool.filter((c) => !used.has(c.id)).slice(0, T.companies - used.size);
if (used.size + fillers.length !== T.companies) throw new Error(`directory too small for ${T.companies} companies`);

// Assign activity windows.
const plan = new Map(); // id -> {first, last, bucket}
const THREE_Y = 3 * 365 + 1;
for (const id of [...HIGH_RISK, ...dormantLow.map((c) => c.id)]) {
  const last = daysAgo(int(THREE_Y + 10, 7 * 365));
  plan.set(id, { first: between(new Date("2015-06-01"), new Date(last.getTime() - 30 * DAY)), last, bucket: "dormant3y" });
}
for (const { id } of EARLIER) {
  const last = daysAgo(int(420, 3 * 365 - 30));
  plan.set(id, { first: between(new Date("2016-01-01"), new Date(last.getTime() - 60 * DAY)), last, bucket: "earlier" });
}
for (const id of ACTIVE_CORE) {
  const last = daysAgo(int(0, 40));
  plan.set(id, { first: between(new Date("2015-01-01"), daysAgo(400)), last, bucket: "active" });
}
for (const c of fillers) {
  const dormant1to3 = rand() < 0.35;
  const last = dormant1to3 ? daysAgo(int(366, 3 * 365 - 5)) : daysAgo(int(0, 330));
  plan.set(c.id, { first: between(new Date("2015-01-01"), new Date(last.getTime() - 20 * DAY)), last, bucket: dormant1to3 ? "dormant1to3" : "active" });
}

// ---------- message generation ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const orderNo = () => `${int(100000, 999999)}${int(1000, 9999)}`;

function receiptSubject(c, d) {
  const m = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  switch (c.sector) {
    case "food_delivery": return `Your ${c.name} order #${orderNo()} was delivered`;
    case "ecommerce": return `Your ${c.name} order #${orderNo()} has been shipped`;
    case "bank": return `${c.name}: account statement for ${m}`;
    case "fintech": return `${c.name}: payment of Rs ${int(99, 4999)} successful`;
    case "broker": return `${c.name}: contract note for ${d.toISOString().slice(0, 10)}`;
    case "insurance": return `${c.name}: premium receipt for policy ending ${int(1000, 9999)}`;
    case "telecom": return `${c.name}: your bill for ${m} is ready`;
    case "health": return `${c.name}: your order/report is ready`;
    case "travel": return `Booking confirmed with ${c.name} (PNR ${int(0, 36 ** 6 - 1).toString(36).toUpperCase().padStart(6, "0")})`;
    case "edtech": return `${c.name}: your course receipt`;
    case "gaming": return `${c.name}: Rs ${int(25, 500)} added to your wallet`;
    default: return `${c.name}: your receipt for ${m}`;
  }
}

function subjectFor(kind, c, d) {
  switch (kind) {
    case "signup": return `Verify your email address for ${c.name}`;
    case "welcome": return `Welcome to ${c.name}, Priya!`;
    case "otp": return `${int(100000, 999999)} is your ${c.name} verification code`;
    case "receipt": return receiptSubject(c, d);
    case "newsletter": return pick([`${c.name}: offers picked for you`, `What's new on ${c.name} this week`, `Priya, we miss you at ${c.name}`]);
  }
}

const BODY = {
  signup: (c) => `Hi Priya,\n\nPlease confirm your email address to finish creating your ${c.name} account.\n\nIf you did not sign up, ignore this email.\n\n— Team ${c.name}`,
  welcome: (c) => `Hi Priya,\n\nWelcome to ${c.name}! Your account is ready. We've saved your mobile number and address for faster checkout.\n\n— Team ${c.name}`,
  otp: (c) => `Your one-time password for ${c.name} is in the subject line. It is valid for 10 minutes.\n\nNever share your OTP with anyone. ${c.name} will never ask for it.`,
  receipt: (c) => `Hi Priya,\n\nThanks for using ${c.name}. Your transaction details are available in the app.\n\n— Team ${c.name}`,
  newsletter: (c) => `Hi Priya,\n\nHere are this week's picks from ${c.name}. Tap to explore.\n\nTo stop these emails, unsubscribe from your account settings.`,
};

const messages = [];
let msgSeq = 0;
const mid = () => `<seed-${String(++msgSeq).padStart(4, "0")}@dataexit.demo>`;
const fromAddr = (c, local = "no-reply") => {
  const d = c.domains[c.domains.length > 1 && rand() < 0.3 ? 1 : 0];
  return `${c.name} <${local}@${rand() < 0.4 ? "mailer." : ""}${d}>`;
};

function addMessage(m) { messages.push(m); return m; }

const footprints = [];
for (const [id, p] of plan) {
  const c = byId.get(id);
  const evidence = [];
  const firstKind = rand() < 0.6 ? "welcome" : "signup";
  evidence.push(addMessage({ messageId: mid(), date: p.first, from: fromAddr(c), to: persona.email, subject: subjectFor(firstKind, c, p.first), kind: firstKind, body: BODY[firstKind](c), companyId: id }));
  const middle = int(0, 2);
  for (let i = 0; i < middle; i++) {
    const d = between(p.first, p.last);
    const k = pick(["otp", "receipt", "newsletter"]);
    evidence.push(addMessage({ messageId: mid(), date: d, from: fromAddr(c), to: persona.email, subject: subjectFor(k, c, d), kind: k, body: BODY[k](c), companyId: id }));
  }
  const lastKind = pick(["otp", "receipt", "receipt", "newsletter"]);
  evidence.push(addMessage({ messageId: mid(), date: p.last, from: fromAddr(c), to: persona.email, subject: subjectFor(lastKind, c, p.last), kind: lastKind, body: BODY[lastKind](c), companyId: id }));
  evidence.sort((a, b) => a.date - b.date);

  const score = sensitivityScore(c.dataCategories);
  footprints.push({
    footprintId: `fp-${id}`,
    company: {
      id: c.id, name: c.name, sector: c.sector, domains: c.domains,
      dataCategories: c.dataCategories, retentionDuties: c.retentionDuties,
      grievanceVerified: c.grievance.verified,
    },
    firstSeen: p.first.toISOString(),
    lastSeen: p.last.toISOString(),
    discoveredVia: ["gmail"],
    sensitivity: score,
    highSensitivity: isHighSensitivity(c),
    status: (NOW - p.last) / DAY > 365 ? "dormant" : "active",
    evidence: evidence.map(({ messageId, date, from, subject, kind }) => ({ messageId, date: date.toISOString(), from, subject, kind })),
  });
}

// ---------- earlier request batch: sent mail + replies ----------
const BATCH_SENT = daysAgo(108); // past the 90-day deadline, so a non-reply is overdue
const REPLY_TEXT = {
  confirmed: (c) => `Dear Priya,\n\nThank you for writing to us. Your account has been closed and your personal data has been deleted from our systems, except where we must keep transaction records for tax purposes.\n\nRegards,\n${c.name} Grievance Desk`,
  id_requested: (c) => `Dear Priya,\n\nWe have received your request. To protect your account, please verify your identity by replying from your registered email and sharing your registered mobile number.\n\nRegards,\n${c.name} Support`,
};
// Note: the id_requested reply above deliberately asks for something reasonable; the classifier
// keys on "verify your identity". Our agent never forwards Aadhaar/PAN copies automatically.

const requests = [];
for (const { id, outcome } of EARLIER) {
  const c = byId.get(id);
  const sentAt = between(BATCH_SENT, new Date(BATCH_SENT.getTime() + DAY / 3));
  const type = adjustForRetention("erase", c.retentionDuties);
  const sent = addMessage({
    messageId: mid(), date: sentAt, from: `${persona.name} <${persona.email}>`, to: `${c.name} Grievance Officer <grievance@${c.domains[0]}>`,
    subject: `Request to erase personal data and close account – ${persona.name}`, kind: "request_sent",
    body: `(Sent by Data Exit on Priya's behalf after one-tap approval.)\n\nPlease erase my personal data and close my account.`, companyId: id,
  });
  const fp = footprints.find((f) => f.company.id === id);
  fp.status = outcome === "confirmed" ? "closed" : "request_open";
  let replyId = null, repliedAt = null, status = "sent";
  if (outcome !== "no_reply") {
    const reply = addMessage({
      messageId: mid(), date: new Date(sentAt.getTime() + int(3, 25) * DAY), from: `${c.name} Grievance Desk <grievance@${c.domains[0]}>`, to: persona.email,
      subject: `Re: ${sent.subject}`, kind: "reply", inReplyTo: sent.messageId, body: REPLY_TEXT[outcome](c), companyId: id,
    });
    fp.evidence.push({ messageId: reply.messageId, date: reply.date.toISOString(), from: reply.from, subject: reply.subject, kind: "reply" });
    replyId = reply.messageId;
    repliedAt = reply.date.toISOString();
    status = outcome;
  }
  const deadlineAt = new Date(sentAt.getTime() + RESPONSE_DEADLINE_DAYS * DAY);
  if (status === "sent" && deadlineAt < NOW) status = "overdue";
  requests.push({
    id: `req-${id}`, companyId: id, companyName: c.name, type, status,
    sentAt: sentAt.toISOString(), deadlineAt: deadlineAt.toISOString(),
    gmailMessageId: sent.messageId, calendarEventId: null, sourceRef: fp.evidence[0].messageId,
    evidence: replyId ? [replyId] : [], repliedAt,
  });
}

// ---------- escalation drafts for overdue requests (grievance officer level) ----------
const legalBasis = legalBasisOn(NOW);
for (const r of requests.filter((x) => x.status === "overdue")) {
  r.escalation = {};
  for (const lang of ["en", "hi"]) {
    const tpl = loadTemplate(lang, "escalation_grievance_officer");
    const vars = {
      company_name: r.companyName, user_name: persona.name, user_email: persona.email,
      original_date: r.sentAt.slice(0, 10), reference: r.gmailMessageId, date: NOW.toISOString().slice(0, 10),
      legal_basis_note: LEGAL_BASIS_NOTE[lang][legalBasis],
    };
    r.escalation[lang] = { subject: render(tpl.subject, vars), body: render(tpl.body, vars) };
  }
}

// ---------- drafts (what draft_request would return for goal "erase") ----------
const drafts = [];
for (const id of footprints.filter((f) => f.status !== "closed").map((f) => f.company.id)) {
  const c = byId.get(id);
  const fp = footprints.find((f) => f.company.id === id);
  const type = adjustForRetention("erase", c.retentionDuties);
  const byLang = {};
  for (const lang of ["en", "hi"]) {
    const tpl = loadTemplate(lang, type);
    const vars = {
      company_name: c.name, user_name: persona.name, user_email: persona.email, account_identifier: persona.email,
      date: NOW.toISOString().slice(0, 10), section_ref: SECTION_REFS[type], legal_basis_note: LEGAL_BASIS_NOTE[lang][legalBasis],
      deadline_days: RESPONSE_DEADLINE_DAYS, retention_law: c.retentionDuties.map((d) => RETENTION_LABELS[d]).join(", ") || undefined,
    };
    const subject = render(tpl.subject, vars), body = render(tpl.body, vars);
    byLang[lang] = { subject, body, missing: missingPlaceholders(subject + body) };
  }
  drafts.push({
    companyId: id, companyName: c.name, sector: c.sector,
    goal: "erase", requestType: type, changed: type !== "erase",
    reason: type !== "erase" ? `Must retain under ${c.retentionDuties.map((d) => RETENTION_LABELS[d]).join(", ")}` : `Unused since ${fp.lastSeen.slice(0, 10)}; holds ${c.dataCategories.join(", ")}`,
    tier: classifyTier(type, c.sector), legalBasis,
    recipient: c.grievance.verified ? c.grievance.email : null,
    recipientForm: c.grievance.verified && !c.grievance.email ? c.grievance.url : null,
    recipientSource: c.grievance.verified ? c.grievance.source : null,
    needsRecipient: !(c.grievance.verified && (c.grievance.email || c.grievance.url)),
    sourceRef: fp.evidence[0].messageId,
    en: byLang.en, hi: byLang.hi,
  });
}

// ---------- write outputs ----------
messages.sort((a, b) => a.date - b.date);

const rfc2822 = (d) => d.toUTCString().replace("GMT", "+0000");
const asctime = (d) => { const s = d.toUTCString().split(" "); return `${s[0].replace(",", "")} ${s[2]} ${s[1].padStart(2, " ")} ${s[4]} ${s[3]}`; };
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const encodeAddr = (s) => { const m = s.match(/^(.*) (<[^>]+>)$/); return m ? `${encodeHeader(m[1])} ${m[2]}` : s; };

const mbox = messages.map((m) => {
  const headers = [
    `From: ${encodeAddr(m.from)}`, `To: ${encodeAddr(m.to)}`, `Subject: ${encodeHeader(m.subject)}`,
    `Date: ${rfc2822(m.date)}`, `Message-ID: ${m.messageId}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`] : []),
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit",
    `X-DataExit-Seed: ${m.kind}`,
  ];
  const body = m.body.replace(/^(>*From )/gm, ">$1");
  return `From MAILER-DAEMON ${asctime(m.date)}\n${headers.join("\n")}\n\n${body}\n`;
}).join("\n");

writeFileSync(new URL("inbox.mbox", OUT), mbox);
writeFileSync(new URL("messages.json", OUT), JSON.stringify(messages.map(({ body, ...m }) => ({ ...m, date: m.date.toISOString() })), null, 2) + "\n");

mkdirSync(MOCK, { recursive: true });
footprints.sort((a, b) => a.company.name.localeCompare(b.company.name));
const footprintResult = { userId: "demo-user", scannedAt: NOW.toISOString(), footprints, unmatchedDomains: [] };
writeFileSync(new URL("footprint.json", MOCK), JSON.stringify(footprintResult, null, 2) + "\n");
writeFileSync(new URL("drafts.json", MOCK), JSON.stringify(Object.fromEntries(drafts.map((d) => [d.companyId, d]))) + "\n");
writeFileSync(new URL("requests.json", MOCK), JSON.stringify(requests, null, 2) + "\n");

// ---------- check the wow numbers ----------
const age = (f) => (NOW - new Date(f.lastSeen)) / DAY;
const d3 = footprints.filter((f) => age(f) > 3 * 365);
const stats = {
  companies: footprints.length,
  dormant3y: d3.length,
  dormant3yHighSensitivity: d3.filter((f) => f.highSensitivity).length,
  dormant1y: footprints.filter((f) => age(f) > 365).length,
  messages: messages.length,
  requests: requests.map((r) => `${r.companyId}:${r.status}`).join(" "),
  drafts: drafts.length, highRiskDrafts: drafts.filter((d) => HIGH_RISK.includes(d.companyId)).map((d) => `${d.companyId}:${d.requestType}/${d.tier}`).join(" "),
};
console.log(stats);
if (stats.companies !== T.companies || stats.dormant3y !== T.dormant3y || stats.dormant3yHighSensitivity !== T.highSensitivity) {
  console.error("Wow numbers do not match persona.json targets");
  process.exit(1);
}
