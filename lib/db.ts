/**
 * Postgres connection pool — single instance per server process.
 *
 * Platform-managed. The `pool` export is consumed by the auth layer
 * (`@auth/pg-adapter`) and any other server-side code that needs
 * direct DB access. The `query` export is the convenience helper that
 * generated app code uses everywhere — it returns rows directly
 * instead of a `QueryResult` wrapper, matching the shape the codeagent
 * already assumes when it writes `import { query } from '@/lib/db'`.
 *
 * If the app already has a `lib/db.ts` (e.g., the schema agent
 * generated one), the auth provisioner refuses to overwrite — it
 * expects this file to either not exist OR already export `pool` AND
 * `query` compatible with these signatures.
 */
import { Pool, type QueryResultRow } from "pg";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

// Reuse a single pool across hot reloads in dev so we don't exhaust
// connections. In production, each Lambda / serverless instance gets
// its own pool (same pattern, no harm).
export const pool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString: requireEnv("DATABASE_URL"),
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

/**
 * Convenience helper — returns rows directly. Generated code does
 * `import { query } from '@/lib/db'` and treats the result as `T[]`.
 * Without this export the agent either ships broken code or "fixes"
 * by inventing other names. Keep the signature stable.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: ReadonlyArray<unknown>,
): Promise<T[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await pool.query<T>(sql, params as any);
  return r.rows;
}
