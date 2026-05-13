# Tests

This template ships canonical test helpers so the implementation agent
doesn't reinvent them every run. **Use them. Don't write your own
`NextRequest` plumbing or DB mock.**

## Directory layout

```
tests/
  helpers/
    route.ts      ← invokeRoute() — Pages Router handler invocation
    db-mock.ts    ← in-memory replacement for @/lib/db
__tests__/        ← place your tests here
```

## API route test recipe

```ts
// __tests__/api/leads.test.ts

// Module-scope jest.mock — MUST be at the top, NOT inside `if`/`describe`.
// babel-jest only hoists top-level jest.mock calls; a conditional one
// runs after imports and the real @/lib/db loads instead.
jest.mock('@/lib/db', () => require('@/tests/helpers/db-mock'));

import handler from '@/pages/api/leads';
import detailHandler from '@/pages/api/leads/[id]';
import { invokeRoute } from '@/tests/helpers/route';
import { resetStore, seedRow, getStore } from '@/tests/helpers/db-mock';

describe('Leads API', () => {
  beforeEach(() => resetStore());

  it('GET /api/leads returns []', async () => {
    const { status, body } = await invokeRoute(handler, { method: 'GET' });
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it('POST /api/leads creates a lead', async () => {
    const { status, body } = await invokeRoute<{ id: string; version: number }>(
      handler,
      { method: 'POST', body: { name: 'Alice', status: 'New' } },
    );
    expect(status).toBe(201);
    expect(body?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body?.version).toBe(1);
  });

  it('PATCH /api/leads/[id] with stale version returns 409', async () => {
    const lead = seedRow('leads', { name: 'Bob', status: 'New', version: 2 });
    const { status } = await invokeRoute(detailHandler, {
      method: 'PATCH',
      query: { id: lead.id as string },
      body: { version: 1, status: 'Contacted' },
    });
    expect(status).toBe(409);
  });

  it('DELETE then GET returns 404', async () => {
    const lead = seedRow('leads', { name: 'Carol', status: 'New' });
    await invokeRoute(detailHandler, {
      method: 'DELETE',
      query: { id: lead.id as string },
      body: { version: 1 },
    });
    const { status } = await invokeRoute(detailHandler, {
      method: 'GET',
      query: { id: lead.id as string },
    });
    expect(status).toBe(404);
  });
});
```

## Common pitfalls — avoid

| Wrong | Right |
|---|---|
| `new NextRequest(...)` | `invokeRoute(handler, { method, body, query })` |
| `req.json()` | `req.body` (already parsed by Next.js) |
| Destructuring `params` argument | `req.query.id` |
| `jest.mock(...)` inside `if (!USE_REAL_DB)` | `jest.mock(...)` at module scope; toggle inside the factory if needed |
| `let store: Row[] = []` referenced inside `jest.mock` factory | Use `tests/helpers/db-mock`'s `getStore()` / `resetStore()` |
| Returning `Response.json(...)` from a handler | `res.status(200).json(...)` |

## What the db-mock supports

- `INSERT INTO <t> (...) VALUES ($1, ...) RETURNING *`
- `SELECT ... FROM <t> [WHERE col=$N AND ...] [ORDER BY col [ASC|DESC]] [LIMIT n]`
- `UPDATE <t> SET col=$1, ..., updated_at = now(), version = version + 1
   WHERE id=$N AND version=$M RETURNING *`
- `DELETE FROM <t> WHERE id=$1 [AND version=$2] RETURNING *`

Anything more exotic (joins, aggregates, CTEs) — write a per-test inline
mock instead:

```ts
jest.mock('@/lib/db', () => ({
  query: jest.fn().mockResolvedValueOnce({ rows: [...], rowCount: 1 }),
}));
```
