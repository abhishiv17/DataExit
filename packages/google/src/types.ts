/** Message headers only. Bodies are never part of search results. */
export interface MessageMeta {
  id: string;
  thread_id: string;
  from_email: string;
  from_name: string;
  from_domain: string;
  to: string;
  subject: string;
  date: string; // ISO
  rfc822_message_id: string | null;
  list_unsubscribe: boolean;
}

/** Structured search, so the Google and fixture backends can both implement it. */
export interface SearchQuery {
  /** Match if the subject contains any of these phrases (case-insensitive). */
  subject_any?: string[];
  after?: Date;
  before?: Date;
  /** Exclude messages the user sent. */
  exclude_sent?: boolean;
  max?: number;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  thread_id?: string | null;
  in_reply_to?: string | null;
}

export interface SentEmail {
  id: string;
  thread_id: string;
  rfc822_message_id: string | null;
}

export interface GmailBackend {
  readonly kind: "google" | "fixture";
  userEmail(): Promise<string>;
  search(q: SearchQuery): Promise<MessageMeta[]>;
  getThread(threadId: string): Promise<MessageMeta[]>;
  /** Reads one body transiently (reply classification). Callers must not store it. */
  getBodyText(messageId: string): Promise<string>;
  send(mail: OutgoingEmail): Promise<SentEmail>;
}

export interface CalendarEventInput {
  title: string;
  description: string;
  date: string; // YYYY-MM-DD, all-day
}

export interface CalendarBackend {
  readonly kind: "google" | "fixture";
  createDeadlineEvent(e: CalendarEventInput): Promise<string>;
}
