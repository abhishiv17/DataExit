import type { AuditEvent, AuditInput, DataRequest, Footprint, UserSettings } from "@dataexit/shared";

/** Persistence for per-user state. Implementations: FileStore (dev) and SqlStore (Postgres). */
export interface Store {
  readonly kind: "file" | "postgres";

  listFootprints(userId: string): Promise<Footprint[]>;
  upsertFootprints(userId: string, footprints: Footprint[]): Promise<void>;

  getRequest(userId: string, id: string): Promise<DataRequest | null>;
  listRequests(userId: string): Promise<DataRequest[]>;
  saveRequest(req: DataRequest): Promise<void>;

  /** Atomically appends the next event in the user's hash chain. */
  appendAudit(userId: string, input: AuditInput, now: Date): Promise<AuditEvent>;
  listAudit(userId: string): Promise<AuditEvent[]>;

  getSettings(userId: string): Promise<UserSettings>;
  saveSettings(userId: string, patch: Partial<UserSettings>): Promise<UserSettings>;

  /** Removes everything held for the user. Returns counts per kind. */
  deleteUser(userId: string): Promise<{ footprints: number; requests: number; audit_events: number }>;

  close(): Promise<void>;
}
