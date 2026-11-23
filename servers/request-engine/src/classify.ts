import type { ReplyClass } from "@dataexit/shared";

// Rules first. Anything that falls through as "other" goes to the LLM (the agent) to classify.
const RULES: Array<[ReplyClass, RegExp]> = [
  ["id_requested", /(verify your identity|proof of identity|id proof|upload (a )?(copy of )?(your )?(aadhaar|pan|id)|kyc document)/i],
  ["rejected_retention", /(rbi|regulatory|statutory|legal(ly)?) (requirement|obligation|mandate)|required (by law )?to (retain|keep)|pmla|kyc (norms|directions)/i],
  ["confirmed", /(has|have) been (deleted|erased|removed|closed|unsubscribed|processed)|request (is|has been) (completed|fulfilled)|successfully (deleted|unsubscribed)/i],
  ["acknowledged", /(we have|we've) received your (request|email)|ticket (number|id)|will (get back|respond) (to you )?within/i],
];

export function classifyReply(text: string): { class: ReplyClass; matchedRule: string | null } {
  for (const [cls, re] of RULES) {
    if (re.test(text)) return { class: cls, matchedRule: re.source };
  }
  return { class: "other", matchedRule: null };
}
