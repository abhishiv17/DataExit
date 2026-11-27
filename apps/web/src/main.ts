import "./style.css";
import {
  isHighSensitivity, RETENTION_LABELS, RIGHTS_IN_FORCE_FROM, sensitivityBand,
  type DataCategory, type FootprintView, type Language, type RequestStatus,
} from "@dataexit/shared/ui";
import * as api from "./api";
import { LIVE, McpUnavailable, ToolError, type Draft, type EscalationDraft, type TrackedRequest, type UiAuditEvent } from "./api";
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
  redirected: "Redirected",
};
const ESCALATE_LABEL: Record<string, string> = {
  reminder: "Send a reminder", grievance_officer: "Escalate to grievance officer", dpb: "Draft a Data Protection Board complaint",
};

// ---------- state ----------
type ReviewStatus = "pending" | "undo" | "sent" | "cancelled" | "skipped";
interface ReviewItem {
  draft: Draft; lang: Language; status: ReviewStatus; undoUntil: number | null; open: boolean;
  /** Live: last refusal from the server for this card, and the recipient the user typed. */
  error?: string; note?: string; recipient?: string; busy?: boolean;
  /** Live: SEND_MODE=dry_run previewed it; nothing left the server. */
  dryRun?: boolean;
}

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
  // Live only
  escalation: null as EscalationDraft | null,
  escalationNote: null as string | null,
  pendingSends: new Map<string, number>(), // escalation request id → undo window end
  digest: null as string | null,
  needName: false,
  sendNote: null as string | null,
  serverAudit: { events: [] as UiAuditEvent[], brokenAt: null as number | null },
  names: new Map<string, string>(), // request id → company name, for the audit drawer
};

// ---------- live helpers ----------
function showNotice(msg: string | null, kind: "error" | "info" = "error") {
  const host = $("#notice");
  host.hidden = !msg;
  host.className = `notice notice-${kind}`;
  host.innerHTML = msg ? `<span>${esc(msg)}</span><button class="link" aria-label="Dismiss">✕</button>` : "";
  host.querySelector("button")?.addEventListener("click", () => showNotice(null));
}
function errorText(e: unknown): string {
  if (e instanceof ToolError) return e.hint ? `${e.message} ${e.hint}` : e.message;
  if (e instanceof McpUnavailable) return `${e.message} Start it with: npm run start:http`;
  return (e as Error).message;
}
/** Runs a live call; on failure shows the reason and returns undefined. Refreshes the server audit log. */
async function live<T>(fn: () => Promise<T>, onError?: (msg: string, e: unknown) => void): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    const msg = errorText(e);
    if (onError) onError(msg, e); else showNotice(msg);
    return undefined;
  } finally {
    void refreshServerAudit();
  }
}
async function refreshServerAudit() {
  if (!LIVE) return;
  try { state.serverAudit = await api.getAuditLog(); renderAudit(); } catch { /* the notice already explains */ }
}
async function refreshTracked() {
  if (!LIVE) return;
  const rows = await live(() => api.listRequests());
  if (!rows) return;
  state.tracked = rows;
  for (const r of rows) state.names.set(r.id, r.companyName);
  for (const r of rows) {
    const fp = state.byId.get(r.companyId);
    if (fp) fp.status = r.status === "confirmed" ? "closed" : "request_open";
  }
  state.digest = (await live(() => api.weeklyDigest(state.escalationLang))) ?? null;
}
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
// Door on the right; the arrow and three "bits" of data slip out of it on a loop (see .logo in style.css).
const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="lg-door" d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><g class="lg-arrow"><path d="M9 8l-4 4 4 4"/><path d="M5 12h10"/></g><circle class="lg-bit b1" cx="15" cy="9" r="1.1"/><circle class="lg-bit b2" cx="16" cy="15" r="1.1"/><circle class="lg-bit b3" cx="14" cy="12" r="0.9"/></svg>`;
document.querySelector("#app")!.innerHTML = `
  <header class="top">
    <button class="brand" data-view="home" aria-label="Data Exit home"><span class="logo">${LOGO}</span> <span class="brand-word">Data <b>Exit</b></span></button>
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
    <span class="source-badge app-only source-${LIVE ? "live" : "demo"}" title="${LIVE ? `Data and actions come from the Data Exit MCP tools at ${esc(api.MCP_URL)}` : "Seeded demo data; nothing leaves the browser"}">${LIVE ? "● Live MCP" : "Demo data"}</span>
    <button id="audit-toggle" class="ghost app-only" title="Every action is logged in a tamper-evident hash chain">Audit log <span id="audit-count">0</span></button>
    <button class="primary home-only" data-view="map">Open the demo →</button>
  </header>
  <div class="guide app-only" id="guide"></div>
  <div id="notice" class="notice" role="status" hidden></div>
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
    next: "Select the riskiest", action: () => { pickHighRisk(); },
  },
  review: {
    step: "Step 2 of 3", title: "Approve the requests",
    body: "Data Exit wrote one request per company, addressed to its grievance officer. Companies that must keep some data by law (bank KYC, telecom, insurance) get a <b>restrict use</b> request instead of erasure. <b>Nothing is sent until you approve.</b> High-risk requests wait 10 minutes so you can undo.",
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
  const next = v === "map" ? `Select the ${riskiest().length} riskiest` : g.next;
  host.innerHTML = `
    <div class="guide-inner">
      <div class="guide-text">
        <div class="guide-step"><span class="step-pill">${g.step}</span> <span class="persona">${LIVE
          ? `Live MCP tools · every action goes through the policy layer${state.sendNote ? ` · ${esc(state.sendNote)}` : ""}`
          : `Demo inbox: "Priya" (made up) · nothing is really sent`}</span></div>
        <h1>${g.title}</h1>
        <p>${g.body}</p>
      </div>
      <button class="primary guide-next">${next} →</button>
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
    <div class="stat hot"><b>${high.length}</b><span>of those hold her Aadhaar, PAN, bank or health data</span></div>`;
}

const riskiest = () => state.footprints.filter((f) => f.highSensitivity && age(f) > 3 && isOpen(f));
function pickHighRisk() {
  state.selected = new Set(riskiest().map((f) => f.company.id));
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
    host.innerHTML = `<div class="panel-empty"><div class="hand">👆</div><h2>Click any dot on the map</h2><p>You'll see:</p><ul><li>the email that revealed the company</li><li>what data it probably holds</li><li>whether the law lets it keep that data</li></ul><p class="small muted">Or press <b>Select the riskiest</b> above to jump straight to the riskiest ones.</p></div>`;
    return;
  }
  const c = fp.company;
  const band = sensitivityBand(fp.sensitivity);
  const yrs = age(fp);
  const sel = state.selected.has(c.id);
  host.innerHTML = `
    <div class="panel-head">
      <h2>${esc(c.name)}</h2>
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
    ${c.retentionDuties.length ? `<div class="note">⚖ Must keep some data under ${esc(c.retentionDuties.map((d) => RETENTION_LABELS[d]).join(", "))}.${c.retentionDuties.some((d) => d !== "tax")
      ? ` We'll ask them to <b>restrict use</b> instead of erasing.`
      : ` Tax records stay, but the rest can still be erased.`}</div>` : ""}
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
// Demo: the browser simulates the pipeline and keeps its own audit chain.
// Live: drafts, approvals, undo, reject and send are MCP tool calls; the server enforces tiers and
// the undo window, and the drawer shows the server's audit chain.
const reviewKey = (r: ReviewItem) => r.draft.companyId;
/** Requests the law changed (erase → restrict use, e.g. banks under RBI KYC) come first, so they are seen. */
const reviewOrder = () => [...state.review].sort((a, b) => Number(b.draft.changed) - Number(a.draft.changed));

async function startReview() {
  const existing = new Set(state.review.map(reviewKey));
  const ids = [...state.selected].filter((id) => !existing.has(id));
  if (LIVE) {
    if (ids.length) {
      const res = await live(() => api.draftRequests(ids, state.byId), (msg, e) => {
        if (e instanceof ToolError && e.code === "NEED_USER_NAME") state.needName = true;
        else showNotice(msg);
      });
      if (!res) { setView("review"); return; }
      addLiveDrafts(res.drafts);
      if (res.skipped.length) showNotice(`Skipped ${res.skipped.length}: ${res.skipped.map((s) => `${state.byId.get(s.companyId)?.company.name ?? s.companyId} (${s.reason})`).join("; ")}`, "info");
    }
  } else {
    const { drafts } = await api.draftRequests(ids, state.byId);
    for (const draft of drafts) {
      state.review.push({ draft, lang: "en", status: "pending", undoUntil: null, open: false });
      await audit.append({ actor: "agent", action: "propose", target: draft.companyId, sourceRef: draft.sourceRef, details: { type: draft.requestType, tier: draft.tier, changedFrom: draft.changed ? draft.goal : null } });
    }
    // Ground rule 2: a full-review request is approved with its text on screen. Open the first
    // card's email so it can be approved in one tap; the others open when you press approve.
    const first = reviewOrder().find((r) => r.status === "pending");
    if (first?.draft.tier === "high" && !state.review.some((r) => r.open)) first.open = true;
  }
  state.selected.clear(); graph?.refresh(); renderSelectionBar();
  setView("review");
}

function addLiveDrafts(drafts: Draft[]) {
  for (const draft of drafts) {
    state.names.set(draft.requestId!, draft.companyName);
    const undoUntil = draft.undoUntil ? Date.parse(draft.undoUntil) : null;
    const item: ReviewItem = {
      draft, lang: draft.language ?? "en", open: draft.tier === "high",
      status: draft.serverStatus === "approved" ? "undo" : "pending",
      undoUntil: draft.serverStatus === "approved" ? (undoUntil ?? Date.now()) : null,
    };
    const at = state.review.findIndex((r) => reviewKey(r) === draft.companyId);
    if (at >= 0) state.review[at] = item; else state.review.push(item);
    const fp = state.byId.get(draft.companyId);
    if (fp) fp.status = "request_open";
  }
}

function renderReview() {
  const host = $("#view-review");
  const pending = state.review.filter((r) => r.status === "pending");
  $("#review-count").textContent = pending.length ? String(pending.length) : "";
  if (LIVE && state.needName) {
    host.innerHTML = `<form class="empty name-form" id="name-form">
      <h2>Whose name goes on the requests?</h2>
      <p>Companies match requests to accounts by name. Use the name registered with them. It is saved on the Data Exit server, not sent anywhere else.</p>
      <input id="user-name" required minlength="2" autocomplete="name" placeholder="Full name" />
      <button class="primary" type="submit">Draft the requests →</button>
    </form>`;
    host.querySelector<HTMLFormElement>("#name-form")!.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const userName = (host.querySelector("#user-name") as HTMLInputElement).value.trim();
      const ids = [...state.selected];
      const res = await live(() => api.draftRequests(ids, state.byId, { userName }));
      if (!res) return;
      state.needName = false;
      addLiveDrafts(res.drafts);
      state.selected.clear(); graph?.refresh(); renderSelectionBar(); renderReview();
    });
    return;
  }
  if (!state.review.length) {
    host.innerHTML = `<div class="empty"><h2>Nothing to review yet</h2><p>Start at step 1: pick companies on the data map, then draft requests.</p><button class="primary" id="to-map">Go to step 1 →</button></div>`;
    host.querySelector("#to-map")!.addEventListener("click", () => setView("map"));
    return;
  }
  const restricted = state.review.filter((r) => r.draft.changed).length;
  const basisNote = new Date() < RIGHTS_IN_FORCE_FROM
    ? `Before ${fmtDate(RIGHTS_IN_FORCE_FROM.toISOString())}, these are <b>policy-based (courtesy) requests</b>: DPDP data-principal rights are not yet in force.`
    : `These are statutory requests under the DPDP Act, 2023.`;
  const oneTap = pending.filter((r) => r.draft.tier !== "high" && !(LIVE && r.draft.needsRecipient));
  host.innerHTML = `
    <div class="review-head">
      <div>
        <div class="summary-pills"><span><b>${state.review.length}</b> drafted</span><span><b>${state.review.length - restricted}</b> erase</span><span class="sp-warn"><b>${restricted}</b> switched to restrict-use (law)</span><span class="sp-ok"><b>${state.review.filter((r) => r.status === "sent" && !r.dryRun).length}</b> sent</span></div>
      </div>
      <div class="actions">
        ${oneTap.length ? `<button class="ghost" id="approve-medium">Approve all one-tap (${oneTap.length})</button>` : ""}
      </div>
    </div>
    <div class="note legal">${basisNote} Section numbers are marked [verify] until checked.</div>
    <div class="cards">${reviewOrder().map(cardHtml).join("")}</div>`;
  host.querySelector("#approve-medium")?.addEventListener("click", async () => {
    for (const r of oneTap) if (r.status === "pending") await approve(r);
  });
  host.querySelectorAll<HTMLElement>("[data-act]").forEach((el) => el.addEventListener("click", () => onCardAction(el.dataset.id!, el.dataset.act!)));
  host.querySelectorAll<HTMLInputElement>("[data-recipient]").forEach((el) => el.addEventListener("input", () => {
    const r = state.review.find((x) => reviewKey(x) === el.dataset.recipient);
    if (r) r.recipient = el.value.trim();
  }));
}

function cardHtml(r: ReviewItem): string {
  const d = r.draft;
  const fp = state.byId.get(d.companyId);
  const src = fp?.evidence.find((e) => e.messageId === d.sourceRef) ?? fp?.evidence[0];
  const t = d[r.lang] ?? d.en ?? d.hi!;
  const id = esc(d.companyId);
  const remaining = r.undoUntil ? Math.max(0, r.undoUntil - Date.now()) : 0;
  const mm = String(Math.floor(remaining / 60000)).padStart(2, "0"), ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");
  // Ground rule 2: full-review requests are approved only with the full text on screen.
  const mustRead = d.tier === "high" && !r.open;
  const canSwitchLang = !LIVE || r.status === "pending";
  return `
  <article class="card status-${r.status}" data-card="${id}">
    <div class="card-top">
      <div>
        <h2>${esc(d.companyName)}</h2>
        <div class="muted small">${esc(SECTOR_LABEL[d.sector] ?? d.sector)}${fp ? ` · unused since ${fmtDate(fp.lastSeen)}` : ""}</div>
      </div>
      <div class="pills">
        <span class="pill type-${d.requestType}">${TYPE_LABEL[d.requestType]}</span>
        <span class="pill tier-${d.tier}" title="Approval tier">${d.tier === "high" ? "Full review · 10-min undo" : d.tier === "medium" ? "One-tap" : "Auto-eligible"}</span>
      </div>
    </div>
    ${d.changed ? `<div class="note">⚖ You asked to erase, but they ${esc(d.reason.charAt(0).toLowerCase() + d.reason.slice(1))} Asking them to <b>restrict use</b> to that legal purpose instead.</div>` : fp ? `<p class="small">Holds: ${fp.company.dataCategories.map((k) => esc(CATEGORY_LABEL[k])).join(", ")}</p>` : ""}
    ${src ? `<p class="small source">Source: “${esc(src.subject)}” · ${fmtDate(src.date)}</p>` : ""}
    ${recipientHtml(r)}
    <div class="lang">
      <button data-act="lang-en" data-id="${id}" aria-pressed="${r.lang === "en"}" ${canSwitchLang ? "" : "disabled"}>English</button>
      <button data-act="lang-hi" data-id="${id}" aria-pressed="${r.lang === "hi"}" ${canSwitchLang ? "" : "disabled"}>हिन्दी</button>
      <button data-act="toggle" data-id="${id}" class="link">${r.open ? "Hide email" : "Show email"}</button>
    </div>
    ${r.open ? `<div class="email" lang="${r.lang}"><div class="subj">${esc(t.subject)}</div><pre>${esc(t.body)}</pre></div>` : ""}
    ${r.error ? `<div class="note warn small">${esc(r.error)}</div>` : ""}
    <div class="card-actions">
      ${r.status === "pending" ? `
        <button class="ghost" data-act="skip" data-id="${id}" ${r.busy ? "disabled" : ""}>Skip</button>
        <button class="primary" data-act="approve" data-id="${id}" ${r.busy ? "disabled" : ""}>${mustRead ? "Read the full email to approve" : d.tier === "high" ? "I've reviewed it — approve" : "Approve"}</button>` : ""}
      ${r.status === "undo" ? `
        <span class="countdown">Sending in <b data-countdown="${id}">${mm}:${ss}</b></span>
        ${LIVE ? "" : `<button class="ghost" data-act="ff" data-id="${id}" title="Demo only">Skip wait</button>`}
        <button class="danger" data-act="undo" data-id="${id}" ${r.busy ? "disabled" : ""}>Undo</button>` : ""}
      ${r.status === "sent" && d.recipientForm ? `<span class="ok">✓ Approved · open the form and paste the request</span>` : ""}
      ${r.status === "sent" && !d.recipientForm ? `<span class="ok">${esc(r.note ?? `✓ Sent from your Gmail · deadline ${fmtDate(new Date(Date.now() + 90 * 864e5).toISOString())} added to Calendar`)}</span>` : ""}
      ${r.status === "pending" && r.note ? `<span class="muted">${esc(r.note)}</span>` : ""}
      ${r.status === "cancelled" ? `<span class="muted">Undone. Nothing was sent.</span>` : ""}
      ${r.status === "skipped" ? `<span class="muted">Skipped.</span>` : ""}
    </div>
  </article>`;
}

function recipientHtml(r: ReviewItem): string {
  const d = r.draft;
  if (LIVE && d.needsRecipient) {
    return r.status === "pending"
      ? `<label class="small warn recipient-input">No verified grievance contact. Their privacy email (from their privacy policy):
          <input type="email" data-recipient="${esc(d.companyId)}" value="${esc(r.recipient ?? "")}" placeholder="privacy@company.com" /></label>`
      : `<p class="small">To: <b>${esc(r.recipient ?? "")}</b> (you gave this address)</p>`;
  }
  if (d.needsRecipient) return `<p class="small warn">Grievance contact not verified yet. Test sends go to the sandbox inbox.</p>`;
  if (d.recipient) return `<p class="small">To: <b>${esc(d.recipient)}</b>${d.recipientSource ? ` <a href="${esc(d.recipientSource)}" target="_blank" rel="noopener">(source)</a>` : ""}</p>`;
  return `<p class="small">Submit via their <a href="${esc(d.recipientForm)}" target="_blank" rel="noopener">privacy request form</a>; we'll pre-fill the text for you to paste.</p>`;
}

async function onCardAction(id: string, act: string) {
  const r = state.review.find((x) => reviewKey(x) === id)!;
  r.error = undefined;
  if (act === "lang-en" || act === "lang-hi") {
    const lang: Language = act === "lang-en" ? "en" : "hi";
    if (LIVE && !r.draft[lang] && r.status === "pending") {
      r.busy = true; renderReview();
      const d = await live(() => api.redraftInLanguage(r.draft, lang, state.byId), (msg) => { r.error = msg; });
      r.busy = false;
      if (d) { r.draft = d; state.names.set(d.requestId!, d.companyName); }
    }
    if (r.draft[lang]) r.lang = lang;
  }
  else if (act === "toggle") r.open = !r.open;
  else if (act === "approve") await approve(r);
  else if (act === "skip") {
    if (LIVE) {
      const ok = await live(async () => { await api.reject(r.draft.requestId!, "skipped in review"); return true; }, (m) => { r.error = m; });
      if (ok) r.status = "skipped";
    } else {
      r.status = "skipped";
      await audit.append({ actor: "user", action: "reject", target: id, sourceRef: r.draft.sourceRef, details: {} });
    }
  }
  else if (act === "undo") {
    if (LIVE) {
      const ok = await live(async () => { await api.undo(r.draft.requestId!); return true; }, (m) => { r.error = m; });
      if (ok) { r.status = "pending"; r.undoUntil = null; r.note = "Undone. Nothing was sent; you can approve again."; }
    } else {
      r.status = "cancelled"; r.undoUntil = null;
      await audit.append({ actor: "user", action: "undo", target: id, sourceRef: r.draft.sourceRef, details: {} });
    }
  }
  else if (act === "ff") r.undoUntil = Date.now();
  renderReview();
  if (!reduceMotion && (act === "approve" || act === "undo")) {
    const card = document.querySelector(`[data-card="${CSS.escape(id)}"]`);
    if (card) gsap.fromTo(card, { scale: 0.97 }, { scale: 1, duration: 0.5, ease: "back.out(3)", clearProps: "scale" });
  }
}

async function approve(r: ReviewItem) {
  const id = r.draft.companyId;
  // Ground rule 2 (demo and live): show the full text before a full-review approval.
  if (r.draft.tier === "high" && !r.open) { r.open = true; renderReview(); return; }
  if (!LIVE) {
    await audit.append({ actor: "user", action: "approve", target: id, sourceRef: r.draft.sourceRef, details: { type: r.draft.requestType, tier: r.draft.tier, language: r.lang } });
    if (r.draft.tier === "high") { r.status = "undo"; r.undoUntil = Date.now() + UNDO_MS; }
    else await send(r);
    renderReview();
    return;
  }
  if (r.draft.needsRecipient && !r.recipient) { r.error = "Add the company's privacy email first."; renderReview(); return; }
  r.busy = true; r.note = undefined; renderReview();
  const res = await live(
    () => api.approve(r.draft.requestId!, { reviewed: r.draft.tier === "high", ...(r.draft.needsRecipient ? { recipient: r.recipient } : {}) }),
    (msg) => { r.error = msg; },
  );
  r.busy = false;
  if (res) {
    const until = res.undoUntil ? Date.parse(res.undoUntil) : 0;
    if (until > Date.now()) { r.status = "undo"; r.undoUntil = until; }
    else await send(r);
  }
  renderReview();
}

async function send(r: ReviewItem) {
  if (!LIVE) {
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
    return;
  }
  const id = r.draft.requestId!;
  const res = await live(() => api.send([id]), (msg) => { r.error = msg; });
  if (!res) return;
  state.sendNote = res.modeNote;
  const sent = res.sent.find((x) => x.id === id);
  if (sent) {
    r.status = "sent"; r.undoUntil = null;
    r.note = `✓ ${res.mode === "live" ? "Sent from your Gmail" : res.mode === "sandbox" ? "Sent to the sandbox inbox (not the company)" : "Sent"}${sent.deadline ? ` · deadline ${fmtDate(sent.deadline)} added to Calendar` : ""}`;
    await refreshTracked();
  } else if (res.previews.includes(id)) {
    r.status = "sent"; r.undoUntil = null; r.dryRun = true;
    r.note = "Dry run: nothing was sent (SEND_MODE=dry_run on the server).";
  } else if (res.pending.includes(id)) {
    r.undoUntil = Date.now() + 5000; // the server's clock says not yet; try again shortly
  } else {
    r.error = res.blocked.find((b) => b.id === id)?.message ?? "Not sent.";
    r.status = "pending"; r.undoUntil = null;
  }
  renderGuide(state.view);
}

// Undo-window ticker: sends once the window has passed (demo and live), plus approved escalations (live).
let ticking = false;
setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    let changed = false;
    for (const r of state.review) {
      if (r.status === "undo" && r.undoUntil && r.undoUntil <= Date.now()) { await send(r); changed = true; }
    }
    for (const [id, until] of state.pendingSends) {
      if (until > Date.now()) continue;
      const res = await live(() => api.send([id]));
      if (res?.pending.includes(id)) { state.pendingSends.set(id, Date.now() + 5000); continue; }
      state.pendingSends.delete(id);
      if (res) {
        state.escalationNote = res.sent.some((s) => s.id === id)
          ? `✓ Escalation sent. ${res.modeNote}`
          : res.previews.includes(id) ? "Dry run: nothing was sent." : (res.blocked[0]?.message ?? null);
      }
      await refreshTracked();
      if (state.view === "tracker") renderTracker();
    }
    if (changed && state.view === "review") renderReview();
    else if (state.view === "review") {
      document.querySelectorAll<HTMLElement>("[data-countdown]").forEach((el) => {
        const r = state.review.find((x) => reviewKey(x) === el.dataset.countdown);
        if (!r?.undoUntil) return;
        const ms = Math.max(0, r.undoUntil - Date.now());
        el.textContent = `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
      });
    }
  } finally {
    ticking = false;
  }
}, 1000);

// ---------- tracker + digest ----------
/** Which ladder step a row offers: live uses the tracker's next_action; the demo offers it on overdue rows. */
function escalationOffer(r: TrackedRequest): string | null {
  if (!LIVE) return r.status === "overdue" ? "grievance_officer" : null;
  return r.nextAction?.action === "escalate" ? r.nextAction.level : null;
}

function nextActionNote(r: TrackedRequest): string {
  const n = r.nextAction;
  if (!LIVE || !n) return "";
  if (n.action === "wait" && n.until) return `<div class="small muted">Next step from ${fmtDate(n.until)}</div>`;
  if (n.action === "offer_restrict") return `<div class="note small">They may keep this data by law. Ask them to restrict its use instead.</div>`;
  if (n.action === "approve" || n.action === "send") return `<div class="small muted">An escalation draft is waiting for your approval.</div>`;
  if (n.action === "file_personally") return `<div class="small muted">A Data Protection Board complaint is drafted for you to file yourself.</div>`;
  return "";
}

function renderTracker() {
  const host = $("#view-tracker");
  const all = state.tracked;
  const count = (s: RequestStatus) => all.filter((r) => r.status === s).length;
  const offers = all.filter((r) => escalationOffer(r));
  const overdue = all.filter((r) => r.status === "overdue");
  const digest = LIVE && state.digest
    ? state.digest
    : `${count("confirmed")} confirmed deletion, ${count("id_requested")} asked for ID, ${overdue.length} ignored you.${overdue.length ? " Escalate?" : ""}`;
  const escR = state.escalating ? all.find((r) => r.id === state.escalating) : null;
  const liveEsc = LIVE && escR && state.escalation ? state.escalation : null;
  host.innerHTML = `
    <div class="tracker-layout">
      <div>
        <div class="tracker-head">
          <h2>${LIVE ? "Your requests" : "Priya's requests"}</h2>
          ${LIVE ? `<button class="ghost" id="check-replies">Check replies</button>` : ""}
        </div>
        <p class="muted">Each bar fills up towards the 90-day deadline. Deadlines are also added to Google Calendar.</p>
        ${LIVE && !all.length ? `<div class="empty"><p>Nothing sent yet. Approve requests in step 2 and they appear here.</p></div>` : ""}
        <ol class="timeline">${all.map((r) => {
          const span = +new Date(r.deadlineAt) - +new Date(r.sentAt);
          const pct = span > 0 ? Math.min(100, ((Date.now() - +new Date(r.sentAt)) / span) * 100) : 100;
          const level = escalationOffer(r);
          return `<li class="tl st-${r.status}">
            <div class="tl-head"><b>${esc(r.companyName)}</b><span class="pill st-${r.status}">${STATUS_LABEL[r.status] ?? r.status}</span></div>
            <div class="small muted">${TYPE_LABEL[r.type] ?? r.type} · sent ${fmtDate(r.sentAt)} · deadline ${fmtDate(r.deadlineAt)}</div>
            <div class="bar"><i style="width:${pct}%"></i></div>
            ${r.evidence.length ? `<div class="small">Reply kept as evidence: <code>${esc(r.evidence[0])}</code></div>` : ""}
            ${r.status === "id_requested" ? `<div class="note small">They asked you to verify your identity. Reply from your registered email. Never send an Aadhaar or PAN copy unless you choose to.</div>` : ""}
            ${nextActionNote(r)}
            ${level ? `<button class="primary small-btn" data-escalate="${esc(r.id)}">${ESCALATE_LABEL[level] ?? "Escalate"}</button>` : ""}
          </li>`;
        }).join("")}</ol>
      </div>
      <aside>
        <div class="digest">
          <div class="digest-head">Weekly digest · WhatsApp</div>
          <div class="bubble">${esc(digest)}</div>
          ${offers.length ? `<button class="primary block" data-escalate="${esc(offers[0].id)}">${esc(ESCALATE_LABEL[escalationOffer(offers[0])!] ?? "Escalate")}: ${esc(offers[0].companyName)}</button>` : ""}
          <div class="small muted">I will never ask for your OTP, PIN or Aadhaar.</div>
        </div>
        ${reportCardHtml(all)}
        ${state.escalationNote ? `<div class="note small">${esc(state.escalationNote)}</div>` : ""}
        ${liveEsc ? `
          <div class="email escalation">
            <div class="small muted">${esc(ESCALATE_LABEL[liveEsc.level] ?? liveEsc.level)} · ${liveEsc.recipient ? `to <b>${esc(liveEsc.recipient)}</b>${liveEsc.recipientSource === "company_reply" ? " (the address in their reply)" : ""}` : "for you to file"}</div>
            <div class="subj">${esc(liveEsc.subject)}</div>
            <pre lang="${liveEsc.language}">${esc(liveEsc.body)}</pre>
            ${liveEsc.sendable
              ? `<button class="primary block" id="approve-escalation">I've reviewed it — approve${liveEsc.tier === "high" ? " (10-min undo)" : ""}</button>`
              : `<div class="note small">The Data Exit server cannot send this. File it yourself on the Data Protection Board's portal once it is live.</div>`}
          </div>` : ""}
        ${!LIVE && escR?.escalation ? `
          <div class="email escalation">
            <div class="lang">
              <button data-elang="en" aria-pressed="${state.escalationLang === "en"}">English</button>
              <button data-elang="hi" aria-pressed="${state.escalationLang === "hi"}">हिन्दी</button>
            </div>
            <div class="subj">${esc(escR.escalation[state.escalationLang].subject)}</div>
            <pre>${esc(escR.escalation[state.escalationLang].body)}</pre>
            <button class="primary block" id="approve-escalation">Approve escalation</button>
          </div>` : ""}
      </aside>
    </div>`;
  host.querySelectorAll<HTMLElement>("[data-escalate]").forEach((b) => b.addEventListener("click", () => openEscalation(b.dataset.escalate!)));
  host.querySelectorAll<HTMLElement>("[data-elang]").forEach((b) => b.addEventListener("click", () => { state.escalationLang = b.dataset.elang as Language; renderTracker(); }));
  host.querySelector("#check-replies")?.addEventListener("click", async (ev) => {
    const btn = ev.currentTarget as HTMLButtonElement;
    btn.disabled = true; btn.textContent = "Checking…";
    const res = await live(() => api.checkReplies());
    if (res) {
      showNotice(`${res.newReplies} new repl${res.newReplies === 1 ? "y" : "ies"} classified${res.needsReview ? `, ${res.needsReview} need a person to read them` : ""}${res.newlyOverdue ? `, ${res.newlyOverdue} now overdue` : ""}.`, "info");
      await refreshTracked();
    }
    renderTracker();
  });
  host.querySelector("#approve-escalation")?.addEventListener("click", async () => {
    if (LIVE) {
      const e = state.escalation!;
      const res = await live(() => api.approve(e.requestId, { reviewed: true }));
      if (!res) return;
      state.pendingSends.set(e.requestId, res.undoUntil ? Date.parse(res.undoUntil) : Date.now());
      state.escalationNote = res.undoUntil && Date.parse(res.undoUntil) > Date.now()
        ? `Approved. It sends at ${new Date(res.undoUntil).toLocaleTimeString("en-IN")} unless you undo it.`
        : "Approved. Sending…";
      state.escalation = null; state.escalating = null;
      renderTracker();
      return;
    }
    const r = escR!;
    await audit.append({ actor: "user", action: "approve", target: r.id, sourceRef: r.gmailMessageId, details: { escalation: "grievance_officer" } });
    await audit.append({ actor: "agent", action: "status_change", target: r.id, sourceRef: r.gmailMessageId, details: { from: r.status, to: "escalated_go" } });
    r.status = "escalated_go"; state.escalating = null; renderTracker();
    if (!reduceMotion) gsap.from(".tl.st-escalated_go", { backgroundColor: "rgba(52,211,153,0.35)", duration: 1.2 });
  });
}

async function openEscalation(id: string) {
  state.escalating = id;
  state.escalationNote = null;
  if (LIVE) {
    state.escalation = null;
    const draft = await live(() => api.escalate(id));
    if (!draft) { state.escalating = null; renderTracker(); return; }
    state.escalation = draft;
    state.names.set(draft.requestId, state.tracked.find((r) => r.id === id)?.companyName ?? "");
    await refreshTracked();
  }
  renderTracker();
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
// Demo: the browser's own hash chain. Live: the server's chain from get_audit_log.
async function renderAudit() {
  const events: UiAuditEvent[] = LIVE ? state.serverAudit.events : audit.all().map((e) => ({ ...e }));
  $("#audit-count").textContent = String(events.length);
  const broken = LIVE ? state.serverAudit.brokenAt : await audit.verify();
  const label = (target: string) => state.byId.get(target)?.company.name ?? state.names.get(target) ?? target;
  $("#audit").innerHTML = `
    <div class="audit-head"><h3>Audit log${LIVE ? " · server" : ""}</h3><span class="${broken ? "warn" : "ok"}">${broken ? `Chain broken at #${broken}` : "✓ Hash chain intact"}</span></div>
    ${!LIVE && events.length >= 2 ? `<div class="tamper">
      ${tamperResult
        ? `<div class="warn small">✗ Edited entry #${tamperResult.edited} (and recomputed its hash): chain broken at #${tamperResult.brokenAt}. The real log is untouched.</div>
           <button class="link" id="tamper-reset">Reset</button>`
        : `<button class="ghost" id="tamper-test" title="Works on a copy; the real log is not changed">Try editing entry #1</button>`}
    </div>` : ""}
    <ol class="audit-list">${[...events].reverse().map((e) => `
      <li class="${tamperResult && e.seq === tamperResult.edited ? "tampered" : ""}"><span class="seq">#${e.seq}</span> <b>${esc(e.actor)}</b> ${esc(e.action.replace(/_request$/, ""))} <span class="muted">${esc(label(e.target))}</span>
      <div class="small muted mono">${new Date(e.at).toLocaleTimeString("en-IN")} · ${e.hash.slice(0, 12)}… ← ${e.prevHash.slice(0, 8)}…</div></li>`).join("")}
    </ol>`;
  $("#audit").querySelector("#tamper-test")?.addEventListener("click", async () => {
    const brokenAt = await audit.tamperTest(1);
    tamperResult = brokenAt ? { edited: 1, brokenAt } : null;
    void renderAudit();
  });
  $("#audit").querySelector("#tamper-reset")?.addEventListener("click", () => { tamperResult = null; void renderAudit(); });
}
let tamperResult: { edited: number; brokenAt: number } | null = null;

// ---------- boot ----------
(async () => {
  let fr;
  try {
    fr = await api.getFootprint();
  } catch (e) {
    showNotice(`Live data unavailable. ${errorText(e)}`);
    setView(location.hash.slice(1) === "rural" ? "rural" : "home");
    return;
  }
  state.footprints = fr.footprints;
  state.scannedAt = new Date(fr.scannedAt);
  state.byId = new Map(fr.footprints.map((f) => [f.company.id, f]));
  if (LIVE) {
    await refreshTracked();
    const open = await live(() => api.listOpenDrafts(state.byId));
    if (open) addLiveDrafts(open);
    await refreshServerAudit();
  } else {
    state.tracked = (await api.listRequests()).map((r) => ({ ...r }));
  }
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
