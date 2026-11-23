import pg from "pg";
import type { SqlClient } from "./sql-store.js";

/** node-postgres adapter for SqlStore. */
export function pgClient(connectionString: string): SqlClient {
  const pool = new pg.Pool({ connectionString, max: 5 });
  return {
    async query<T>(sql: string, params?: unknown[]) {
      const r = await pool.query(sql, params as unknown[] | undefined);
      return { rows: r.rows as T[] };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Pick<SqlClient, "query">) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({
          async query<R>(sql: string, params?: unknown[]) {
            const r = await client.query(sql, params as unknown[] | undefined);
            return { rows: r.rows as R[] };
          },
        });
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}
