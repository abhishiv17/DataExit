// Landing page: explains Data Exit in plain language before the demo.
// Motion: GSAP timelines + ScrollTrigger; everything is readable with motion off.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import type { FootprintView } from "@dataexit/shared/ui";

gsap.registerPlugin(ScrollTrigger, SplitText);

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ICON = {
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  rank: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  track: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>`,
  chain: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>`,
  wave: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2"/></svg>`,
};

const STEPS = [
  { icon: ICON.search, title: "Discover", body: "Reads only your Gmail <b>headers</b> (sign-up, OTP and receipt emails) and matches the senders against 290 Indian companies. Email bodies are never stored." },
  { icon: ICON.rank, title: "Prioritise", body: "Ranks every company by what it holds (Aadhaar, PAN, bank, health) and how long since you last used it." },
  { icon: ICON.mail, title: "Request, with your approval", body: "Drafts the right request (erase, restrict, withdraw consent) in English or Hindi, addressed to the verified grievance officer. <b>Nothing is sent until you approve.</b>" },
  { icon: ICON.track, title: "Follow through", body: "Tracks every deadline, reads the replies, grades the company and escalates the ones that ignore you." },
];

const TOOLS = ["discover_footprint", "lookup_company", "get_retention_rules", "draft_request", "approve_request", "send_request", "check_replies", "escalate_request"];

export function mountHome(host: HTMLElement, footprints: FootprintView[], go: (view: "map" | "rural") => void) {
  const high = footprints.filter((f) => f.highSensitivity).sort((a, b) => b.sensitivity - a.sensitivity);
  const scanRows = [...high.slice(0, 4), ...footprints.filter((f) => !f.highSensitivity).slice(0, 2)]
    .sort(() => 0.5 - Math.random()).slice(0, 6)
    .map((f) => ({ from: f.evidence[0]?.from ?? f.company.domains[0], subj: f.evidence[0]?.subject ?? "", name: f.company.name, high: f.highSensitivity }));

  host.innerHTML = `
  <div class="home">
    <section class="hero">
      <div class="blob b1"></div><div class="blob b2"></div><div class="grid-bg"></div>
      <div class="hero-copy">
        <p class="eyebrow"><span class="pulse"></span> India's DPDP Act, 2023 · An AI agent built on MCP</p>
        <h1 class="hero-title">Find every company that has your data. <em>Then take it back.</em></h1>
        <p class="hero-sub">Data Exit scans your email, shows you which apps hold your Aadhaar, PAN and bank details, and sends legally worded requests to delete them, but only after you approve each one.</p>
        <div class="hero-cta">
          <button class="primary big" data-go="map">${ICON.play} Try the 2-minute demo</button>
          <button class="ghost big" data-go="rural">Is this message a scam?</button>
        </div>
        <p class="hero-note">${ICON.lock} The demo uses a made-up inbox ("Priya"). Nothing is sent to any real company.</p>
      </div>
      <div class="scan-card" aria-label="Animated example: scanning an inbox">
        <div class="scan-head"><span class="live"></span> Scanning priya@gmail.com <span class="muted">· headers only</span></div>
        <ul class="scan-list">${scanRows.map((r) => `
          <li><span class="mail-ico">${ICON.mail}</span>
            <div class="scan-txt"><div class="scan-from">${esc(r.from)}</div><div class="scan-subj">${esc(r.subj)}</div></div>
            <span class="scan-tag ${r.high ? "t-high" : "t-low"}">${esc(r.name)}${r.high ? " · ID/bank" : ""}</span></li>`).join("")}
        </ul>
        <div class="scan-foot">
          <div><b class="count" data-to="${footprints.length}">0</b><span>companies have your data</span></div>
          <div><b class="count hot" data-to="${high.length}">0</b><span>hold ID, bank or health data</span></div>
        </div>
      </div>
      <div class="scroll-hint">Scroll to see how it works ↓</div>
    </section>

    <section class="band problem">
      <h2 class="reveal">The problem</h2>
      <p class="lead reveal">Indians have handed their identity to hundreds of apps. The law now says they can take it back, but nobody knows where to start.</p>
      <div class="stats3">
        <div class="bigstat reveal"><b data-count="69" data-suffix="%">69%</b><p>of Indians don't know they can take back consent they gave to a company.</p><small>PwC India survey of 3,233 consumers, Oct 2024</small></div>
        <div class="bigstat reveal"><b>1 in 5</b><p>families with a UPI user were hit by UPI fraud in 3 years. Half never complained.</p><small>LocalCircles survey, Jun 2025</small></div>
        <div class="bigstat reveal"><b data-count="4058" data-prefix="₹" data-suffix=" cr">₹4,058 cr</b><p>lost to "digital arrest" scams since 2022.</p><small>Government data, 2022 – May 2026</small></div>
      </div>
    </section>


    <section class="band rights">
      <h2 class="reveal">What the law lets you ask for</h2>
      <p class="lead reveal">India's Digital Personal Data Protection Act, 2023 gives every person these rights. Data Exit turns each one into a ready-to-send request.</p>
      <div class="rights-grid">
        <div class="right reveal"><b>Withdraw consent</b><span>"Stop using my data for this."</span></div>
        <div class="right reveal"><b>Erase</b><span>"Delete my data. I don't use you any more."</span></div>
        <div class="right reveal"><b>Restrict use</b><span>"Keep only what the law forces you to keep."</span></div>
        <div class="right reveal"><b>Access</b><span>"Tell me what you hold about me."</span></div>
        <div class="right reveal"><b>Correct</b><span>"Fix what's wrong."</span></div>
        <div class="right reveal"><b>Complain</b><span>Grievance officer first, then the Data Protection Board.</span></div>
      </div>
    </section>
    <section class="band how" id="how">
      <h2 class="reveal">How Data Exit works</h2>
      <p class="lead reveal">Four steps. You make every decision; the agent does the paperwork.</p>
      <div class="steps">
        <div class="steps-line"><i></i></div>
        ${STEPS.map((s, i) => `<article class="step">
          <div class="step-ico">${s.icon}<span>${i + 1}</span></div>
          <h3>${s.title}</h3><p>${s.body}</p></article>`).join("")}
      </div>
    </section>

    <section class="band law">
      <div class="law-copy">
        <h2 class="reveal">It knows the law, so you don't hit a dead end</h2>
        <p class="lead reveal">Some companies must legally keep your data. Banks keep KYC records under RBI rules. Instead of sending a request they'll refuse, Data Exit asks them to <b>restrict use</b> to that legal purpose.</p>
        <p class="small muted reveal">Before 13 May 2027, when DPDP rights take effect, requests are clearly labelled as policy-based (courtesy) requests.</p>
      </div>
      <div class="law-demo">
        <div class="chat you"><span class="who">You</span>Erase my data at <b>Kotak Mahindra Bank</b>.</div>
        <div class="chat agent"><span class="who">Data Exit</span>
          <div class="law-check"><span class="spin"></span> Checking retention rules…</div>
          <div class="law-rule">⚖ RBI KYC Directions + PMLA: banks must keep KYC records.</div>
          <div class="law-swap"><s>Erase data</s> → <b>Restrict use</b></div>
          <div class="law-out">Drafted a restrict-use request to Kotak's grievance officer. Waiting for your approval.</div>
        </div>
      </div>
    </section>

    <section class="band control">
      <h2 class="reveal">You stay in control</h2>
      <p class="lead reveal">An agent that sends legal letters for you has to be trustworthy. These rules are built into the code, not just promised.</p>
      <div class="tiles">
        <div class="tile">${ICON.shield}<h3>Approval before anything is sent</h3><p>Erasure and anything to a bank, insurer or hospital needs a full review of the exact text.</p></div>
        <div class="tile">${ICON.undo}<h3>10-minute undo</h3><p>Changed your mind? Every high-risk request waits 10 minutes before it leaves.</p></div>
        <div class="tile">${ICON.chain}<h3>Tamper-proof audit log</h3><p>Every action is written to a hash-chained log you can verify.</p></div>
        <div class="tile">${ICON.eye}<h3>Shows its source</h3><p>Every suggestion points to the exact email it came from.</p></div>
        <div class="tile">${ICON.lock}<h3>Never asks for OTP, PIN or Aadhaar</h3><p>Not ever. It says so in every conversation.</p></div>
      </div>
    </section>

    <section class="band rural">
      <div class="rural-copy">
        <p class="eyebrow">Rural mode</p>
        <h2 class="reveal">No email? No problem. Just ask "Is this a scam?"</h2>
        <p class="lead reveal">For people in villages, the biggest data risk is fraud. Forward a suspicious SMS or say it out loud. Data Exit replies in Hindi, English or Kannada, <b>reads the answer aloud</b>, and says exactly what to do, including calling 1930 if money is already gone.</p>
        <ul class="ticks reveal"><li>Voice replies by <b>ElevenLabs</b></li><li>Verdict from our <code>check_scam</code> MCP tool on <b>AWS Lambda</b> (Mumbai)</li><li>Designed for WhatsApp, the app everyone already has</li></ul>
        <button class="primary big" data-go="rural">Try the scam check</button>
      </div>
      <div class="mini-phone">
        <div class="mp-head"><span class="mp-av">D</span><div><b>Data Exit</b><small>क्या यह धोखा है?</small></div></div>
        <div class="mp-body">
          <div class="mp-msg user"><i>↪ Forwarded</i>प्रिय ग्राहक, आपका बिजली कनेक्शन आज रात 9:30 बजे कट जाएगा। तुरंत इस नंबर पर कॉल करें।</div>
          <div class="mp-typing"><i></i><i></i><i></i></div>
          <div class="mp-msg bot"><span class="mp-verdict">धोखा · Scam</span>बिजली विभाग ऐसे मैसेज नहीं भेजता। इस नंबर पर फ़ोन न करें।<div class="mp-play">${ICON.wave} 0:07 · voice reply</div></div>
        </div>
      </div>
    </section>

    <section class="band tech">
      <h2 class="reveal">Under the hood: built on MCP</h2>
      <p class="lead reveal">Claude orchestrates our own MCP servers, so one request flows through discovery, legal reasoning, drafting, approval and follow-up.</p>
      <div class="pipeline">${TOOLS.map((t) => `<span class="tool"><code>${t}</code></span>`).join(`<span class="arrow">→</span>`)}</div>
      <div class="facts4">
        <div><b data-count="5">0</b><span>MCP servers</span></div>
        <div><b data-count="23">0</b><span>tools</span></div>
        <div><b data-count="290">0</b><span>Indian companies in the directory</span></div>
        <div><b data-count="31">0</b><span>automated tests passing</span></div>
      </div>
      <div class="stack"><span>AWS Lambda · ap-south-1</span><span>ElevenLabs voice</span><span>Gmail + Calendar</span><span>Postgres</span><span>TypeScript</span></div>
    </section>

    <section class="band cta-end">
      <h2 class="reveal">See it on a real-looking inbox</h2>
      <p class="lead reveal">Two minutes: find 214 companies, pick the 12 riskiest, approve the requests and watch the replies come in.</p>
      <button class="primary big" data-go="map">${ICON.play} Start the demo</button>
      <footer class="foot">
        <div><b>Data Exit</b> · wHACKiest 2026 · Track 1: Make MCP Matter</div>
        <div class="muted">Team Data Exit · Dr. Ambedkar Institute of Technology · Abhishek M Shivanagoudar, Sanvi Y Gowda, Afreen Hossain, Rithikha R</div>
        <div class="muted small">Not a legal service. Templates are drafts pending legal review.</div>
      </footer>
    </section>
  </div>`;

  host.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go as "map" | "rural")));
  return animate(host);
}

function countTo(el: HTMLElement, to: number, opts: { prefix?: string; suffix?: string; final?: string; duration?: number } = {}) {
  const o = { v: 0 };
  return gsap.to(o, {
    v: to, duration: opts.duration ?? 1.6, ease: "power2.out",
    onUpdate: () => { el.textContent = `${opts.prefix ?? ""}${Math.round(o.v).toLocaleString("en-IN")}${opts.suffix ?? ""}`; },
    onComplete: () => { if (opts.final) el.textContent = opts.final; },
  });
}

function animate(host: HTMLElement): () => void {
  const mm = gsap.matchMedia();
  mm.add({ motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" }, (ctx) => {
    const reduce = ctx.conditions?.reduce;
    const q = gsap.utils.selector(host);

    if (reduce) {
      q(".count").forEach((el: HTMLElement) => (el.textContent = el.dataset.to!));
      q("[data-count]").forEach((el: HTMLElement) => (el.textContent = `${el.dataset.prefix ?? ""}${Number(el.dataset.count).toLocaleString("en-IN")}${el.dataset.suffix ?? ""}`));
      return;
    }

    // Hero: headline words rise in, then copy, then the scan card plays.
    const split = SplitText.create(q(".hero-title")[0], { type: "words", mask: "words" });
    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
    intro.from(q(".eyebrow")[0], { y: 12, autoAlpha: 0, duration: 0.5 })
      .from(split.words, { yPercent: 110, duration: 0.8, stagger: 0.05 }, "-=0.2")
      .from(q(".hero-sub, .hero-cta, .hero-note"), { y: 18, autoAlpha: 0, duration: 0.6, stagger: 0.1 }, "-=0.4")
      .from(q(".scan-card")[0], { y: 40, autoAlpha: 0, rotate: 2, duration: 0.9 }, "-=0.7")
      .from(q(".scroll-hint")[0], { autoAlpha: 0, duration: 0.6 }, "-=0.2");
    gsap.to(q(".b1")[0], { x: 120, y: 60, duration: 9, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(q(".b2")[0], { x: -100, y: -80, duration: 11, repeat: -1, yoyo: true, ease: "sine.inOut" });

    // Scan card loop: emails appear, get matched to a company, counters climb.
    const rows = q(".scan-list li");
    const counts = q(".count") as HTMLElement[];
    const scan = gsap.timeline({ repeat: -1, repeatDelay: 2.5, delay: 1.2 });
    scan.set(rows, { autoAlpha: 0, x: -24 }).set(q(".scan-tag"), { autoAlpha: 0, scale: 0.6 });
    scan.call(() => counts.forEach((c) => (c.textContent = "0")));
    rows.forEach((row: HTMLElement, i: number) => {
      scan.to(row, { autoAlpha: 1, x: 0, duration: 0.35, ease: "power2.out" }, i * 0.55)
        .to(row.querySelector(".scan-tag"), { autoAlpha: 1, scale: 1, duration: 0.35, ease: "back.out(2.5)" }, i * 0.55 + 0.3);
    });
    scan.add(() => { counts.forEach((c) => countTo(c, Number(c.dataset.to), { duration: 1.4 })); }, rows.length * 0.55);
    scan.to(rows, { autoAlpha: 0.35, duration: 0.4, stagger: 0.04 }, "+=1.6");

    // Generic reveals.
    q(".reveal").forEach((el: HTMLElement) => gsap.from(el, { y: 28, autoAlpha: 0, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } }));

    // Problem stats count up.
    q(".problem [data-count]").forEach((el: HTMLElement) => {
      ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => countTo(el, Number(el.dataset.count), { prefix: el.dataset.prefix, suffix: el.dataset.suffix, final: el.dataset.final, duration: 1.8 }) });
    });

    // How it works: the line draws as you scroll, steps pop in along it.
    gsap.fromTo(q(".steps-line i")[0], { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: q(".steps")[0], start: "top 75%", end: "bottom 60%", scrub: 0.6 } });
    gsap.from(q(".step"), { y: 50, autoAlpha: 0, duration: 0.7, stagger: 0.18, ease: "back.out(1.4)", scrollTrigger: { trigger: q(".steps")[0], start: "top 75%" } });

    // Law demo: a little conversation that plays when it scrolls into view.
    const law = gsap.timeline({ scrollTrigger: { trigger: q(".law-demo")[0], start: "top 70%" } });
    law.from(q(".chat.you")[0], { x: 40, autoAlpha: 0, duration: 0.5 })
      .from(q(".chat.agent")[0], { x: -40, autoAlpha: 0, duration: 0.5 }, "+=0.2")
      .from(q(".law-check")[0], { autoAlpha: 0, duration: 0.3 })
      .to(q(".law-check")[0], { autoAlpha: 0, height: 0, marginBottom: 0, duration: 0.3 }, "+=0.9")
      .from(q(".law-rule")[0], { autoAlpha: 0, y: 10, duration: 0.4 })
      .from(q(".law-swap")[0], { autoAlpha: 0, scale: 0.9, duration: 0.5, ease: "back.out(2)" }, "+=0.3")
      .fromTo(q(".law-swap s")[0], { "--strike": "0%" }, { "--strike": "100%", duration: 0.4 })
      .from(q(".law-out")[0], { autoAlpha: 0, y: 10, duration: 0.4 }, "+=0.2");

    // Control tiles stagger in.
    gsap.from(q(".tile"), { y: 40, autoAlpha: 0, duration: 0.6, stagger: 0.1, ease: "power3.out", scrollTrigger: { trigger: q(".tiles")[0], start: "top 80%" } });

    // Rural phone: message arrives, bot types, verdict pops.
    const ph = gsap.timeline({ scrollTrigger: { trigger: q(".mini-phone")[0], start: "top 70%" } });
    ph.from(q(".mini-phone")[0], { y: 60, rotate: -3, autoAlpha: 0, duration: 0.8, ease: "power3.out" })
      .from(q(".mp-msg.user")[0], { scale: 0.8, autoAlpha: 0, transformOrigin: "right top", duration: 0.4, ease: "back.out(2)" })
      .from(q(".mp-typing")[0], { autoAlpha: 0, duration: 0.2 })
      .to(q(".mp-typing i"), { y: -4, duration: 0.3, stagger: 0.1, repeat: 3, yoyo: true })
      .to(q(".mp-typing")[0], { autoAlpha: 0, height: 0, duration: 0.2 })
      .from(q(".mp-msg.bot")[0], { scale: 0.8, autoAlpha: 0, transformOrigin: "left top", duration: 0.45, ease: "back.out(2)" })
      .from(q(".mp-verdict")[0], { scale: 0, duration: 0.4, ease: "back.out(3)" }, "-=0.1")
      .from(q(".mp-play")[0], { autoAlpha: 0, x: -10, duration: 0.3 });

    // Pipeline: tools light up in sequence, forever.
    const tools = q(".pipeline .tool");
    gsap.from(q(".pipeline > *"), { autoAlpha: 0, y: 14, duration: 0.4, stagger: 0.06, scrollTrigger: { trigger: q(".pipeline")[0], start: "top 85%" } });
    const pulse = gsap.timeline({ repeat: -1, repeatDelay: 0.6, scrollTrigger: { trigger: q(".pipeline")[0], start: "top 85%", toggleActions: "play pause resume pause" } });
    tools.forEach((t: HTMLElement, i: number) => {
      pulse.call(() => t.classList.add("lit"), [], i * 0.3).call(() => t.classList.remove("lit"), [], i * 0.3 + 0.55);
    });
    q(".tech [data-count]").forEach((el: HTMLElement) => {
      ScrollTrigger.create({ trigger: el, start: "top 90%", once: true, onEnter: () => countTo(el, Number(el.dataset.count), { duration: 1.4 }) });
    });

    return () => split.revert();
  });
  return () => mm.revert();
}
