import {
  DEFAULT_SETTINGS,
  type AuditEvent,
  type AuditInput,
  type DataRequest,
  type Footprint,
  type UserSettings,
} from "@dataexit/shared";
import { buildAuditEvent } from "@dataexit/policy";
import type { Store } from "./types.js";

/** Minimal SQL client so the same store runs on node-postgres and on PGlite (tests). */
export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Runs a multi-statement script (migrations). */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Pick<SqlClient, "query">) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface AuditRow {
  user_id: string;
  seq: string | number;
  id: string;
  timestamp: string | Date;
  actor: AuditEvent["actor"];
  action: string;
  approval: AuditEvent["approval"];
  target: string | null;
  details: Record<string, unknown>;
  prev_hash: string;
  hash: string;
}

const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString());

function toEvent(r: AuditRow): AuditEvent {
  return {
    id: r.id,
    user_id: r.user_id,
    seq: Number(r.seq),
    actor: r.actor,
    action: r.action,
    approval: r.approval,
    target: r.target,
    details: r.details ?? {},
    timestamp: iso(r.timestamp),
    prev_hash: r.prev_hash,
    hash: r.hash,
  };
}

export class SqlStore implements Store {
  readonly kind = "postgres" as const;

  constructor(private readonly db: SqlClient) {}

  /** Applies db/schema.sql (idempotent). */
  async migrate(schemaSql: string): Promise<void> {
    await this.db.exec(schemaSql);
  }

  async listFootprints(userId: string) {
    const { rows } = await this.db.query<{ doc: Footprint }>(
      "SELECT doc FROM footprints WHERE user_id = $1 ORDER BY sensitivity_score DESC",
      [userId],
    );
    return rows.map((r) => r.doc);
  }

  async upsertFootprints(userId: string, footprints: Footprint[]) {
    if (!footprints.length) return;
    await this.db.transaction(async (tx) => {
      for (const f of footprints) {
        await tx.query(
          `INSERT INTO footprints (user_id, company_id, sensitivity_score, last_interaction, doc)
           VALUES ($1, $2, $3, $4, $5::jsonb)
           ON CONFLICT (user_id, company_id) DO UPDATE
             SET sensitivity_score = EXCLUDED.sensitivity_score,
                 last_interaction = EXCLUDED.last_interaction,
                 doc = EXCLUDED.doc`,
          [userId, f.company_id, f.sensitivity_score, f.last_interaction, JSON.stringify(f)],
        );
      }
    });
  }

  async getRequest(userId: string, id: string) {
    const { rows } = await this.db.query<{ doc: DataRequest }>(
      "SELECT doc FROM requests WHERE user_id = $1 AND id = $2",
      [userId, id],
    );
    return rows[0]?.doc ?? null;
  }

  async listRequests(userId: string) {
    const { rows } = await this.db.query<{ doc: DataRequest }>(
      "SELECT doc FROM requests WHERE user_id = $1 ORDER BY created_at, id",
      [userId],
    );
    return rows.map((r) => r.doc);
  }

  async saveRequest(req: DataRequest) {
    await this.db.query(
      `INSERT INTO requests (id, user_id, company_id, status, deadline, created_at, doc)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status, deadline = EXCLUDED.deadline, doc = EXCLUDED.doc`,
      [req.id, req.user_id, req.company_id, req.status, req.deadline, req.created_at, JSON.stringify(req)],
    );
  }

  async appendAudit(userId: string, input: AuditInput, now: Date) {
    return this.db.transaction(async (tx) => {
      // Serialise appends per user so the chain cannot fork.
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
      const { rows } = await tx.query<{ seq: string | number; hash: string }>(
        "SELECT seq, hash FROM audit_events WHERE user_id = $1 ORDER BY seq DESC LIMIT 1",
        [userId],
      );
      const prev = rows[0] ? { seq: Number(rows[0].seq), hash: rows[0].hash } : null;
      const e = buildAuditEvent(userId, prev, input, now);
      await tx.query(
        `INSERT INTO audit_events (user_id, seq, id, timestamp, actor, action, approval, target, details, prev_hash, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
        [e.user_id, e.seq, e.id, e.timestamp, e.actor, e.action, e.approval, e.target, JSON.stringify(e.details), e.prev_hash, e.hash],
      );
      return e;
    });
  }

  async listAudit(userId: string) {
    const { rows } = await this.db.query<AuditRow>(
      "SELECT * FROM audit_events WHERE user_id = $1 ORDER BY seq",
      [userId],
    );
    return rows.map(toEvent);
  }

  async getSettings(userId: string) {
    const { rows } = await this.db.query<{ doc: UserSettings }>("SELECT doc FROM user_settings WHERE user_id = $1", [userId]);
    return { ...DEFAULT_SETTINGS, ...rows[0]?.doc };
  }

  async saveSettings(userId: string, patch: Partial<UserSettings>) {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ doc: UserSettings }>(
        "SELECT doc FROM user_settings WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      const next = { ...DEFAULT_SETTINGS, ...rows[0]?.doc, ...patch };
      await tx.query(
        `INSERT INTO user_settings (user_id, doc) VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET doc = EXCLUDED.doc`,
        [userId, JSON.stringify(next)],
      );
      return next;
    });
  }

  async deleteUser(userId: string) {
    return this.db.transaction(async (tx) => {
      const del = async (table: string) =>
        (await tx.query(`DELETE FROM ${table} WHERE user_id = $1 RETURNING 1 AS x`, [userId])).rows.length;
      const counts = {
        footprints: await del("footprints"),
        requests: await del("requests"),
        audit_events: await del("audit_events"),
      };
      await del("user_settings");
      return counts;
    });
  }

  async close() {
    await this.db.close();
  }
}
