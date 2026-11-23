import type { RequestStatus } from "@dataexit/shared";

export type ReplyKind = "confirmed" | "id_requested" | "refused_retention" | "redirected" | "acknowledged" | "unclear";

export interface ReplyClassification {
  kind: ReplyKind;
  /** Contract status this reply moves the request to; null for acknowledged / unclear. */
  status: RequestStatus | null;
  matched: string | null;
  redirect_to: string[];
}

const ID_REQUEST = [
  /verify (your|the account holder'?s?) identity/i,
  /(proof|copy) of (identity|id|address)/i,
  /\b(id|identity) proof\b/i,
  /(upload|share|send|provide|attach)( us)?( a)?( copy of)?( your)? (aadhaa?r|pan|passport|driving licen[cs]e|voter id|kyc document|government[- ]issued id)/i,
  /(registered mobile|otp sent to your registered)/i,
  /पहचान (का )?प्रमाण|आधार (की )?(कॉपी|प्रति)/,
];

const RETENTION = [
  /\b(rbi|reserve bank|sebi|irdai|dot|pmla|kyc (norms|directions|guidelines)|money[- ]laundering)\b/i,
  /(regulatory|statutory|legal) (requirement|obligation|mandate)s?/i,
  /required (by law |under (applicable )?law )?to (retain|keep|preserve|maintain)/i,
  /(retain|retention) (period|of records)/i,
];

const REFUSAL = [/\b(unable|not able|cannot|can ?not|can't|regret|not possible|decline)\b/i, /अस्वीकार|संभव नहीं/];

const CONFIRMED = [
  /(has|have) been (permanently )?(deleted|erased|removed|closed|deactivated|anonymi[sz]ed|unsubscribed|processed|actioned)/i,
  /\b(we have|we've|we) (now )?(permanently )?(deleted|erased|removed|closed|deactivated|anonymi[sz]ed|unsubscribed)\b/i,
  /(request|account deletion) (is|has been) (completed|fulfilled|processed|actioned)/i,
  /successfully (deleted|erased|unsubscribed|closed|removed|opted out)/i,
  /you (will|shall) no longer receive/i,
  /(withdrawn|withdrawal of) (your )?consent (has been )?(recorded|processed|accepted)/i,
  /(हटा|मिटा) दिया गया है/,
];

const REDIRECT = [
  /(please|kindly) (write|send|reach out|contact|email|raise|direct|forward)( your request| it| this)? (to|at|via|on|us at)/i,
  /(this|the) (mailbox|email( id| address)?|inbox) is (not|un)monitored/i,
  /do not reply to this (email|mail)/i,
  /(grievance officer|data protection officer|dpo) (at|on|is)/i,
];

const ACK = [
  /(we have|we've) received your (request|email|query|mail)/i,
  /(ticket|reference|case|request) (number|no\.?|id)\s*[:#]?\s*\w+/i,
  /(will|shall) (get back|respond|revert) (to you )?(within|in)/i,
  /thank you for (contacting|reaching out|writing)/i,
];

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const any = (patterns: RegExp[], text: string) => patterns.find((p) => p.test(text)) ?? null;

/**
 * Rules first. "unclear" means the agent should read the reply and classify it itself
 * (classify_reply with a classification override), which is the LLM half of "rules plus LLM".
 */
export function classifyReplyText(text: string, ignoreEmails: string[] = []): ReplyClassification {
  const t = text.slice(0, 20_000);
  const ignore = new Set(ignoreEmails.map((e) => e.toLowerCase()));
  const emails = [...new Set((t.match(EMAIL) ?? []).map((e) => e.toLowerCase()))].filter((e) => !ignore.has(e));

  const id = any(ID_REQUEST, t);
  if (id) return { kind: "id_requested", status: "id_requested", matched: id.source, redirect_to: [] };

  const retention = any(RETENTION, t);
  const confirmed = any(CONFIRMED, t);
  const refusal = any(REFUSAL, t);
  if (retention && (refusal || !confirmed)) {
    return { kind: "refused_retention", status: "refused_retention", matched: retention.source, redirect_to: [] };
  }
  if (confirmed) return { kind: "confirmed", status: "confirmed", matched: confirmed.source, redirect_to: [] };

  const redirect = any(REDIRECT, t);
  if (redirect && emails.length) return { kind: "redirected", status: "redirected", matched: redirect.source, redirect_to: emails };

  const ack = any(ACK, t);
  if (ack) return { kind: "acknowledged", status: null, matched: ack.source, redirect_to: [] };

  return { kind: "unclear", status: null, matched: null, redirect_to: emails };
}
