// Rural mode mock-up: "Is this a scam?" on WhatsApp, voice first, Hindi by default.
// Voice in uses the browser's SpeechRecognition (Chrome); voice out uses speechSynthesis.
// In production this runs on the WhatsApp bot (apps/whatsapp-bot) calling check_scam.

import { AFTER_FRAUD, checkScam, LOAN_APP_CLEANUP, NEVER_ASK, SAMPLES, SIM_CHECK, type Bi, type ScamCheck } from "./scam";

type Lang = "hi" | "en";
interface Msg { from: "user" | "bot"; text: string; check?: ScamCheck; steps?: { title: Bi; items: Bi[] } }

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const UI: Record<string, Bi> = {
  title: { hi: "क्या यह धोखा है?", en: "Is this a scam?" },
  sub: { hi: "संदिग्ध मैसेज फ़ॉरवर्ड करें या बोलकर बताएँ।", en: "Forward a suspicious message or say it out loud." },
  placeholder: { hi: "मैसेज यहाँ चिपकाएँ…", en: "Paste the message here…" },
  send: { hi: "जाँचें", en: "Check" },
  speak: { hi: "🎤 बोलें", en: "🎤 Speak" },
  listen: { hi: "🔊 सुनें", en: "🔊 Listen" },
  samples: { hi: "उदाहरण मैसेज:", en: "Sample messages:" },
  lost: { hi: "पैसे कट गए?", en: "Lost money?" },
  sim: { hi: "मेरे नाम पर SIM जाँचें", en: "Check SIMs in my name" },
  loan: { hi: "लोन ऐप साफ़ करें", en: "Clean up a loan app" },
  scam: { hi: "धोखा", en: "Scam" },
  suspicious: { hi: "संदिग्ध", en: "Suspicious" },
  no_signals: { hi: "कोई संकेत नहीं", en: "No signs found" },
  why: { hi: "क्यों:", en: "Why:" },
  todo: { hi: "क्या करें:", en: "What to do:" },
  noVoice: { hi: "इस ब्राउज़र में बोलकर लिखना उपलब्ध नहीं है।", en: "Voice input isn't available in this browser." },
  hello: { hi: "नमस्ते! कोई भी शक वाला मैसेज, कॉल या लिंक मुझे भेजें। मैं बताऊँगा कि यह धोखा है या नहीं।", en: "Hello! Send me any message, call or link you're unsure about. I'll tell you if it's a scam." },
};

export function mountRural(host: HTMLElement) {
  let lang: Lang = "hi";
  const msgs: Msg[] = [{ from: "bot", text: "" }];
  const t = (k: string) => UI[k][lang];

  function speak(text: string) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "hi" ? "hi-IN" : "en-IN";
    const v = speechSynthesis.getVoices().find((x) => x.lang.replace("_", "-").startsWith(u.lang.slice(0, 2)));
    if (v) u.voice = v;
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  function spoken(m: Msg): string {
    if (m.check) return [m.check.summary[lang], ...m.check.nextSteps.map((s) => s[lang]), m.check.neverAsk[lang]].join(" ");
    if (m.steps) return [m.steps.title[lang], ...m.steps.items.map((s) => s[lang]), NEVER_ASK[lang]].join(" ");
    return `${UI.hello[lang]} ${NEVER_ASK[lang]}`;
  }

  function botHtml(m: Msg, i: number): string {
    const listen = `<button class="listen" data-listen="${i}">${t("listen")}</button>`;
    if (m.check) {
      const c = m.check;
      return `<div class="verdict v-${c.verdict}">${t(c.verdict)}</div>
        <p><b>${esc(c.summary[lang])}</b></p>
        ${c.signals.length ? `<p class="small">${t("why")}</p><ul>${c.signals.map((s) => `<li>${esc(s.label[lang])}</li>`).join("")}</ul>` : ""}
        <p class="small">${t("todo")}</p><ol>${c.nextSteps.map((s) => `<li>${esc(s[lang])}</li>`).join("")}</ol>
        <p class="never">${esc(c.neverAsk[lang])}</p>${listen}`;
    }
    if (m.steps) {
      return `<p><b>${esc(m.steps.title[lang])}</b></p><ol>${m.steps.items.map((s) => `<li>${esc(s[lang])}</li>`).join("")}</ol>
        <p class="never">${esc(NEVER_ASK[lang])}</p>${listen}`;
    }
    return `<p>${esc(UI.hello[lang])}</p><p class="never">${esc(NEVER_ASK[lang])}</p>${listen}`;
  }

  function render() {
    host.innerHTML = `
      <div class="rural-layout" lang="${lang}">
        <div class="phone">
          <div class="wa-head">
            <div class="wa-avatar">↩</div>
            <div><b>Wapas</b><div class="small">${t("title")}</div></div>
            <div class="lang wa-lang">
              <button data-lang="hi" aria-pressed="${lang === "hi"}">हिन्दी</button>
              <button data-lang="en" aria-pressed="${lang === "en"}">English</button>
            </div>
          </div>
          <div class="never-banner">🔒 ${esc(NEVER_ASK[lang])}</div>
          <div class="wa-body" id="wa-body">
            ${msgs.map((m, i) => `<div class="wa-msg ${m.from}">${m.from === "user" ? `<div class="fwd">↪ Forwarded</div>${esc(m.text)}` : botHtml(m, i)}</div>`).join("")}
          </div>
          <div class="quick">
            <button data-quick="lost" class="q-danger">${t("lost")}</button>
            <button data-quick="sim">${t("sim")}</button>
            <button data-quick="loan">${t("loan")}</button>
          </div>
          <form class="wa-input" id="wa-form">
            <textarea id="wa-text" rows="2" placeholder="${t("placeholder")}"></textarea>
            <div class="wa-btns">
              <button type="button" id="wa-mic">${t("speak")}</button>
              <button type="submit" class="primary">${t("send")}</button>
            </div>
          </form>
        </div>
        <aside class="rural-side">
          <h2>${t("title")}</h2>
          <p class="muted">${t("sub")}</p>
          <p class="small"><b>${t("samples")}</b></p>
          <div class="samples">${SAMPLES.map((s, i) => `<button class="chip" data-sample="${i}">${esc(s.label[lang])}</button>`).join("")}</div>
          <div class="note small">${lang === "hi"
            ? "डेमो मॉक-अप: असली सेवा WhatsApp पर चलेगी — वॉइस नोट भेजें, हिंदी में आवाज़ में जवाब पाएँ। यहाँ जाँच नियम-आधारित है; असली एजेंट मैसेज पढ़कर तय करेगा।"
            : "Demo mock-up: the real service runs on WhatsApp, with a voice note in and a Hindi voice reply out. Checks here are rule-based; the real agent reads the message itself."}</div>
        </aside>
      </div>`;

    const body = host.querySelector<HTMLElement>("#wa-body")!;
    body.scrollTop = body.scrollHeight;
    host.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((b) => b.addEventListener("click", () => { lang = b.dataset.lang as Lang; render(); }));
    host.querySelectorAll<HTMLButtonElement>("[data-listen]").forEach((b) => b.addEventListener("click", () => speak(spoken(msgs[Number(b.dataset.listen)]))));
    host.querySelectorAll<HTMLButtonElement>("[data-sample]").forEach((b) => b.addEventListener("click", () => submit(SAMPLES[Number(b.dataset.sample)].text)));
    host.querySelectorAll<HTMLButtonElement>("[data-quick]").forEach((b) => b.addEventListener("click", () => {
      const q = b.dataset.quick!;
      const steps = q === "lost" ? { title: { hi: "घबराएँ नहीं। अभी ये करें:", en: "Don't panic. Do this now:" }, items: AFTER_FRAUD }
        : q === "sim" ? { title: { hi: "अपने नाम पर चल रहे SIM ऐसे जाँचें:", en: "Check the SIMs issued in your name:" }, items: SIM_CHECK }
        : { title: { hi: "लोन ऐप से अपना डेटा ऐसे बचाएँ:", en: "Protect your data from a loan app:" }, items: LOAN_APP_CLEANUP };
      msgs.push({ from: "user", text: UI[q][lang] }, { from: "bot", text: "", steps });
      render(); speak(spoken(msgs.at(-1)!));
    }));
    host.querySelector<HTMLFormElement>("#wa-form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = host.querySelector<HTMLTextAreaElement>("#wa-text")!.value.trim();
      if (v) submit(v);
    });
    host.querySelector<HTMLButtonElement>("#wa-mic")!.addEventListener("click", listenVoice);
  }

  function submit(text: string) {
    msgs.push({ from: "user", text }, { from: "bot", text: "", check: checkScam(text) });
    render();
    speak(spoken(msgs.at(-1)!));
  }

  function listenVoice() {
    const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    const box = host.querySelector<HTMLTextAreaElement>("#wa-text")!;
    if (!SR) { box.placeholder = t("noVoice"); return; }
    const rec = new SR();
    rec.lang = lang === "hi" ? "hi-IN" : "en-IN";
    rec.interimResults = true;
    rec.onresult = (e) => { box.value = [...e.results].map((r) => r[0].transcript).join(" "); };
    rec.onend = () => { if (box.value.trim()) submit(box.value.trim()); };
    rec.start();
  }

  render();
}

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & Iterable<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start(): void;
}
