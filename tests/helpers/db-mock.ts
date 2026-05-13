/**
 * In-memory test double for `@/lib/db`.
 *
 * Why this exists:
 *   The implementation agent kept rebuilding this from scratch in every
 *   test file, usually getting one piece wrong (jest.mock hoisting,
 *   variable initialization order, SQL pattern matching). This module
 *   is the canonical mock — register it once at the top of your test
 *   file and forget about it.
 *
 * Wiring (copy into your test file, at module scope, BEFORE any imports
 * of route handlers — jest.mock is hoisted to the top of the file but
 * only when called at module scope, never inside `if` / `describe`):
 *
 *   jest.mock('@/lib/db', () => require('@/tests/helpers/db-mock'));
 *
 *   import handler from '@/pages/api/leads';
 *   import { resetStore, seedRow, getStore } from '@/tests/helpers/db-mock';
 *
 *   beforeEach(() => resetStore());
 *
 * The mock recognises four common SQL shapes (UPPERCASE-insensitive):
 *
 *   INSERT INTO <table> (col1, col2, ...) VALUES ($1, $2, ...) RETURNING *
 *   SELECT * FROM <table> [WHERE col = $1 [AND ...]] [ORDER BY ...] [LIMIT n]
 *   UPDATE <table> SET col = $1, ..., updated_at = now(), version = version + 1
 *      WHERE id = $N AND version = $M RETURNING *
 *   DELETE FROM <table> WHERE id = $1 [AND version = $2] RETURNING *
 *
 * That covers every CRUD route the platform's task drafter emits. For
 * anything more exotic (joins, aggregates, subqueries) the test author
 * should `jest.mock('@/lib/db', () => ({ query: jest.fn(...) }))` with
 * an inline factory instead — this generic mock is for the 90% case.
 *
 * The mock automatically:
 *   - generates UUIDs for `id` columns left absent on INSERT
 *   - sets `created_at` / `updated_at` to `new Date().toISOString()`
 *   - increments `version` from 1 on insert, +1 on update
 *   - returns 0 rows on UPDATE/DELETE when `version` doesn't match (so
 *     route handlers can detect 409 stale-version cleanly)
 *
 * Direct store access is exported so tests can seed arbitrary rows:
 *
 *   seedRow('leads', { id: 'lead-1', name: 'Alice', status: 'New', version: 1 });
 *   const { rows } = await query('SELECT * FROM leads', []);
 */

interface Row {
  [key: string]: unknown;
}

const store: Map<string, Row[]> = new Map();
let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  // Deterministic, UUID-shaped ids so test assertions can match if needed.
  const hex = idCounter.toString(16).padStart(12, "0");
  return `00000000-0000-0000-0000-${hex}`;
}

function tableRows(table: string): Row[] {
  const lower = table.toLowerCase();
  let rows = store.get(lower);
  if (!rows) {
    rows = [];
    store.set(lower, rows);
  }
  return rows;
}

/** Reset the entire store between tests. Call this in `beforeEach`. */
export function resetStore(): void {
  store.clear();
  idCounter = 0;
}

/** Seed a row directly. Useful for setting up state without going through SQL. */
export function seedRow(table: string, row: Row): Row {
  const enriched: Row = {
    id: row.id ?? nextId(),
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
    version: row.version ?? 1,
    ...row,
  };
  tableRows(table).push(enriched);
  return enriched;
}

/** Get a snapshot of a table's rows (for assertions). */
export function getStore(table: string): Row[] {
  return [...tableRows(table)];
}

// ── SQL pattern parsers ─────────────────────────────────────────────────

// Note: SQL is normalised below via `replace(/\s+/g, " ")` so `.` never
// needs to match newlines — the `s` (dotAll) flag would require ES2018,
// which is past this template's TS target. Plain `.` is enough.
const reInsert =
  /^INSERT\s+INTO\s+"?(\w+)"?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*(?:RETURNING\s+(.*))?$/i;
const reSelect =
  /^SELECT\s+(.+?)\s+FROM\s+"?(\w+)"?\s*(?:WHERE\s+(.+?))?\s*(?:ORDER\s+BY\s+(.+?))?\s*(?:LIMIT\s+(\d+))?\s*(?:OFFSET\s+(\d+))?\s*$/i;
const reUpdate =
  /^UPDATE\s+"?(\w+)"?\s+SET\s+(.+?)\s+WHERE\s+(.+?)\s*(?:RETURNING\s+(.*))?$/i;
const reDelete =
  /^DELETE\s+FROM\s+"?(\w+)"?\s+WHERE\s+(.+?)\s*(?:RETURNING\s+(.*))?$/i;

function paramAt(params: unknown[], placeholder: string): unknown {
  const m = placeholder.match(/^\$(\d+)$/);
  if (!m) return undefined;
  const idx = parseInt(m[1], 10) - 1;
  return params[idx];
}

function evalCondition(
  row: Row,
  whereClause: string,
  params: unknown[],
): boolean {
  // Split AND-joined equality predicates: `col = $N` chunks.
  const parts = whereClause.split(/\s+AND\s+/i);
  for (const part of parts) {
    const m = part.match(/^\s*"?(\w+)"?\s*=\s*(\$\d+)\s*$/);
    if (!m) {
      // Unsupported predicate (LIKE, IN, etc.) — be loud rather than
      // silently miss rows. Tests for unusual queries should mock
      // `query` with an inline factory instead.
      throw new Error(
        `db-mock: unsupported WHERE predicate "${part.trim()}". The ` +
          "generic mock supports `col = $N` joined by AND only. Use an " +
          "inline jest.mock factory for more complex SQL.",
      );
    }
    const col = m[1];
    const expected = paramAt(params, m[2]);
    if (row[col] !== expected) return false;
  }
  return true;
}

function applyOrderBy(rows: Row[], orderBy: string | undefined): Row[] {
  if (!orderBy) return rows;
  // Support `col [ASC|DESC]` only. Multiple sort keys aren't worth the
  // complexity here — split into separate test cases if needed.
  const m = orderBy.trim().match(/^"?(\w+)"?\s*(ASC|DESC)?$/i);
  if (!m) return rows;
  const col = m[1];
  const dir = (m[2] ?? "ASC").toUpperCase() === "DESC" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[col];
    const bv = b[col];
    if (av === bv) return 0;
    if (av === undefined || av === null) return -1 * dir;
    if (bv === undefined || bv === null) return 1 * dir;
    return (av as number | string) > (bv as number | string) ? dir : -dir;
  });
}

// ── The exported `query` function ───────────────────────────────────────

/**
 * Drop-in replacement for `query` from the platform's `lib/db.ts`.
 * Returns the same `{ rows, rowCount }` shape the route handlers expect.
 */
export async function query<T extends Row = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const normalized = sql.trim().replace(/\s+/g, " ");

  // INSERT
  let m = normalized.match(reInsert);
  if (m) {
    const [, table, colsRaw, valsRaw] = m;
    const cols = colsRaw.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const vals = valsRaw.split(",").map((v) => v.trim());
    const row: Row = {};
    for (let i = 0; i < cols.length; i += 1) {
      row[cols[i]] = paramAt(params, vals[i]);
    }
    const inserted = seedRow(table, row);
    return { rows: [inserted as T], rowCount: 1 };
  }

  // UPDATE
  m = normalized.match(reUpdate);
  if (m) {
    const [, table, setRaw, whereClause] = m;
    const rows = tableRows(table);
    const matching = rows.filter((r) => evalCondition(r, whereClause, params));
    if (matching.length === 0) {
      return { rows: [] as T[], rowCount: 0 };
    }
    const setParts = setRaw.split(",").map((p) => p.trim());
    for (const row of matching) {
      for (const part of setParts) {
        // version = version + 1
        const inc = part.match(/^"?(\w+)"?\s*=\s*"?\1"?\s*\+\s*(\d+)$/i);
        if (inc) {
          row[inc[1]] = ((row[inc[1]] as number) ?? 0) + parseInt(inc[2], 10);
          continue;
        }
        // updated_at = now()
        if (/^"?\w+"?\s*=\s*now\(\)\s*$/i.test(part)) {
          const col = part.split("=")[0].trim().replace(/^"|"$/g, "");
          row[col] = new Date().toISOString();
          continue;
        }
        // col = $N
        const eq = part.match(/^"?(\w+)"?\s*=\s*(\$\d+)$/);
        if (eq) {
          row[eq[1]] = paramAt(params, eq[2]);
          continue;
        }
        throw new Error(`db-mock: unsupported SET clause "${part}".`);
      }
    }
    return { rows: matching as T[], rowCount: matching.length };
  }

  // DELETE
  m = normalized.match(reDelete);
  if (m) {
    const [, table, whereClause] = m;
    const rows = tableRows(table);
    const survivors: Row[] = [];
    const removed: Row[] = [];
    for (const r of rows) {
      if (evalCondition(r, whereClause, params)) {
        removed.push(r);
      } else {
        survivors.push(r);
      }
    }
    store.set(table.toLowerCase(), survivors);
    return { rows: removed as T[], rowCount: removed.length };
  }

  // SELECT
  m = normalized.match(reSelect);
  if (m) {
    const [, , table, whereClause, orderBy, limitRaw] = m;
    let rows = tableRows(table);
    if (whereClause) {
      rows = rows.filter((r) => evalCondition(r, whereClause, params));
    }
    rows = applyOrderBy(rows, orderBy);
    if (limitRaw) {
      rows = rows.slice(0, parseInt(limitRaw, 10));
    }
    return { rows: rows as T[], rowCount: rows.length };
  }

  throw new Error(
    `db-mock: did not recognise SQL shape. Got: ${sql.slice(0, 200)}\n` +
      `Supported shapes: INSERT … RETURNING *, SELECT … [WHERE col=$N AND …] ` +
      `[ORDER BY] [LIMIT], UPDATE … SET … WHERE … RETURNING *, DELETE … WHERE … ` +
      `RETURNING *. For more exotic SQL, mock @/lib/db inline.`,
  );
}

// ── A `pool` shim ──────────────────────────────────────────────────────
// Some route handlers import `pool` directly and call `pool.query(...)`.
// Match that surface so the same mock works whichever pattern the
// route uses.

export const pool = {
  query: query as (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Row[]; rowCount: number }>,
};
