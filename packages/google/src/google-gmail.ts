import { gmail as gmailApi, type gmail_v1 } from "@googleapis/gmail";
import type { OAuth2Client } from "google-auth-library";
import { mapLimit, RateLimiter, withRetry } from "./limiter.js";
import { base64url, buildMime, htmlToText, parseAddress, decodeHeader } from "./mime.js";
import type { GmailBackend, MessageMeta, OutgoingEmail, SearchQuery, SentEmail } from "./types.js";

const META_HEADERS = ["From", "To", "Subject", "Date", "Message-ID", "List-Unsubscribe"];

function gmailDate(d: Date): string {
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** Translates the structured query into Gmail search syntax. */
export function toGmailQuery(q: SearchQuery): string {
  const parts: string[] = [];
  if (q.subject_any?.length) {
    parts.push(`subject:(${q.subject_any.map((s) => (/\s/.test(s) ? `"${s}"` : s)).join(" OR ")})`);
  }
  if (q.after) parts.push(`after:${gmailDate(q.after)}`);
  if (q.before) parts.push(`before:${gmailDate(q.before)}`);
  if (q.exclude_sent) parts.push("-in:sent");
  parts.push("-in:chats");
  return parts.join(" ");
}

function toMeta(m: gmail_v1.Schema$Message): MessageMeta {
  const h = new Map((m.payload?.headers ?? []).map((x) => [String(x.name).toLowerCase(), String(x.value ?? "")]));
  const from = parseAddress(h.get("from") ?? "");
  const date = m.internalDate ? new Date(Number(m.internalDate)) : new Date(h.get("date") ?? 0);
  return {
    id: m.id!,
    thread_id: m.threadId!,
    from_email: from.email,
    from_name: from.name,
    from_domain: from.domain,
    to: h.get("to") ?? "",
    subject: decodeHeader(h.get("subject") ?? ""),
    date: date.toISOString(),
    rfc822_message_id: h.get("message-id") ?? null,
    list_unsubscribe: h.has("list-unsubscribe"),
  };
}

function extractText(part: gmail_v1.Schema$MessagePart | undefined): { plain: string; html: string } {
  const out = { plain: "", html: "" };
  if (!part) return out;
  const data = part.body?.data ? Buffer.from(part.body.data, "base64url").toString("utf8") : "";
  if (part.mimeType === "text/plain") out.plain += data;
  else if (part.mimeType === "text/html") out.html += data;
  for (const p of part.parts ?? []) {
    const sub = extractText(p);
    out.plain += sub.plain;
    out.html += sub.html;
  }
  return out;
}

export class GoogleGmail implements GmailBackend {
  readonly kind = "google" as const;
  private readonly api: gmail_v1.Gmail;
  // Gmail allows 250 quota units/user/second; messages.get costs 5. Stay well below.
  private readonly limiter = new RateLimiter(30);
  private email: string | null = null;

  constructor(auth: OAuth2Client) {
    this.api = gmailApi({ version: "v1", auth });
  }

  async userEmail(): Promise<string> {
    if (!this.email) {
      await this.limiter.take();
      const p = await withRetry(() => this.api.users.getProfile({ userId: "me" }));
      this.email = (p.data.emailAddress ?? "").toLowerCase();
    }
    return this.email;
  }

  async search(q: SearchQuery): Promise<MessageMeta[]> {
    const max = q.max ?? 500;
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      await this.limiter.take();
      const res = await withRetry(() =>
        this.api.users.messages.list({ userId: "me", q: toGmailQuery(q), maxResults: Math.min(500, max - ids.length), pageToken }),
      );
      for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && ids.length < max);

    return mapLimit(ids, 8, async (id) => {
      await this.limiter.take();
      const r = await withRetry(() =>
        this.api.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: META_HEADERS }),
      );
      return toMeta(r.data);
    });
  }

  async getThread(threadId: string): Promise<MessageMeta[]> {
    await this.limiter.take();
    const r = await withRetry(() =>
      this.api.users.threads.get({ userId: "me", id: threadId, format: "metadata", metadataHeaders: META_HEADERS }),
    );
    return (r.data.messages ?? []).map(toMeta);
  }

  async getBodyText(messageId: string): Promise<string> {
    await this.limiter.take();
    const r = await withRetry(() => this.api.users.messages.get({ userId: "me", id: messageId, format: "full" }));
    const { plain, html } = extractText(r.data.payload);
    return plain.trim() || htmlToText(html);
  }

  async send(mail: OutgoingEmail): Promise<SentEmail> {
    const raw = base64url(
      buildMime({ from: await this.userEmail(), to: mail.to, subject: mail.subject, body: mail.body, inReplyTo: mail.in_reply_to }),
    );
    await this.limiter.take();
    const r = await withRetry(() =>
      this.api.users.messages.send({ userId: "me", requestBody: { raw, threadId: mail.thread_id ?? undefined } }),
    );
    const id = r.data.id!;
    // Fetch our own Message-ID so reminders can thread correctly.
    await this.limiter.take();
    const meta = await withRetry(() =>
      this.api.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["Message-ID"] }),
    );
    return { id, thread_id: r.data.threadId!, rfc822_message_id: toMeta(meta.data).rfc822_message_id };
  }
}
