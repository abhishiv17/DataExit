/** Personal mailbox providers: senders on these domains are people, not companies. */
export const PERSONAL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "rediffmail.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
]);

/** Second-level suffixes under which the registrable domain has three labels. */
const MULTI_LABEL_SUFFIXES: ReadonlySet<string> = new Set([
  "co.in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "gov.in", "nic.in", "ac.in", "edu.in", "res.in",
  "co.uk", "org.uk", "ac.uk", "com.au", "net.au", "co.jp", "com.sg", "com.br",
]);

/** Approximate eTLD+1: "mailer.swiggy.in" → "swiggy.in", "alerts.sbi.co.in" → "sbi.co.in". */
export function registrableDomain(domain: string): string {
  const labels = domain.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return MULTI_LABEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/**
 * DLT sender headers look like "VM-HDFCBK", "AD-SWIGGY-S" or "JD-JIOINF-T".
 * Strips the two-letter operator/circle prefix and the -S/-P/-T/-G category suffix.
 */
export function normalizeSmsSender(sender: string): string {
  let s = sender.trim().toUpperCase();
  s = s.replace(/^[A-Z]{2}-/, "");
  s = s.replace(/-[SPTG]$/, "");
  return s;
}
