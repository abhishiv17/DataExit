import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseAddress } from "./mime.js";
import type {
  CalendarBackend,
  CalendarEventInput,
  GmailBackend,
  MessageMeta,
  OutgoingEmail,
  SearchQuery,
  SentEmail,
} from "./types.js";

/**
 * Offline mailbox for tests and the offline demo. Format of the fixture file
 * (see docs/development/fixtures.md):
 *   { "user_email": "...", "messages": [{ id, thread_id?, from, to?, subject, date, body?, list_unsubscribe? }] }
 * Messages sent or injected at runtime are persisted to `statePath` so they survive restarts.
 */
export interface FixtureMessage {
  id: string;
  thread_id?: string;
  from: string;
  to?: string;
  subject: string;
  date: string;
  body?: string;
  list_unsubscribe?: boolean;
  rfc822_message_id?: string;
}

interface FixtureFile {
  user_email: string;
  messages: FixtureMessage[];
}

export class FixtureGmail implements GmailBackend {
  readonly kind = "fixture" as const;
  private readonly base: FixtureFile;

  constructor(
    fixturePath: string,
    private readonly statePath: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.base = existsSync(fixturePath) ? FixtureGmail.parse(readFileSync(fixturePath, "utf8")) : { user_email: "demo.user@example.com", messages: [] };
  }

  /**
   * Accepts our format, or Person B's demo index (demo/seed-inbox/messages.json):
   * an array of { messageId, date, from, to, subject, kind } with no bodies.
   */
  static parse(text: string): FixtureFile {
    const data = JSON.parse(text) as FixtureFile | Array<{ messageId: string; date: string; from: string; to?: string; subject: string }>;
    if (!Array.isArray(data)) return data;
    const counts = new Map<string, number>();
    for (const m of data) if (m.to) counts.set(m.to, (counts.get(m.to) ?? 0) + 1);
    const user = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "demo.user@example.com";
    return {
      user_email: user,
      messages: data.map((m) => ({ id: m.messageId, from: m.from, to: m.to, subject: m.subject, date: m.date })),
    };
  }

  private added(): FixtureMessage[] {
    return existsSync(this.statePath) ? (JSON.parse(readFileSync(this.statePath, "utf8")) as FixtureMessage[]) : [];
  }

  private all(): FixtureMessage[] {
    return [...this.base.messages, ...this.added()];
  }

  /** Adds a message (e.g. a company's reply) to the mailbox. */
  inject(m: Omit<FixtureMessage, "id"> & { id?: string }): FixtureMessage {
    const msg: FixtureMessage = { ...m, id: m.id ?? `fx-${randomUUID()}` };
    const added = this.added();
    added.push(msg);
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(added, null, 2));
    return msg;
  }

  private meta(m: FixtureMessage): MessageMeta {
    const from = parseAddress(m.from);
    return {
      id: m.id,
      thread_id: m.thread_id ?? m.id,
      from_email: from.email,
      from_name: from.name,
      from_domain: from.domain,
      to: m.to ?? this.base.user_email,
      subject: m.subject,
      date: new Date(m.date).toISOString(),
      rfc822_message_id: m.rfc822_message_id ?? `<${m.id}@fixture.local>`,
      list_unsubscribe: !!m.list_unsubscribe,
    };
  }

  async userEmail() {
    return this.base.user_email.toLowerCase();
  }

  async search(q: SearchQuery): Promise<MessageMeta[]> {
    const me = await this.userEmail();
    const phrases = q.subject_any?.map((s) => s.toLowerCase());
    return this.all()
      .map((m) => this.meta(m))
      .filter((m) => !phrases || phrases.some((p) => m.subject.toLowerCase().includes(p)))
      .filter((m) => !q.after || new Date(m.date) >= q.after)
      .filter((m) => !q.before || new Date(m.date) < q.before)
      .filter((m) => !q.exclude_sent || m.from_email !== me)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, q.max ?? 500);
  }

  async getThread(threadId: string) {
    return this.all()
      .map((m) => this.meta(m))
      .filter((m) => m.thread_id === threadId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getBodyText(messageId: string) {
    const m = this.all().find((x) => x.id === messageId);
    if (!m) throw new Error(`Fixture message ${messageId} not found`);
    return m.body ?? "";
  }

  async send(mail: OutgoingEmail): Promise<SentEmail> {
    const id = `fx-sent-${randomUUID()}`;
    const thread = mail.thread_id ?? id;
    const msg = this.inject({
      id,
      thread_id: thread,
      from: await this.userEmail(),
      to: mail.to,
      subject: mail.subject,
      date: this.now().toISOString(),
      body: mail.body,
      rfc822_message_id: `<${id}@fixture.local>`,
    });
    return { id: msg.id, thread_id: thread, rfc822_message_id: msg.rfc822_message_id ?? null };
  }
}

export class FixtureCalendar implements CalendarBackend {
  readonly kind = "fixture" as const;

  constructor(private readonly statePath: string) {}

  events(): Array<CalendarEventInput & { id: string }> {
    return existsSync(this.statePath) ? JSON.parse(readFileSync(this.statePath, "utf8")) : [];
  }

  async createDeadlineEvent(e: CalendarEventInput): Promise<string> {
    const events = this.events();
    const id = `fx-cal-${randomUUID()}`;
    events.push({ ...e, id });
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(events, null, 2));
    return id;
  }
}
