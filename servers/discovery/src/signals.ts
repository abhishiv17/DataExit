// What a message says about the user's relationship with a company, from its subject line only.
// Bodies are never read during discovery.

/**
 * otp / signup / welcome / account prove the user has an account.
 * receipt proves the user used it (orders, payments, bookings, deliveries).
 * Marketing ("offers picked for you", "we miss you") is not a signal: a newsletter
 * proves neither an account nor use, so it must not keep an account looking active.
 */
export type EvidenceKind = "otp" | "signup" | "welcome" | "account" | "receipt";

export const ACCOUNT_KINDS: ReadonlySet<EvidenceKind> = new Set(["otp", "signup", "welcome", "account"]);

const RULES: Array<[EvidenceKind, RegExp]> = [
  [
    "otp",
    /\botp\b|one[- ]time (password|passcode|code|pin)|verification code|security code|login code|sign[- ]?in code|passcode|two[- ]factor|\b2fa\b|\b\d{4,8}\b[^.]{0,40}\b(is your|code|to log ?in|to sign ?in|to verify)\b/i,
  ],
  [
    "signup",
    /(verify|confirm|activate) (your )?(email|e-mail|account|mobile|phone|number)|thanks? (you )?for (signing up|registering|joining|creating)|account (created|is ready|has been created|registered)|complete your (registration|sign ?up|profile)|successfully registered|registration (successful|complete|confirmed)|\bsign(ed)?[- ]?up\b|\bregistration\b/i,
  ],
  ["welcome", /\bwelcome\b/i],
  [
    "account",
    /password (reset|changed|updated)|reset your password|new (login|sign[- ]in|device)|\bkyc\b|e-?statement|account statement|statement for|contract note|policy (document|issued|renewal|renewed)|premium (due|paid|receipt)|account (update|alert|activity)/i,
  ],
  [
    "receipt",
    // "order" only in an order-status sense, so "Order now and get 50% off" stays marketing.
    /\byour( \S+){0,3} order\b|\border (#|no\.?|id|number|summary|confirmed|placed|shipped|delivered|dispatched|is on its way|from)\b|receipt|invoice|payment (of|received|successful|confirmed|done)|paid successfully|booking (confirmed|id|details)|has been (shipped|delivered|dispatched|placed)|was delivered|out for delivery|transaction alert|recharge (successful|done)|ticket (booked|confirmed)|subscription (renewed|activated|confirmed|started)|refund (initiated|processed)|your (bill|trip|ride)\b|added to (your )?wallet|wallet (top[- ]?up|recharge)|\b(credited|debited)\b/i,
  ],
];

export function classifySubject(subject: string): EvidenceKind | null {
  for (const [kind, re] of RULES) if (re.test(subject)) return kind;
  return null;
}

/** Subjects can carry live codes ("482913 is your OTP"); mask long digit runs before storing. */
export function maskSubject(subject: string): string {
  return subject.replace(/\d{4,}/g, (d) => "•".repeat(Math.min(d.length, 6))).slice(0, 160);
}

/**
 * Gmail subject phrases. Two searches so the cap never drops old signups:
 * account-proof messages are few and are searched over the whole mailbox; activity messages are many.
 * Results are filtered again by classifySubject, so a loose phrase here only costs a fetch.
 */
export const ACCOUNT_PHRASES = [
  "welcome",
  "verify",
  "confirm your email",
  "activate",
  "account created",
  "signing up",
  "signed up",
  "sign up",
  "registration",
  "registered",
  "otp",
  "one time password",
  "one-time",
  "verification code",
  "security code",
  "login code",
  "passcode",
  "password reset",
  "reset your password",
  "new login",
  "kyc",
];

export const ACTIVITY_PHRASES = [
  "order",
  "receipt",
  "invoice",
  "payment",
  "booking",
  "shipped",
  "delivered",
  "dispatched",
  "out for delivery",
  "transaction alert",
  "statement",
  "contract note",
  "recharge",
  "ticket",
  "subscription",
  "refund",
  "premium",
  "your bill",
  "your trip",
  "your ride",
  "wallet",
  "credited",
  "debited",
];
