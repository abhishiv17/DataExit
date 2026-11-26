import { AFTER_FRAUD, FLAGS, OFFICIAL_DOMAINS, RISKY_TLDS, URL_SHORTENERS } from "./rules.js";

export type Verdict = "scam" | "likely_scam" | "suspicious" | "no_red_flags";
export type ScamLanguage = "en" | "hi" | "kn";

export const SAFETY_LINE: Record<ScamLanguage, string> = {
  en: "Data Exit will never ask for your OTP, PIN or Aadhaar number.",
  hi: "Data Exit कभी भी आपका OTP, PIN या आधार नंबर नहीं माँगेगा।",
  kn: "Data Exit ನಿಮ್ಮ OTP, PIN ಅಥವಾ ಆಧಾರ್ ಸಂಖ್ಯೆಯನ್ನು ಎಂದಿಗೂ ಕೇಳುವುದಿಲ್ಲ.",
};

const VERDICT_TEXT: Record<Verdict, Record<ScamLanguage, string>> = {
  scam: { en: "This is a scam.", hi: "यह धोखाधड़ी (स्कैम) है।", kn: "ಇದು ವಂಚನೆ." },
  likely_scam: { en: "This looks like a scam.", hi: "यह स्कैम लग रहा है।", kn: "ಇದು ವಂಚನೆಯಂತೆ ಕಾಣುತ್ತಿದೆ." },
  suspicious: { en: "Be careful: this message has warning signs.", hi: "सावधान रहें: इस मैसेज में ख़तरे के संकेत हैं।", kn: "ಎಚ್ಚರಿಕೆ: ಈ ಸಂದೇಶದಲ್ಲಿ ವಂಚನೆಯ ಸೂಚನೆಗಳಿವೆ." },
  no_red_flags: {
    en: "I found no common scam signs, but stay careful. If in doubt, call the company on the number from its official website.",
    hi: "मुझे आम स्कैम संकेत नहीं मिले, फिर भी सावधान रहें। शक हो तो कंपनी की आधिकारिक वेबसाइट वाले नंबर पर ख़ुद फ़ोन करें।",
    kn: "ಸಾಮಾನ್ಯ ವಂಚನೆಯ ಸೂಚನೆಗಳು ಕಾಣಲಿಲ್ಲ. ಆದರೂ ಜಾಗರೂಕರಾಗಿರಿ; ಅನುಮಾನವಿದ್ದರೆ ಸಂಸ್ಥೆಯ ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್‌ನ ಸಂಖ್ಯೆಗೆ ಕರೆ ಮಾಡಿ.",
  },
};

const STEPS = {
  dont: {
    en: "Do not click any link, call back, share an OTP or PIN, or install any app it mentions.",
    hi: "किसी लिंक पर क्लिक न करें, वापस फ़ोन न करें, OTP या PIN न बताएँ, और कोई ऐप इंस्टॉल न करें।",
    kn: "ಲಿಂಕ್ ತೆರೆಯಬೇಡಿ, ಮರಳಿ ಕರೆ ಮಾಡಬೇಡಿ, OTP ಅಥವಾ PIN ಹಂಚಿಕೊಳ್ಳಬೇಡಿ ಮತ್ತು ಹೇಳಿದ ಆ್ಯಪ್ ಸ್ಥಾಪಿಸಬೇಡಿ.",
  },
  chakshu: {
    en: "Report the message on Sanchar Saathi (sancharsaathi.gov.in) using Chakshu, then block the number.",
    hi: "संचार साथी (sancharsaathi.gov.in) पर 'चक्षु' से इस मैसेज की शिकायत करें, फिर नंबर ब्लॉक करें।",
    kn: "Sanchar Saathi (sancharsaathi.gov.in) ಯ Chakshu ಮೂಲಕ ಸಂದೇಶವನ್ನು ವರದಿ ಮಾಡಿ; ನಂತರ ಸಂಖ್ಯೆಯನ್ನು ನಿರ್ಬಂಧಿಸಿ.",
  },
  bank: {
    en: "If it mentions your bank, call the number printed on your passbook or card, not any number in the message.",
    hi: "अगर बैंक का नाम है, तो पासबुक या कार्ड पर छपे नंबर पर फ़ोन करें, मैसेज वाले नंबर पर नहीं।",
    kn: "ಬ್ಯಾಂಕ್ ಹೆಸರು ಇದ್ದರೆ ಸಂದೇಶದಲ್ಲಿನ ಸಂಖ್ಯೆಗೆ ಅಲ್ಲ, ನಿಮ್ಮ ಪಾಸ್‌ಬುಕ್ ಅಥವಾ ಕಾರ್ಡ್‌ನಲ್ಲಿರುವ ಸಂಖ್ಯೆಗೆ ಕರೆ ಮಾಡಿ.",
  },
  call1930: {
    en: "Call 1930 (National Cyber Crime Helpline) right now. The sooner you call, the better the chance to stop the money.",
    hi: "अभी 1930 (राष्ट्रीय साइबर अपराध हेल्पलाइन) पर फ़ोन करें। जितनी जल्दी फ़ोन करेंगे, पैसे रुकने की संभावना उतनी ज़्यादा।",
    kn: "ಈಗಲೇ 1930 ರಾಷ್ಟ್ರೀಯ ಸೈಬರ್ ಅಪರಾಧ ಸಹಾಯವಾಣಿಗೆ ಕರೆ ಮಾಡಿ. ಬೇಗ ಕರೆ ಮಾಡಿದರೆ ಹಣವನ್ನು ತಡೆಯುವ ಅವಕಾಶ ಹೆಚ್ಚು.",
  },
  blockBank: {
    en: "Call your bank's fraud line (number on your passbook or card) to block the account, card or UPI.",
    hi: "अपने बैंक की फ्रॉड हेल्पलाइन (पासबुक या कार्ड पर नंबर) पर फ़ोन करके खाता, कार्ड या UPI बंद करवाएँ।",
    kn: "ಖಾತೆ, ಕಾರ್ಡ್ ಅಥವಾ UPI ತಡೆಯಲು ನಿಮ್ಮ ಪಾಸ್‌ಬುಕ್ ಅಥವಾ ಕಾರ್ಡ್‌ನಲ್ಲಿರುವ ಬ್ಯಾಂಕ್‌ನ ವಂಚನೆ ಸಹಾಯವಾಣಿಗೆ ಕರೆ ಮಾಡಿ.",
  },
  cybercrime: {
    en: "File a complaint at cybercrime.gov.in. Keep screenshots, the transaction ID and the scammer's number.",
    hi: "cybercrime.gov.in पर शिकायत दर्ज करें। स्क्रीनशॉट, ट्रांज़ैक्शन ID और ठग का नंबर संभाल कर रखें।",
    kn: "cybercrime.gov.in ನಲ್ಲಿ ದೂರು ಸಲ್ಲಿಸಿ. ಸ್ಕ್ರೀನ್‌ಶಾಟ್, ವಹಿವಾಟಿನ ID ಮತ್ತು ವಂಚಕರ ಸಂಖ್ಯೆಯನ್ನು ಉಳಿಸಿಕೊಳ್ಳಿ.",
  },
  helper: {
    en: "If you need help, visit your nearest Common Service Centre (CSC) or bank mitra.",
    hi: "मदद चाहिए तो नज़दीकी कॉमन सर्विस सेंटर (CSC) या बैंक मित्र के पास जाएँ।",
    kn: "ಸಹಾಯ ಬೇಕಿದ್ದರೆ ಹತ್ತಿರದ Common Service Centre (CSC) ಅಥವಾ ಬ್ಯಾಂಕ್ ಮಿತ್ರರನ್ನು ಸಂಪರ್ಕಿಸಿ.",
  },
};

function urlFlags(text: string, lang: ScamLanguage): Array<{ id: string; weight: number; reason: string; detail: string }> {
  const out: Array<{ id: string; weight: number; reason: string; detail: string }> = [];
  const urls = text.match(/\b((https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/[^\s]*)?)/gi) ?? [];
  for (const raw of urls) {
    const host = raw.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
    if (!host.includes(".") || /^\d+(\.\d+)*$/.test(host)) continue;
    if (/^(gov|nic)\.in$/.test(host)) continue;
    if (URL_SHORTENERS.includes(host)) {
      out.push({ id: "short_link", weight: 15, detail: host, reason: lang === "kn" ? `ಚಿಕ್ಕ ಲಿಂಕ್ (${host}) ನಿಜವಾದ ವಿಳಾಸವನ್ನು ಮರೆಮಾಡುತ್ತದೆ.` : lang === "hi" ? `छोटा लिंक (${host}) असली पता छिपाता है।` : `A short link (${host}) hides where it really goes.` });
      continue;
    }
    if (RISKY_TLDS.some((t) => host.endsWith(t))) {
      out.push({ id: "risky_domain", weight: 15, detail: host, reason: lang === "kn" ? `ಲಿಂಕ್ (${host}) ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್‌ನಂತೆ ಕಾಣುತ್ತಿಲ್ಲ.` : lang === "hi" ? `लिंक (${host}) किसी आधिकारिक साइट का नहीं है।` : `The link (${host}) is not an official website.` });
    }
    for (const [brand, official] of Object.entries(OFFICIAL_DOMAINS)) {
      const compact = host.replace(/[-.]/g, "");
      if (compact.includes(brand) && !official.some((d) => host === d || host.endsWith(`.${d}`))) {
        out.push({
          id: "lookalike_domain",
          weight: 30,
          detail: host,
          reason: lang === "kn" ? `ಲಿಂಕ್ (${host}) ${brand.toUpperCase()} ಹೆಸರನ್ನು ಅನುಕರಿಸುತ್ತದೆ; ಇದು ಅದರ ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್ ಅಲ್ಲ.` : lang === "hi" ? `लिंक (${host}) ${brand.toUpperCase()} जैसा दिखता है पर असली नहीं है।` : `The link (${host}) imitates ${brand.toUpperCase()} but is not its real website.`,
        });
        break;
      }
    }
  }
  const seen = new Set<string>();
  return out.filter((f) => !seen.has(f.id + f.detail) && seen.add(f.id + f.detail));
}

/** Rule-based first opinion. The agent adds its own judgement on top; the verdict never says "safe". */
const KN_REASONS: Record<string, string> = {
  asks_otp: "ಈ ಸಂದೇಶವು OTP ಕೇಳುತ್ತದೆ. ಬ್ಯಾಂಕ್ ಅಥವಾ ಸರ್ಕಾರಿ ಕಚೇರಿ ನಿಮ್ಮ OTP ಕೇಳುವುದಿಲ್ಲ.",
  asks_pin: "ಇದು UPI PIN ಕೇಳುತ್ತದೆ. ಹಣ ಸ್ವೀಕರಿಸಲು PIN ಹಾಕಬೇಕಾಗಿಲ್ಲ.",
  asks_aadhaar_or_card: "ಸಂದೇಶದ ಮೂಲಕ ಆಧಾರ್, ಕಾರ್ಡ್ ಅಥವಾ ಬ್ಯಾಂಕ್ ವಿವರಗಳನ್ನು ಕೇಳುತ್ತಿದೆ.",
  kyc_threat: "KYC ನವೀಕರಿಸದಿದ್ದರೆ ಖಾತೆ ಸ್ಥಗಿತಗೊಳಿಸುವುದಾಗಿ ಬೆದರಿಸುತ್ತದೆ.",
  block_threat: "ಖಾತೆ, SIM ಅಥವಾ ವಿದ್ಯುತ್ ಸಂಪರ್ಕ ಕಡಿತಗೊಳಿಸುವುದಾಗಿ ಹೆದರಿಸಿ ತುರ್ತು ನಿರ್ಧಾರಕ್ಕೆ ಒತ್ತಾಯಿಸುತ್ತದೆ.",
  authority_threat: "ಪೊಲೀಸ್ ಅಥವಾ ಸರ್ಕಾರಿ ಅಧಿಕಾರಿಯ ಹೆಸರಿನಲ್ಲಿ ಬೆದರಿಕೆ ಹಾಕುತ್ತಿದೆ.",
  prize: "ನೀವು ಭಾಗವಹಿಸದ ಬಹುಮಾನ ಅಥವಾ ಲಾಟರಿ ಗೆದ್ದಿದ್ದೀರಿ ಎಂದು ಹೇಳುತ್ತದೆ.",
  remote_access: "ಆ್ಯಪ್ ಸ್ಥಾಪಿಸಲು ಅಥವಾ ಪರದೆ ಹಂಚಿಕೊಳ್ಳಲು ಕೇಳುತ್ತದೆ; ಇದು ನಿಮ್ಮ ಫೋನ್‌ಗೆ ಪ್ರವೇಶ ನೀಡಬಹುದು.",
  job_task: "ಸುಲಭ ಕೆಲಸಕ್ಕೆ ಹಣದ ಭರವಸೆ ನೀಡಿ ಮೊದಲು ಠೇವಣಿ ಕೇಳುವ ಸೂಚನೆ ಇದೆ.",
  loan_fee: "ತಕ್ಷಣ ಸಾಲ ನೀಡುವುದಾಗಿ ಹೇಳಿ ಮುಂಗಡ ಶುಲ್ಕ ಕೇಳುತ್ತಿದೆ.",
  investment: "ಖಚಿತವಾದ ಅಥವಾ ಅತಿಯಾದ ಲಾಭದ ಭರವಸೆ ನೀಡುತ್ತದೆ.",
  scheme_impersonation: "ಸರ್ಕಾರಿ ಯೋಜನೆಯ ಹೆಸರಿನಲ್ಲಿ ಲಿಂಕ್ ಅಥವಾ OTP ಕೇಳುತ್ತಿದೆ.",
  wrong_transfer: "ತಪ್ಪಾಗಿ ಹಣ ಕಳುಹಿಸಿದ್ದೇವೆ ಎನ್ನುತ್ತಿದೆ; ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಆ್ಯಪ್‌ನಲ್ಲಿ ಸ್ವತಃ ಪರಿಶೀಲಿಸಿ.",
  urgency: "ತಕ್ಷಣ ಕ್ರಮ ಕೈಗೊಳ್ಳಲು ಒತ್ತಡ ಹೇರುತ್ತದೆ.",
};

export function checkScam(input: { text: string; language?: ScamLanguage }) {
  const lang = input.language ?? (/[\u0c80-\u0cff]/.test(input.text) ? "kn" : /[ऀ-ॿ]/.test(input.text) ? "hi" : "en");
  const text = input.text.slice(0, 10_000);
  const hits = FLAGS.filter((f) => f.pattern.test(text)).map((f) => ({ id: f.id, weight: f.weight, reason: lang === "kn" ? KN_REASONS[f.id] : f.reason[lang], detail: null as string | null }));
  const links = urlFlags(text, lang);
  const flags = [...hits, ...links].sort((a, b) => b.weight - a.weight);
  const score = Math.min(100, flags.reduce((n, f) => n + f.weight, 0));
  const verdict: Verdict = score >= 60 ? "scam" : score >= 30 ? "likely_scam" : score >= 10 ? "suspicious" : "no_red_flags";
  const lostMoney = AFTER_FRAUD.test(text);

  const steps = lostMoney
    ? [STEPS.call1930, STEPS.blockBank, STEPS.cybercrime, STEPS.chakshu]
    : verdict === "no_red_flags"
      ? [STEPS.bank]
      : [STEPS.dont, STEPS.chakshu, ...(flags.some((f) => /kyc|block|pin|otp|lookalike/.test(f.id)) ? [STEPS.bank] : []), STEPS.helper];
  const next_steps = steps.map((s) => s[lang]);

  const reasons = flags.slice(0, 3).map((f) => f.reason);
  const reply_text = [
    lostMoney ? (lang === "kn" ? "ಈಗಲೇ ಕ್ರಮ ಕೈಗೊಳ್ಳಿ." : lang === "hi" ? "तुरंत कदम उठाएँ।" : "Act now.") : VERDICT_TEXT[verdict][lang],
    ...reasons,
    ...next_steps,
    SAFETY_LINE[lang],
  ].join(" ");

  return {
    verdict,
    score,
    language: lang,
    lost_money: lostMoney,
    flags,
    next_steps,
    helplines: { cyber_crime: "1930", portal: "https://cybercrime.gov.in", chakshu: "https://sancharsaathi.gov.in" },
    safety_line: SAFETY_LINE[lang],
    /** Short reply for WhatsApp text or text-to-speech. */
    reply_text,
  };
}
