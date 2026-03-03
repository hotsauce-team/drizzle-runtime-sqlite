/**
 * Deno sanity tests for drizzle-deno-sqlite
 *
 * These tests verify basic functionality of the adapter.
 * Run with: deno test --allow-all
 */

import { assertEquals, assertExists } from "jsr:@std/assert";
import { drizzle, createClient } from "../mod.ts";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql, eq } from "drizzle-orm";

// Define test schema
const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
});

const posts = sqliteTable("posts", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  authorId: integer("author_id").notNull(),
});

Deno.test("drizzle() - creates in-memory database by default", async () => {
  const db = drizzle();
  const result = await db.get(sql`SELECT 1 as value`);
  assertEquals(result, [1]);
});

Deno.test("drizzle() - creates database with :memory: path", async () => {
  const db = drizzle(":memory:");
  const result = await db.get(sql`SELECT 42 as answer`);
  assertEquals(result, [42]);
});

Deno.test("drizzle() - insert and select with query builder", async () => {
  const db = drizzle(":memory:", { schema: { users } });

  await db.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)`);
  await db.insert(users).values({ name: "Alice", email: "alice@example.com" });
  await db.insert(users).values({ name: "Bob", email: "bob@example.com" });

  const allUsers = await db.select().from(users);

  assertEquals(allUsers.length, 2);
  assertEquals(allUsers[0].name, "Alice");
  assertEquals(allUsers[1].name, "Bob");
});

Deno.test("drizzle() - select with where clause", async () => {
  const db = drizzle(":memory:", { schema: { users } });

  await db.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)`);
  await db.insert(users).values([
    { name: "Alice", email: "alice@example.com" },
    { name: "Bob", email: "bob@example.com" },
    { name: "Charlie", email: "charlie@example.com" },
  ]);

  const result = await db.select().from(users).where(eq(users.name, "Bob"));

  assertEquals(result.length, 1);
  assertEquals(result[0].name, "Bob");
  assertEquals(result[0].email, "bob@example.com");
});

Deno.test("drizzle() - update records", async () => {
  const db = drizzle(":memory:", { schema: { users } });

  await db.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)`);
  await db.insert(users).values({ name: "Alice", email: "old@example.com" });

  await db.update(users).set({ email: "new@example.com" }).where(eq(users.name, "Alice"));

  const result = await db.select().from(users).where(eq(users.name, "Alice"));
  assertEquals(result[0].email, "new@example.com");
});

Deno.test("drizzle() - delete records", async () => {
  const db = drizzle(":memory:", { schema: { users } });

  await db.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)`);
  await db.insert(users).values([
    { name: "Alice" },
    { name: "Bob" },
  ]);

  await db.delete(users).where(eq(users.name, "Alice"));

  const result = await db.select().from(users);
  assertEquals(result.length, 1);
  assertEquals(result[0].name, "Bob");
});

Deno.test("drizzle() - raw SQL with db.all()", async () => {
  const db = drizzle(":memory:");

  await db.run(sql`CREATE TABLE test (id INTEGER, value TEXT)`);
  await db.run(sql`INSERT INTO test VALUES (1, 'one'), (2, 'two')`);

  const result = await db.all(sql`SELECT id, value FROM test ORDER BY id`);

  // Raw SQL returns arrays, not objects
  assertEquals(result, [[1, "one"], [2, "two"]]);
});

Deno.test("drizzle() - raw SQL with db.get()", async () => {
  const db = drizzle(":memory:");

  await db.run(sql`CREATE TABLE test (id INTEGER, value TEXT)`);
  await db.run(sql`INSERT INTO test VALUES (1, 'one')`);

  const result = await db.get(sql`SELECT id, value FROM test WHERE id = 1`);

  // Raw SQL returns array for single row
  assertEquals(result, [1, "one"]);
});

Deno.test("createClient() - returns client with run and batch callbacks", () => {
  const client = createClient(":memory:");

  assertExists(client.run);
  assertExists(client.batch);
  assertExists(client.db);
  assertEquals(typeof client.run, "function");
  assertEquals(typeof client.batch, "function");
});

Deno.test("createClient() - db is accessible for direct operations", async () => {
  const client = createClient(":memory:");

  client.db.exec("CREATE TABLE direct_test (id INTEGER)");
  client.db.exec("INSERT INTO direct_test VALUES (42)");

  const stmt = client.db.prepare("SELECT id FROM direct_test");
  const result = stmt.get();

  assertEquals(result, { id: 42 });
});

Deno.test("drizzle() - batch operations", async () => {
  const db = drizzle(":memory:", { schema: { users } });

  await db.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)`);

  // Batch insert
  await db.batch([
    db.insert(users).values({ name: "Alice" }),
    db.insert(users).values({ name: "Bob" }),
    db.insert(users).values({ name: "Charlie" }),
  ]);

  const result = await db.select().from(users);
  assertEquals(result.length, 3);
});

Deno.test("drizzle() - transactions via raw SQL", async () => {
  const db = drizzle(":memory:", { schema: { users } });

  await db.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)`);

  await db.run(sql`BEGIN TRANSACTION`);
  await db.insert(users).values({ name: "Alice" });
  await db.insert(users).values({ name: "Bob" });
  await db.run(sql`COMMIT`);

  const result = await db.select().from(users);
  assertEquals(result.length, 2);
});

Deno.test("drizzle() - handles NULL values", async () => {
  const db = drizzle(":memory:", { schema: { users } });

  await db.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)`);
  await db.insert(users).values({ name: "Alice", email: null });

  const result = await db.select().from(users);
  assertEquals(result[0].email, null);
});

Deno.test("drizzle() - handles special characters in strings", async () => {
  const db = drizzle(":memory:", { schema: { users } });

  await db.run(sql`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)`);
  await db.insert(users).values({ name: "O'Connor", email: "test@example.com" });

  const result = await db.select().from(users).where(eq(users.name, "O'Connor"));
  assertEquals(result.length, 1);
  assertEquals(result[0].name, "O'Connor");
});
