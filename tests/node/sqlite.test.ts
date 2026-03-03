/**
 * Integration tests using Drizzle's official shared test suite.
 */

import { Name, sql } from "drizzle-orm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { drizzle as proxyDrizzle } from "drizzle-orm/sqlite-proxy";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { skipTests } from "./common";
import {
  createBatchCallback,
  createCallback,
  createClient,
} from "../../mod.ts";
import {
  tests,
  usersTable,
} from "../../repos/drizzle-orm/integration-tests/tests/sqlite/sqlite-common";

let db: SqliteRemoteDatabase;
let client: ReturnType<typeof createClient>;

// Detect if setReturnArrays is available (Node 22.16+/24+)
function hasArrayMode(): boolean {
  const testClient = createClient(":memory:");
  const stmt = testClient.db.prepare("SELECT 1");
  const has = typeof (stmt as any).setReturnArrays === "function";
  testClient.db.close();
  return has;
}

const supportsArrayMode = hasArrayMode();

beforeAll(async () => {
  const dbPath = process.env["SQLITE_DB_PATH"] ?? ":memory:";
  client = createClient(dbPath);

  const callback = createCallback(client.db);
  const batchCallback = createBatchCallback(client.db);

  db = proxyDrizzle(callback, batchCallback);
});

beforeEach((ctx) => {
  ctx.sqlite = {
    db,
  };
});

afterAll(async () => {
  client?.db.close();
});

// Tests to always skip (driver-specific behavior)
const alwaysSkip = [
  // Different driver response format - sqlite-proxy returns arrays
  "insert via db.get w/ query builder",
  "insert via db.run + select via db.get",
  "insert via db.get",
  "insert via db.run + select via db.all",
  // SQLite syntax not supported (requires SQLITE_ENABLE_UPDATE_DELETE_LIMIT compile flag)
  "update with limit and order by",
  "delete with limit and order by",
];

// Tests that require setReturnArrays (Node 24+) for correct column ordering in joins
const requiresArrayMode = [
  "partial join with alias",
  "full join with alias",
  "select from alias",
  "join view as subquery",
  "cross join",
];

skipTests(
  supportsArrayMode ? alwaysSkip : [...alwaysSkip, ...requiresArrayMode],
);

tests();

beforeEach(async () => {
  await db.run(sql`drop table if exists ${usersTable}`);

  await db.run(sql`
		create table ${usersTable} (
		 id integer primary key,
		 name text not null,
		 verified integer not null default 0,
		 json blob,
		 created_at integer not null default (strftime('%s', 'now'))
		)
	`);
});

test("insert via db.get w/ query builder", async () => {
  const inserted = await db.get<
    Pick<typeof usersTable.$inferSelect, "id" | "name">
  >(
    db.insert(usersTable).values({ name: "John" }).returning({
      id: usersTable.id,
      name: usersTable.name,
    }),
  );
  expect(inserted).toEqual([1, "John"]);
});

test("insert via db.run + select via db.get", async () => {
  await db.run(
    sql`insert into ${usersTable} (${new Name(
      usersTable.name.name,
    )}) values (${"John"})`,
  );

  const result = await db.get<{ id: number; name: string }>(
    sql`select ${usersTable.id}, ${usersTable.name} from ${usersTable}`,
  );
  expect(result).toEqual([1, "John"]);
});

test("insert via db.get", async () => {
  const inserted = await db.get<{ id: number; name: string }>(
    sql`insert into ${usersTable} (${new Name(
      usersTable.name.name,
    )}) values (${"John"}) returning ${usersTable.id}, ${usersTable.name}`,
  );
  expect(inserted).toEqual([1, "John"]);
});

test("insert via db.run + select via db.all", async () => {
  await db.run(
    sql`insert into ${usersTable} (${new Name(
      usersTable.name.name,
    )}) values (${"John"})`,
  );

  const result = await db.all<{ id: number; name: string }>(
    sql`select ${usersTable.id}, ${usersTable.name} from ${usersTable}`,
  );
  expect(result).toEqual([[1, "John"]]);
});
