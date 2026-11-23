import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { verifyAuditChain } from "@dataexit/policy";
import type { DataRequest, Footprint } from "@dataexit/shared";
import { FileStore, SqlStore, type SqlClient, type Store } from "@dataexit/store";
import { ROOT } from "./helpers.js";

/** Runs SqlStore on PGlite: real Postgres compiled to WebAssembly, in memory. */
function pgliteClient(db: PGlite): SqlClient {
  return {
    query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await db.query<T>(sql, params)).rows }),
    exec: async (sql: string) => {
      await db.exec(sql);
    },
    transaction: <T>(fn: (tx: Pick<SqlClient, "query">) => Promise<T>) =>
      db.transaction((tx) => fn({ query: async <R>(sql: string, params?: unknown[]) => ({ rows: (await tx.query<R>(sql, params)).rows }) })),
    close: () => db.close(),
  };
}

const now = new Date("2026-11-24T00:00:00Z");
const fp = (company_id: string, score: number): Footprint => ({
  user_id: "u1", company_id, first_seen: "2020-01-01T00:00:00.000Z", last_interaction: "2021-01-01T00:00:00.000Z",
  evidence_message_ids: ["m1"], sensitivity_score: score, matched: true, display_name: company_id, domains: [`${company_id}.example`], message_count: 1,
});
const req = (id: string, status: DataRequest["status"]): DataRequest => ({
  id, company_id: "c1", type: "erase", legal_basis: "s", language: "hi", body: "नमस्ते", tier: "full_review", status, sent_at: null, deadline: null,
  replies: [], user_id: "u1", company_name: "C", subject: "विषय", recipient: null, created_at: now.toISOString(), enforceability: "policy_based",
  requested_type: "erase", retention_note: null, approved_at: null, undo_until: null, cancelled_at: null, gmail_message_id: null, gmail_thread_id: null,
  rfc822_message_id: null, calendar_event_id: null, source_message_ids: [], parent_id: null, escalation_level: null, sendable: true,
});

async function contract(name: string, make: () => Promise<Store>) {
  await test(`${name}: footprints, requests, settings, audit chain, delete`, async () => {
    const s = await make();
    await s.upsertFootprints("u1", [fp("a", 10), fp("b", 50)]);
    await s.upsertFootprints("u1", [{ ...fp("a", 70), message_count: 3 }]);
    const fps = await s.listFootprints("u1");
    assert.equal(fps.length, 2);
    assert.equal(fps.find((f) => f.company_id === "a")?.message_count, 3);
    assert.deepEqual(await s.listFootprints("other"), []);

    await s.saveRequest(req("r1", "draft"));
    await s.saveRequest({ ...req("r1", "approved"), approved_at: now.toISOString() });
    const r = await s.getRequest("u1", "r1");
    assert.equal(r?.status, "approved");
    assert.equal(r?.body, "नमस्ते");
    assert.equal(await s.getRequest("u2", "r1"), null);

    assert.equal((await s.getSettings("u1")).language, "en");
    await s.saveSettings("u1", { user_name: "Priya" });
    const st = await s.saveSettings("u1", { auto_low_risk: true });
    assert.equal(st.user_name, "Priya");
    assert.equal(st.auto_low_risk, true);

    // Concurrent appends must not fork the chain.
    await Promise.all(Array.from({ length: 15 }, (_, i) => s.appendAudit("u1", { actor: "agent", action: `a${i}`, details: { i } }, now)));
    const chain = await s.listAudit("u1");
    assert.equal(chain.length, 15);
    assert.deepEqual(chain.map((e) => e.seq), Array.from({ length: 15 }, (_, i) => i + 1));
    assert.equal(verifyAuditChain(chain).ok, true);

    const counts = await s.deleteUser("u1");
    assert.deepEqual(counts, { footprints: 2, requests: 1, audit_events: 15 });
    assert.deepEqual(await s.listAudit("u1"), []);
    assert.equal((await s.getSettings("u1")).user_name, null);
    await s.close();
  });
}

await contract("FileStore", async () => new FileStore(join(mkdtempSync(join(tmpdir(), "dataexit-store-")), "store.json")));
await contract("SqlStore (PGlite)", async () => {
  const s = new SqlStore(pgliteClient(new PGlite()));
  await s.migrate(readFileSync(join(ROOT, "db", "schema.sql"), "utf8"));
  // Migration must be idempotent.
  await s.migrate(readFileSync(join(ROOT, "db", "schema.sql"), "utf8"));
  return s;
});
