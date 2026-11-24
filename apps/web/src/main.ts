import "./style.css";
import {
  isHighSensitivity, RETENTION_LABELS, RIGHTS_IN_FORCE_FROM, sensitivityBand,
  type DataCategory, type FootprintView, type Language, type RequestStatus,
} from "@dataexit/shared/ui";
import { draftRequest, getFootprint, listRequests, type Draft, type TrackedRequest } from "./api";
import { BrowserAuditLog } from "./audit";
import { createGraph, SECTOR_LABEL, type GraphHandle } from "./graph";
import { gsap } from "gsap";
import { mountHome } from "./home";
import { mountRural } from "./rural";

// ---------- helpers ----------
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const YEAR = 365 * 864e5;
const UNDO_MS = 10 * 60 * 1000;

const CATEGORY_LABEL: Record<DataCategory, string> = {
  contact: "Contact details", device: "Device data", behavioural: "Behaviour", transaction: "Orders & payments",
  location: "Location", communications: "Messages", financial: "Bank / card details", government_id: "Aadhaar / PAN / KYC",
  health: "Health", biometric: "Photos / biometrics", children: "Children's data", inferred_profile: "Inferred profile",
};
const TYPE_LABEL: Record<string, string> = {
  erase: "Erase data", restrict_use: "Restrict use", withdraw_consent: "Withdraw consent",
  stop_marketing: "Stop marketing", access: "Access my data", correct: "Correct data",
};
const STATUS_LABEL: Partial<Record<RequestStatus, string>> = {
  sent: "Sent", acknowledged: "Acknowledged", id_requested: "Asked for ID", confirmed: "Confirmed",
  rejected: "Refused", overdue: "Ignored (overdue)", escalated_go: "Escalated", closed: "Closed", cancelled: "Cancelled",
};

// ---------- state ----------
type ReviewStatus = "pending" | "undo" | "sent" | "cancelled" | "skipped";
interface ReviewItem { draft: Draft; lang: Language; status: ReviewStatus; undoUntil: number | null; open: boolean }

const audit = new BrowserAuditLog("demo-user");
const state = {
  footprints: [] as FootprintView[],
  byId: new Map<string, FootprintView>(),
  scannedAt: new Date(),
  selected: new Set<string>(),
  focused: null as string | null,
  filter: "all" as FilterKey,
  view: "home" as View,
  review: [] as ReviewItem[],
  tracked: [] as TrackedRequest[],
  escalating: null as string | null,
  escalationLang: "en" as Language,
};
let graph: GraphHandle | null = null;
type View = "home" | "map" | "review" | "tracker" | "rural";
let ruralMounted = false;
let homeCleanup: (() => void) | null = null;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

type FilterKey = "all" | "dormant1y" | "dormant3y" | "high" | "highDormant";
const age = (fp: FootprintView) => (state.scannedAt.getTime() - new Date(fp.lastSeen).getTime()) / YEAR;
const FILTERS: Record<FilterKey, { label: string; fn: (fp: FootprintView) => boolean }> = {
  all: { label: "All", fn: () => true },
  dormant1y: { label: "Unused 1+ year", fn: (fp) => age(fp) > 1 },
  dormant3y: { label: "Unused 3+ years", fn: (fp) => age(fp) > 3 },
  high: { label: "Hold ID, bank or health data", fn: (fp) => fp.highSensitivity },
  highDormant: { label: "High risk & unused 3+ yrs", fn: (fp) => fp.highSensitivity && age(fp) > 3 },
};
const isOpen = (fp: FootprintView) => fp.status !== "closed" && fp.status !== "request_open";

// ---------- shell ----------
const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 8l-4 4 4 4"/><path d="M5 12h10"/></svg>`;
document.querySelector("#app")!.innerHTML = `
  <header class="top">
    <button class="brand" data-view="home" aria-label="Data Exit home"><span class="logo">${LOGO}</span> Data Exit</button>
    <nav class="tabs app-only" aria-label="Demo steps">
      <button data-view="map"><i>1</i> Discover</button>
      <button data-view="review"><i>2</i> Approve <span id="review-count"></span></button>
      <button data-view="tracker"><i>3</i> Track</button>
      <button data-view="rural" class="tab-alt"><i>✦</i> Scam check</button>
    </nav>
    <nav class="home-links home-only">
      <button class="link-btn" data-scroll=".how">How it works</button>
      <button class="link-btn" data-scroll=".rural">Rural mode</button>
      <button class="link-btn" data-scroll=".tech">Technology</button>
    </nav>
    <span class="spacer"></span>
    <button id="audit-toggle" class="ghost app-only" title="Every action is logged in a tamper-evident hash chain">Audit log <span id="audit-count">0</span></button>
    <button class="primary home-only" data-view="map">Open the demo →</button>
  </header>
  <div class="guide app-only" id="guide"></div>
  <main>
    <section id="view-home" class="view view-home"></section>
    <section id="view-map" class="view">
      <div class="headline" id="headline"></div>
      <div class="map-layout">
        <div class="map-col">
          <div class="filters" id="filters"></div>
          <div id="graph" class="graph-host"></div>
          <div class="legend">
            <span><i class="dot band-high"></i>Holds ID, bank, health or children's data</span>
            <span><i class="dot band-medium"></i>Holds location or messages</span>
            <span><i class="dot band-low"></i>Contact details and orders only</span>
            <span class="muted">Centre = Priya · further out = unused for longer · bigger dot = more kinds of data</span>
          </div>
        </div>
        <aside id="panel" class="panel"></aside>
      </div>
      <div class="selection-bar" id="selection-bar"></div>
    </section>
    <section id="view-review" class="view"></section>
    <section id="view-tracker" class="view"></section>
    <section id="view-rural" class="view"></section>
  </main>
  <aside id="audit" class="audit" hidden></aside>
`;

document.querySelectorAll<HTMLButtonElement>("header [data-view]").forEach((b) =>
  b.addEventListener("click", () => setView(b.dataset.view as View)));
document.querySelectorAll<HTMLButtonElement>("[data-scroll]").forEach((b) =>
  b.addEventListener("click", () => document.querySelector(b.dataset.scroll!)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })));
$("#audit-toggle").addEventListener("click", () => {
  const a = $("#audit"); a.hidden = !a.hidden;
  if (!a.hidden && !reduceMotion) gsap.from(a, { x: 60, autoAlpha: 0, duration: 0.35, ease: "power3.out" });
});
audit.onChange(renderAudit);

const GUIDE: Record<Exclude<View, "home">, { step: string; title: string; body: string; next: string; action: () => void }> = {
  map: {
    step: "Step 1 of 3", title: "Who has Priya's data?",
    body: "Every dot is a company we found in Priya's inbox, from sign-up, OTP and receipt emails. <b>Further from the centre</b> means she hasn't used it for longer. <b>Orange</b> means it holds ID, bank or health data. Click any dot to see the email it came from.",
    next: "Select the 12 riskiest", action: () => { pickHighRisk(); },
  },
  review: {
    step: "Step 2 of 3", title: "Approve the requests",
    body: "Data Exit wrote one request per company, addressed to its grievance officer. The two banks must keep KYC data by law, so it asks them to <b>restrict use</b> instead of erasing. <b>Nothing is sent until you approve.</b> High-risk requests wait 10 minutes so you can undo.",
    next: "Next: track the replies", action: () => setView("tracker"),
  },
  tracker: {
    step: "Step 3 of 3", title: "Track the replies",
    body: "Companies get a deadline. Data Exit reads their replies, grades how they behaved, and drafts an escalation to the grievance officer for anyone who ignores you.",
    next: "Next: rural scam check", action: () => setView("rural"),
  },
  rural: {
    step: "Rural mode", title: "Is this message a scam?",
    body: "For people who don't use email. Tap a sample message on the right, or type or speak one. The bot answers in Hindi (switch to English at the top of the phone) and <b>reads the answer aloud</b> with ElevenLabs.",
    next: "Back to home", action: () => setView("home"),
  },
};

function renderGuide(v: View) {
  const host = $("#guide");
  if (v === "home") { host.innerHTML = ""; return; }
  const g = GUIDE[v];
  host.innerHTML = `
    <div class="guide-inner">
      <div class="guide-text">
        <div class="guide-step"><span class="step-pill">${g.step}</span> <span class="persona">Demo inbox: "Priya" (made up) · nothing is really sent</span></div>
        <h1>${g.title}</h1>
        <p>${g.body}</p>
      </div>
      <button class="primary guide-next">${g.next} →</button>
    </div>`;
  host.querySelector(".guide-next")!.addEventListener("click", g.action);
  if (!reduceMotion) gsap.from(host.querySelectorAll(".guide-step, h1, p, .guide-next"), { y: 14, autoAlpha: 0, duration: 0.5, stagger: 0.06, ease: "power3.out", clearProps: "all" });
}

function ensureGraph() {
  if (graph) return;
  graph = createGraph($("#graph"), state.footprints, state.scannedAt, {
    onClick: (fp, additive) => {
      state.focused = fp.company.id;
      if (additive) toggleSelect(fp.company.id);
      graph!.focus(fp.company.id); renderPanel();
      if (!reduceMotion) gsap.from("#panel > *", { y: 12, autoAlpha: 0, duration: 0.35, stagger: 0.03, ease: "power2.out", clearProps: "all" });
    },
    isSelected: (id) => state.selected.has(id),
  });
  graph.setMatch(FILTERS[state.filter].fn);
}

function setView(v: View) {
  const prev = state.view;
  state.view = v;
  document.body.dataset.view = v;
  document.querySelectorAll<HTMLElement>(".view").forEach((el) => (el.hidden = el.id !== `view-${v}`));
  document.querySelectorAll<HTMLButtonElement>(".tabs [data-view]").forEach((b) => b.setAttribute("aria-current", String(b.dataset.view === v)));
  if (v !== "home" && homeCleanup) { homeCleanup(); homeCleanup = null; }
  if (v === "home" && !homeCleanup) homeCleanup = mountHome($("#view-home"), state.footprints, (to) => setView(to));
  if (v === "map") { ensureGraph(); if (prev !== "map") animateHeadline(); }
  if (v === "review") renderReview();
  if (v === "tracker") renderTracker();
  if (v === "rural" && !ruralMounted) { mountRural($("#view-rural")); ruralMounted = true; }
  renderGuide(v);
  const hash = v === "home" ? "" : `#${v}`;
  if (location.hash !== hash) history.replaceState(null, "", hash || location.pathname);
  window.scrollTo({ top: 0 });
  if (!reduceMotion && v !== "home" && prev !== v) {
    const view = $(`#view-${v}`);
    gsap.fromTo(view, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power3.out", clearProps: "transform" });
    const items = view.querySelectorAll(v === "review" ? ".card" : v === "tracker" ? ".tl, .digest, .report-card" : v === "map" ? ".filters .chip, .panel" : ".phone, .rural-side > *");
    gsap.from(items, { y: 24, autoAlpha: 0, duration: 0.5, stagger: 0.04, ease: "power3.out", delay: 0.1, clearProps: "all" });
  }
}

function animateHeadline() {
  if (reduceMotion) return;
  document.querySelectorAll<HTMLElement>("#headline .stat b").forEach((el) => {
    const to = Number(el.textContent); const o = { v: 0 };
    gsap.to(o, { v: to, duration: 1.3, ease: "power2.out", onUpdate: () => { el.textContent = String(Math.round(o.v)); } });
  });
  gsap.from("#headline > *", { y: 16, autoAlpha: 0, stagger: 0.08, duration: 0.5, ease: "power3.out", clearProps: "all" });
}

// ---------- map view ----------
function renderHeadline() {
  const fps = state.footprints;
  const d3y = fps.filter((f) => age(f) > 3);
  const high = d3y.filter((f) => f.highSensitivity);
  $("#headline").innerHTML = `
    <div class="stat"><b>${fps.length}</b><span>companies have Priya's data</span></div>
    <div class="stat"><b>${d3y.length}</b><span>she hasn't used in 3+ years</span></div>
    <div class="stat hot"><b>${high.length}</b><span>of those hold her Aadhaar, PAN, bank or health data</span></div>
    <button class="primary" id="pick-high">Select these ${high.length} →</button>`;
  $("#pick-high").addEventListener("click", pickHighRisk);
}

function pickHighRisk() {
  const high = state.footprints.filter((f) => f.highSensitivity && age(f) > 3);
  state.selected = new Set(high.filter(isOpen).map((f) => f.company.id));
  state.filter = "highDormant";
  renderFilters(); graph?.setMatch(FILTERS[state.filter].fn); renderSelectionBar();
}

function renderFilters() {
  const host = $("#filters");
  host.innerHTML = (Object.keys(FILTERS) as FilterKey[]).map((k) => {
    const n = state.footprints.filter(FILTERS[k].fn).length;
    return `<button class="chip" aria-pressed="${state.filter === k}" data-k="${k}">${FILTERS[k].label} <span>${n}</span></button>`;
  }).join("");
  host.querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", () => {
    state.filter = b.dataset.k as FilterKey;
    graph?.setMatch(FILTERS[state.filter].fn);
    renderFilters();
  }));
}

function renderPanel() {
  const host = $("#panel");
  const fp = state.focused ? state.byId.get(state.focused) : null;
  if (!fp) {
    host.innerHTML = `<div class="panel-empty"><div class="hand">👆</div><h3>Click any dot on the map</h3><p>You'll see:</p><ul><li>the email that revealed the company</li><li>what data it probably holds</li><li>whether the law lets it keep that data</li></ul><p class="small muted">Or press <b>Select these 12</b> above to jump straight to the riskiest ones.</p></div>`;
    return;
  }
  const c = fp.company;
  const band = sensitivityBand(fp.sensitivity);
  const yrs = age(fp);
  const sel = state.selected.has(c.id);
  host.innerHTML = `
    <div class="panel-head">
      <h3>${esc(c.name)}</h3>
      <span class="badge band-${band}">${band} sensitivity</span>
    </div>
    <p class="muted">${esc(SECTOR_LABEL[c.sector] ?? c.sector)} · ${esc(c.domains.join(", "))}</p>
    <dl class="facts">
      <dt>First seen</dt><dd>${fmtDate(fp.firstSeen)}</dd>
      <dt>Last used</dt><dd>${fmtDate(fp.lastSeen)} ${yrs > 1 ? `<span class="warn">(${yrs.toFixed(1)} yrs ago)</span>` : ""}</dd>
      <dt>Status</dt><dd>${esc(fp.status.replace("_", " "))}</dd>
    </dl>
    <h4>Data they likely hold</h4>
    <div class="cats">${c.dataCategories.map((k) => `<span class="cat ${isHighSensitivity({ dataCategories: [k] }) ? "cat-high" : ""}">${esc(CATEGORY_LABEL[k])}</span>`).join("")}</div>
    ${c.retentionDuties.length ? `<div class="note">⚖ Must keep some data under ${esc(c.retentionDuties.map((d) => RETENTION_LABELS[d]).join(", "))}. We'll ask them to <b>restrict use</b> instead of erasing.</div>` : ""}
    <h4>Why we found it</h4>
    <ul class="evidence">${fp.evidence.map((e) => `
      <li><span class="kind kind-${e.kind}">${e.kind}</span>
        <div><div class="subj">${esc(e.subject)}</div><div class="muted small">${esc(e.from)} · ${fmtDate(e.date)}</div></div></li>`).join("")}
    </ul>
    <p class="muted small">Only email headers are read. Message bodies are never stored.</p>
    ${isOpen(fp)
      ? `<button class="${sel ? "ghost" : "primary"} block" id="toggle-sel">${sel ? "Remove from selection" : "Select for a request"}</button>`
      : `<div class="note">A request is already ${fp.status === "closed" ? "completed" : "open"} for this company. See Tracker.</div>`}`;
  host.querySelector("#toggle-sel")?.addEventListener("click", () => { toggleSelect(c.id); renderPanel(); });
}

function toggleSelect(id: string) {
  const fp = state.byId.get(id);
  if (!fp || !isOpen(fp)) return;
  state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id);
  graph?.refresh(); renderSelectionBar();
}

function renderSelectionBar() {
  const bar = $("#selection-bar");
  const n = state.selected.size;
  const wasShown = bar.classList.contains("show");
  bar.classList.toggle("show", n > 0);
  if (n && !wasShown && !reduceMotion) gsap.fromTo(bar, { scale: 0.94 }, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)", delay: 0.15, clearProps: "scale" });
  bar.innerHTML = n ? `
    <span><b>${n}</b> selected: ${[...state.selected].slice(0, 5).map((id) => esc(state.byId.get(id)!.company.name)).join(", ")}${n > 5 ? ` +${n - 5} more` : ""}</span>
    <span class="spacer"></span>
    <button class="ghost" id="clear-sel">Clear</button>
    <button class="primary" id="go-review">Draft ${n} request${n > 1 ? "s" : ""} (step 2) →</button>` : "";
  bar.querySelector("#clear-sel")?.addEventListener("click", () => { state.selected.clear(); graph?.refresh(); renderSelectionBar(); renderPanel(); });
  bar.querySelector("#go-review")?.addEventListener("click", startReview);
}

// ---------- review & approve ----------
async function startReview() {
  const existing = new Map(state.review.map((r) => [r.draft.companyId, r]));
  for (const id of state.selected) {
    if (existing.has(id)) continue;
    const draft = await draftRequest(id);
    if (!draft) continue;
    const item: ReviewItem = { draft, lang: "en", status: "pending", undoUntil: null, open: false };
    state.review.push(item);
    await audit.append({ actor: "agent", action: "propose", target: id, sourceRef: draft.sourceRef, details: { type: draft.requestType, tier: draft.tier, changedFrom: draft.changed ? draft.goal : null } });
  }
  state.selected.clear(); graph?.refresh(); renderSelectionBar();
  setView("review");
}

function renderReview() {
  const host = $("#view-review");
  const pending = state.review.filter((r) => r.status === "pending");
  $("#review-count").textContent = pending.length ? String(pending.length) : "";
  if (!state.review.length) {
    host.innerHTML = `<div class="empty"><h2>Nothing to review yet</h2><p>Start at step 1: pick companies on the data map, then draft requests.</p><button class="primary" id="to-map">Go to step 1 →</button></div>`;
    host.querySelector("#to-map")!.addEventListener("click", () => setView("map"));
    return;
  }
  const restricted = state.review.filter((r) => r.draft.changed).length;
  const basisNote = new Date() < RIGHTS_IN_FORCE_FROM
    ? `Before ${fmtDate(RIGHTS_IN_FORCE_FROM.toISOString())}, these are <b>policy-based (courtesy) requests</b>: DPDP data-principal rights are not yet in force.`
    : `These are statutory requests under the DPDP Act, 2023.`;
  host.innerHTML = `
    <div class="review-head">
      <div>
        <div class="summary-pills"><span><b>${state.review.length}</b> drafted</span><span><b>${state.review.length - restricted}</b> erase</span><span class="sp-warn"><b>${restricted}</b> switched to restrict-use (law)</span><span class="sp-ok"><b>${state.review.filter((r) => r.status === "sent").length}</b> sent</span></div>
      </div>
      <div class="actions">
        ${pending.some((r) => r.draft.tier !== "high") ? `<button class="ghost" id="approve-medium">Approve all one-tap (${pending.filter((r) => r.draft.tier !== "high").length})</button>` : ""}
      </div>
    </div>
    <div class="note legal">${basisNote} Section numbers are marked [verify] until checked.</div>
    <div class="cards">${state.review.map(cardHtml).join("")}</div>`;
  host.querySelector("#approve-medium")?.addEventListener("click", async () => {
    for (const r of state.review.filter((x) => x.status === "pending" && x.draft.tier !== "high")) await approve(r);
  });
  host.querySelectorAll<HTMLElement>("[data-act]").forEach((el) => el.addEventListener("click", () => onCardAction(el.dataset.id!, el.dataset.act!)));
}

function cardHtml(r: ReviewItem): string {
  const d = r.draft;
  const fp = state.byId.get(d.companyId)!;
  const src = fp.evidence.find((e) => e.messageId === d.sourceRef) ?? fp.evidence[0];
  const t = d[r.lang];
  const id = esc(d.companyId);
  const remaining = r.undoUntil ? Math.max(0, r.undoUntil - Date.now()) : 0;
  const mm = String(Math.floor(remaining / 60000)).padStart(2, "0"), ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
  return `
  <article class="card status-${r.status}" data-card="${id}">
    <div class="card-top">
      <div>
        <h3>${esc(d.companyName)}</h3>
        <div class="muted small">${esc(SECTOR_LABEL[d.sector] ?? d.sector)} · unused since ${fmtDate(fp.lastSeen)}</div>
      </div>
      <div class="pills">
        <span class="pill type-${d.requestType}">${TYPE_LABEL[d.requestType]}</span>
        <span class="pill tier-${d.tier}" title="Approval tier">${d.tier === "high" ? "Full review · 10-min undo" : d.tier === "medium" ? "One-tap" : "Auto-eligible"}</span>
      </div>
    </div>
    ${d.changed ? `<div class="note">⚖ You asked to erase, but they ${esc(d.reason.charAt(0).toLowerCase() + d.reason.slice(1))}. Asking them to <b>restrict use</b> to that legal purpose instead.</div>` : `<p class="small">Holds: ${fp.company.dataCategories.map((k) => esc(CATEGORY_LABEL[k])).join(", ")}</p>`}
    <p class="small source">Source: “${esc(src.subject)}” · ${fmtDate(src.date)}</p>
    <p class="small ${d.needsRecipient ? "warn" : ""}">${d.needsRecipient
      ? "Grievance contact not verified yet. Test sends go to the sandbox inbox."
      : d.recipient
        ? `To: <b>${esc(d.recipient)}</b> <a href="${esc(d.recipientSource)}" target="_blank" rel="noopener">(source)</a>`
        : `Submit via their <a href="${esc(d.recipientForm)}" target="_blank" rel="noopener">privacy request form</a>; we'll pre-fill the text for you to paste.`}</p>
    <div class="lang">
      <button data-act="lang-en" data-id="${id}" aria-pressed="${r.lang === "en"}">English</button>
      <button data-act="lang-hi" data-id="${id}" aria-pressed="${r.lang === "hi"}">हिन्दी</button>
      <button data-act="toggle" data-id="${id}" class="link">${r.open ? "Hide email" : "Show email"}</button>
    </div>
    ${r.open ? `<div class="email" lang="${r.lang}"><div class="subj">${esc(t.subject)}</div><pre>${esc(t.body)}</pre></div>` : ""}
    <div class="card-actions">
      ${r.status === "pending" ? `
        <button class="ghost" data-act="skip" data-id="${id}">Skip</button>
        <button class="primary" data-act="approve" data-id="${id}">${d.tier === "high" ? "I've reviewed it — approve" : "Approve"}</button>` : ""}
      ${r.status === "undo" ? `
        <span class="countdown">Sending in <b data-countdown="${id}">${mm}:${ss}</b></span>
        <button class="ghost" data-act="ff" data-id="${id}" title="Demo only">Skip wait</button>
        <button class="danger" data-act="undo" data-id="${id}">Undo</button>` : ""}
      ${r.status === "sent" && d.recipientForm ? `<span class="ok">✓ Approved · open the form and paste the request</span>` : ""}
      ${r.status === "sent" && !d.recipientForm ? `<span class="ok">✓ Sent from your Gmail · deadline ${fmtDate(new Date(Date.now() + 90 * 864e5).toISOString())} added to Calendar</span>` : ""}
      ${r.status === "cancelled" ? `<span class="muted">Undone. Nothing was sent.</span>` : ""}
      ${r.status === "skipped" ? `<span class="muted">Skipped.</span>` : ""}
    </div>
  </article>`;
}

async function onCardAction(id: string, act: string) {
  const r = state.review.find((x) => x.draft.companyId === id)!;
  if (act === "lang-en" || act === "lang-hi") r.lang = act === "lang-en" ? "en" : "hi";
  else if (act === "toggle") r.open = !r.open;
  else if (act === "approve") await approve(r);
  else if (act === "skip") { r.status = "skipped"; await audit.append({ actor: "user", action: "reject", target: id, sourceRef: r.draft.sourceRef, details: {} }); }
  else if (act === "undo") { r.status = "cancelled"; r.undoUntil = null; await audit.append({ actor: "user", action: "undo", target: id, sourceRef: r.draft.sourceRef, details: {} }); }
  else if (act === "ff") r.undoUntil = Date.now();
  renderReview();
  if (!reduceMotion && (act === "approve" || act === "undo")) {
    const card = document.querySelector(`[data-card="${CSS.escape(id)}"]`);
    if (card) gsap.fromTo(card, { scale: 0.97 }, { scale: 1, duration: 0.5, ease: "back.out(3)", clearProps: "scale" });
  }
}

async function approve(r: ReviewItem) {
  const id = r.draft.companyId;
  await audit.append({ actor: "user", action: "approve", target: id, sourceRef: r.draft.sourceRef, details: { type: r.draft.requestType, tier: r.draft.tier, language: r.lang } });
  if (r.draft.tier === "high") { r.status = "undo"; r.undoUntil = Date.now() + UNDO_MS; }
  else await send(r);
  renderReview();
}

async function send(r: ReviewItem) {
  r.status = "sent"; r.undoUntil = null;
  const sentAt = new Date();
  await audit.append({ actor: "agent", action: "send", target: r.draft.companyId, sourceRef: r.draft.sourceRef, details: { type: r.draft.requestType, language: r.lang, sandbox: r.draft.needsRecipient } });
  state.tracked.unshift({
    id: `req-${r.draft.companyId}-${sentAt.getTime()}`, companyId: r.draft.companyId, companyName: r.draft.companyName,
    type: r.draft.requestType, status: "sent", sentAt: sentAt.toISOString(),
    deadlineAt: new Date(sentAt.getTime() + 90 * 864e5).toISOString(),
    gmailMessageId: null, calendarEventId: null, sourceRef: r.draft.sourceRef, evidence: [],
  });
  const fp = state.byId.get(r.draft.companyId);
  if (fp) fp.status = "request_open";
}

// Undo-window ticker
setInterval(async () => {
  let changed = false;
  for (const r of state.review) {
    if (r.status === "undo" && r.undoUntil && r.undoUntil <= Date.now()) { await send(r); changed = true; }
  }
  if (changed && state.view === "review") renderReview();
  else if (state.view === "review") {
    document.querySelectorAll<HTMLElement>("[data-countdown]").forEach((el) => {
      const r = state.review.find((x) => x.draft.companyId === el.dataset.countdown);
      if (!r?.undoUntil) return;
      const ms = Math.max(0, r.undoUntil - Date.now());
      el.textContent = `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
    });
  }
}, 1000);

// ---------- tracker + digest ----------
function renderTracker() {
  const host = $("#view-tracker");
  const all = state.tracked;
  const count = (s: RequestStatus) => all.filter((r) => r.status === s).length;
  const overdue = all.filter((r) => r.status === "overdue");
  const digest = `${count("confirmed")} confirmed deletion, ${count("id_requested")} asked for ID, ${overdue.length} ignored you.${overdue.length ? " Escalate?" : ""}`;
  const esc_r = state.escalating ? all.find((r) => r.id === state.escalating) : null;
  host.innerHTML = `
    <div class="tracker-layout">
      <div>
        <h2>Priya's requests</h2>
        <p class="muted">Each bar fills up towards the 90-day deadline. Deadlines are also added to Google Calendar.</p>
        <ol class="timeline">${all.map((r) => {
          const pct = Math.min(100, ((Date.now() - +new Date(r.sentAt)) / (+new Date(r.deadlineAt) - +new Date(r.sentAt))) * 100);
          return `<li class="tl st-${r.status}">
            <div class="tl-head"><b>${esc(r.companyName)}</b><span class="pill st-${r.status}">${STATUS_LABEL[r.status] ?? r.status}</span></div>
            <div class="small muted">${TYPE_LABEL[r.type] ?? r.type} · sent ${fmtDate(r.sentAt)} · deadline ${fmtDate(r.deadlineAt)}</div>
            <div class="bar"><i style="width:${pct}%"></i></div>
            ${r.evidence.length ? `<div class="small">Reply kept as evidence: <code>${esc(r.evidence[0])}</code></div>` : ""}
            ${r.status === "id_requested" ? `<div class="note small">They asked you to verify your identity. Reply from your registered email. Never send an Aadhaar or PAN copy unless you choose to.</div>` : ""}
            ${r.status === "overdue" ? `<button class="primary small-btn" data-escalate="${esc(r.id)}">Escalate to grievance officer</button>` : ""}
          </li>`;
        }).join("")}</ol>
      </div>
      <aside>
        <div class="digest">
          <div class="digest-head">Weekly digest · WhatsApp</div>
          <div class="bubble">${esc(digest)}</div>
          ${overdue.length ? `<button class="primary block" data-escalate="${esc(overdue[0].id)}">Escalate ${esc(overdue[0].companyName)}</button>` : ""}
          <div class="small muted">I will never ask for your OTP, PIN or Aadhaar.</div>
        </div>
        ${reportCardHtml(all)}
        ${esc_r?.escalation ? `
          <div class="email escalation">
            <div class="lang">
              <button data-elang="en" aria-pressed="${state.escalationLang === "en"}">English</button>
              <button data-elang="hi" aria-pressed="${state.escalationLang === "hi"}">हिन्दी</button>
            </div>
            <div class="subj">${esc(esc_r.escalation[state.escalationLang].subject)}</div>
            <pre>${esc(esc_r.escalation[state.escalationLang].body)}</pre>
            <button class="primary block" id="approve-escalation">Approve escalation</button>
          </div>` : ""}
      </aside>
    </div>`;
  host.querySelectorAll<HTMLElement>("[data-escalate]").forEach((b) => b.addEventListener("click", () => { state.escalating = b.dataset.escalate!; renderTracker(); }));
  host.querySelectorAll<HTMLElement>("[data-elang]").forEach((b) => b.addEventListener("click", () => { state.escalationLang = b.dataset.elang as Language; renderTracker(); }));
  host.querySelector("#approve-escalation")?.addEventListener("click", async () => {
    const r = esc_r!;
    await audit.append({ actor: "user", action: "approve", target: r.id, sourceRef: r.gmailMessageId, details: { escalation: "grievance_officer" } });
    await audit.append({ actor: "agent", action: "status_change", target: r.id, sourceRef: r.gmailMessageId, details: { from: r.status, to: "escalated_go" } });
    r.status = "escalated_go"; state.escalating = null; renderTracker();
    if (!reduceMotion) gsap.from(".tl.st-escalated_go", { backgroundColor: "rgba(52,211,153,0.35)", duration: 1.2 });
  });
}

function reportCardHtml(all: TrackedRequest[]): string {
  const done = all.filter((r) => r.status !== "sent" || r.repliedAt);
  if (!done.length) return "";
  const days = (r: TrackedRequest) => Math.round((+new Date(r.repliedAt!) - +new Date(r.sentAt)) / 864e5);
  const replied = done.filter((r) => r.repliedAt);
  const sorted = replied.map(days).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
  const grade = (r: TrackedRequest) => r.status === "confirmed" ? (days(r) <= 15 ? "A" : "B") : r.status === "id_requested" ? "C" : r.status === "overdue" || r.status === "escalated_go" ? "F" : "–";
  return `<div class="report-card">
    <h3>Company report card</h3>
    <p class="small muted">${replied.length}/${done.length} replied · median ${median ?? "–"} days · from your requests only</p>
    <table><thead><tr><th>Company</th><th>Outcome</th><th>Days</th><th>Grade</th></tr></thead><tbody>
    ${done.map((r) => `<tr><td>${esc(r.companyName)}</td><td>${STATUS_LABEL[r.status] ?? r.status}</td><td>${r.repliedAt ? days(r) : "—"}</td><td><span class="grade g-${grade(r)}">${grade(r)}</span></td></tr>`).join("")}
    </tbody></table>
    <p class="small muted">A: deleted within 15 days · B: deleted later · C: asked for ID · F: ignored past 90 days</p>
  </div>`;
}

// ---------- audit drawer ----------
async function renderAudit() {
  const events = audit.all();
  $("#audit-count").textContent = String(events.length);
  const broken = await audit.verify();
  $("#audit").innerHTML = `
    <div class="audit-head"><h3>Audit log</h3><span class="${broken ? "warn" : "ok"}">${broken ? `Chain broken at #${broken}` : "✓ Hash chain intact"}</span></div>
    <ol class="audit-list">${[...events].reverse().map((e) => `
      <li><span class="seq">#${e.seq}</span> <b>${esc(e.actor)}</b> ${esc(e.action)} <span class="muted">${esc(state.byId.get(e.target)?.company.name ?? e.target)}</span>
      <div class="small muted mono">${new Date(e.at).toLocaleTimeString("en-IN")} · ${e.hash.slice(0, 12)}… ← ${e.prevHash.slice(0, 8)}…</div></li>`).join("")}
    </ol>`;
}

// ---------- boot ----------
(async () => {
  const fr = await getFootprint();
  state.footprints = fr.footprints;
  state.scannedAt = new Date(fr.scannedAt);
  state.byId = new Map(fr.footprints.map((f) => [f.company.id, f]));
  state.tracked = (await listRequests()).map((r) => ({ ...r }));
  renderHeadline(); renderFilters(); renderPanel(); renderAudit();
  // Deep links for rehearsal / backup demo: #map, #review-demo, #tracker, #rural; anything else opens the home page.
  const hash = location.hash.slice(1);
  if (hash === "review-demo") { setView("map"); pickHighRisk(); await startReview(); }
  else if (hash === "map" || hash === "review" || hash === "tracker" || hash === "rural") setView(hash);
  else setView("home");
  // Back/forward and in-page #links route too.
  addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    const v: View = h === "map" || h === "review" || h === "tracker" || h === "rural" ? h : "home";
    if (v !== state.view) setView(v);
  });
})();
