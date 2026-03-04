# @hotsauce/drizzle-runtime-sqlite

Drizzle ORM adapter for Deno's built-in `node:sqlite` module.

## Installation

```ts
// deno.json
{
  "imports": {
    "@hotsauce/drizzle-runtime-sqlite": "jsr:@hotsauce/drizzle-runtime-sqlite@^0.1.0",
    "drizzle-orm": "npm:drizzle-orm@^0.45.0"
  }
}
```

## Usage

```ts
import { drizzle } from "@hotsauce/drizzle-runtime-sqlite";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

// In-memory database
const db = drizzle(":memory:", { schema: { users } });

// Or with a file path
const db = drizzle("./data.db", { schema: { users } });

// Standard Drizzle operations
await db.insert(users).values({ name: "Alice" });
const allUsers = await db.select().from(users);
```

### Using drizzle-orm/sqlite-proxy directly

If you need more control, use `createClient()` with drizzle-orm's sqlite-proxy:

```ts
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { createClient } from "@hotsauce/drizzle-runtime-sqlite";

const client = createClient(":memory:");
const db = drizzle(client.run, client.batch, { schema: { users } });

// Access the underlying DatabaseSync
client.db.exec("PRAGMA journal_mode = WAL");
```

### Drizzle Kit Driver (Experimental)

A drop-in replacement for better-sqlite3 in drizzle-kit's connections is available:

```ts
import { createDrizzleKitDriver } from "@hotsauce/drizzle-runtime-sqlite/kit";

const driver = await createDrizzleKitDriver({ url: "./database.db" });

// Returns drizzle-kit compatible interface:
// { query, run, proxy, transactionProxy, migrate, packageName: "node:sqlite" }
```

> **Note:** This driver is intended for integration into drizzle-kit itself and is not currently tested independently. Use at your own risk.

## Requirements

- Deno 2.6.0+ (first version with `stmt.columns()` support)
  - Deno 2.7.0+: Full functionality with `setReturnArrays`
- Node.js 22.16+ or 24.0+ (for full functionality)
  - Node 22.5.0-22.15.x: Works, but join queries may return incorrect column ordering due to missing `setReturnArrays`

## Limitations

### Join Column Ordering (Deno < 2.7 / Node < 22.16)

Without the `setReturnArrays` API, this driver falls back to converting object rows to arrays using column metadata. This can produce incorrect results for joins that select columns with duplicate names:

```ts
// May return incorrect column ordering on older runtime versions
const result = await db
  .select({ userId: users.id, postId: posts.id })
  .from(users)
  .innerJoin(posts, eq(users.id, posts.userId));
```

**Solution:** Use Deno 2.7+ or Node.js 22.16+/24+, which support the `setReturnArrays` API for correct ordering.

| Runtime | `stmt.columns()` | `setReturnArrays` | Status |
|---------|------------------|-------------------|--------|
| Deno < 2.6 | ❌ | ❌ | Not supported |
| Deno 2.6.x | ✅ | ❌ | Works (join limitations) |
| Deno 2.7+ | ✅ | ✅ | Full support |
| Node < 22.5 | ❌ | ❌ | Not supported |
| Node 22.5-22.15 | ✅ | ❌ | Works (join limitations) |
| Node 22.16+/24+ | ✅ | ✅ | Full support |

### UPDATE/DELETE with LIMIT

Both Deno and Node's `node:sqlite` bundle SQLite without the `SQLITE_ENABLE_UPDATE_DELETE_LIMIT` compile option. This means the following Drizzle operations will fail:

```ts
// ❌ Not supported
await db.delete(users).where(eq(users.active, false)).limit(10);
await db.update(users).set({ status: "archived" }).orderBy(users.createdAt).limit(5);
```

**Workaround:** Select the IDs first, then delete/update by ID:

```ts
// ✅ Supported
const toDelete = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.active, false))
  .limit(10);

await db.delete(users).where(
  inArray(users.id, toDelete.map(r => r.id))
);
```

This is a SQLite compile-time limitation, not a driver bug. If you need this feature, consider using `better-sqlite3` with `drizzle-orm/better-sqlite3` instead, as it compiles SQLite with this option enabled.

### Raw SQL Returns Arrays

This driver uses Drizzle's `sqlite-proxy` pattern. While the query builder returns objects as expected:

```ts
const users = await db.select().from(usersTable);
// → [{ id: 1, name: 'Alice' }]  ✅ Objects
```

Raw SQL queries via `db.get()` and `db.all()` return arrays instead of objects:

```ts
const result = await db.get(sql`SELECT id, name FROM users WHERE id = 1`);
// → [1, 'Alice']  (array, not { id: 1, name: 'Alice' })

const results = await db.all(sql`SELECT id, name FROM users`);
// → [[1, 'Alice'], [2, 'Bob']]  (array of arrays)
```

This matches the sqlite-proxy specification. For most use cases, prefer the query builder which returns properly typed objects.

## Development

### Prerequisites

- Docker and Docker Compose
- Make

### Local Setup

```bash
# Enable pre-commit hooks (runs fmt/lint/check)
git config core.hooksPath .githooks && \
chmod +x .githooks/pre-commit
```

### Running Tests

Tests run in Docker containers to ensure consistent environments.

```bash
# Clone Drizzle's shared test suite (required)
make clone-repo

# Run Deno 2.7.2 tests (default)
make test-deno-2.7

# Run Deno 2.6.0 tests (minimum supported)
make test-deno-2.6

# Run Node 22 tests
make test-node22

# Run Node 24 tests
make test-node24
```

All test targets use Drizzle's official shared test suite (~130 tests) to ensure compatibility with the sqlite-proxy pattern.

## License

MIT
