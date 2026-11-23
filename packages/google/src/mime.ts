// RFC 5322 helpers. Subjects and bodies may be Hindi, so everything non-ASCII is UTF-8 encoded.

const CRLF = "\r\n";

export function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function decodeHeader(value: string): string {
  return value.replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=/gi, (_, enc: string, text: string) =>
    enc.toUpperCase() === "B"
      ? Buffer.from(text, "base64").toString("utf8")
      : decodeURIComponent(text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, "%$1")),
  );
}

export function buildMime(m: {
  from?: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
}): string {
  const headers = [
    m.from ? `From: ${m.from}` : null,
    `To: ${m.to}`,
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    m.inReplyTo ? `In-Reply-To: ${m.inReplyTo}` : null,
    m.inReplyTo ? `References: ${m.inReplyTo}` : null,
  ].filter(Boolean);
  const body = Buffer.from(m.body.replace(/\r?\n/g, CRLF), "utf8").toString("base64").replace(/.{76}/g, `$&${CRLF}`);
  return headers.join(CRLF) + CRLF + CRLF + body;
}

export function base64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function parseAddress(header: string): { name: string; email: string; domain: string } {
  const decoded = decodeHeader(header ?? "").trim();
  const angle = decoded.match(/^(.*)<([^>]+)>\s*$/);
  const email = (angle ? angle[2] : decoded).trim().toLowerCase();
  const name = angle ? angle[1].trim().replace(/^"|"$/g, "") : "";
  const domain = email.includes("@") ? email.split("@").pop()! : "";
  return { name, email, domain };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}
