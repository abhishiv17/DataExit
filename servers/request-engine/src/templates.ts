import { readFileSync } from "node:fs";
import type { Language, LegalBasis } from "@dataexit/shared";

const TEMPLATE_DIR = new URL("../templates/", import.meta.url);

export type TemplateName =
  | "stop_marketing"
  | "withdraw_consent"
  | "access"
  | "correct"
  | "erase"
  | "restrict_use"
  | "escalation_grievance_officer"
  | "escalation_dpb";

export const LEGAL_BASIS_NOTE: Record<Language, Record<LegalBasis, string>> = {
  en: {
    statutory:
      "This request is made in exercise of my rights as a Data Principal under the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025.",
    policy_based:
      "I understand the data-principal rights provisions of the DPDP Rules, 2025 come into force on 13 May 2027. Until then, I make this request under your own privacy policy and in the spirit of the Act, and ask you to honour it now.",
  },
  hi: {
    statutory:
      "यह अनुरोध डिजिटल व्यक्तिगत डेटा संरक्षण अधिनियम, 2023 और DPDP नियम, 2025 के तहत डेटा प्रिंसिपल के रूप में मेरे अधिकारों का उपयोग करते हुए किया गया है।",
    policy_based:
      "मुझे पता है कि DPDP नियम, 2025 के डेटा प्रिंसिपल अधिकार 13 मई 2027 से लागू होंगे। तब तक, मैं यह अनुरोध आपकी अपनी गोपनीयता नीति और अधिनियम की भावना के अनुसार कर रहा/रही हूँ, और आपसे इसे अभी मानने का अनुरोध करता/करती हूँ।",
  },
};

export function loadTemplate(lang: Language, name: TemplateName): { subject: string; body: string } {
  const raw = readFileSync(new URL(`${lang}/${name}.md`, TEMPLATE_DIR), "utf8");
  const [first, ...rest] = raw.split(/\r?\n/);
  if (!first.startsWith("Subject:")) throw new Error(`Template ${lang}/${name} must start with "Subject:"`);
  return { subject: first.slice("Subject:".length).trim(), body: rest.join("\n").trim() };
}

export function render(text: string, vars: Record<string, string | number | undefined>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
    const v = vars[key];
    return v === undefined || v === "" ? m : String(v);
  });
}

/** Placeholders left unfilled after rendering (so the agent can ask the user). */
export function missingPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];
}
