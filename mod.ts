/**
 * @module
 * Drizzle ORM adapter for Deno's node:sqlite module.
 *
 * @example
 * ```ts
 * import { drizzle } from "@hotsauce/drizzle-runtime-sqlite";
 * import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
 *
 * const users = sqliteTable("users", {
 *   id: integer("id").primaryKey(),
 *   name: text("name").notNull(),
 * });
 *
 * const db = drizzle(":memory:", { schema: { users } });
 *
 * await db.insert(users).values({ name: "Alice" });
 * const allUsers = await db.select().from(users);
 * ```
 */

import { DatabaseSync } from "node:sqlite";
import { drizzle as proxyDrizzle } from "drizzle-orm/sqlite-proxy";
import type {
  AsyncBatchRemoteCallback,
  AsyncRemoteCallback,
  SqliteRemoteDatabase,
} from "drizzle-orm/sqlite-proxy";
import { createBatchCallback, createCallback } from "./src/callback.ts";
import type { DrizzleDenoSqliteConfig } from "./src/types.ts";

export type {
  BatchItem,
  DrizzleDenoSqliteConfig,
  SqliteOptions,
} from "./src/types.ts";
export { createBatchCallback, createCallback } from "./src/callback.ts";

/**
 * Create a Drizzle ORM instance backed by node:sqlite.
 *
 * @param clientOrPath - DatabaseSync instance, file path, or ":memory:"
 * @param config - Drizzle configuration options
 * @returns Drizzle database instance
 *
 * @example
 * ```ts
 * // In-memory database
 * const db = drizzle();
 *
 * // File-based database
 * const db = drizzle("./data.db");
 *
 * // With schema for relational queries
 * const db = drizzle(":memory:", { schema: { users, posts } });
 *
 * // With existing DatabaseSync instance
 * const client = new DatabaseSync(":memory:");
 * const db = drizzle(client);
 * ```
 */
export function drizzle<
  TSchema extends Record<string, unknown> = Record<string, never>,
>(
  clientOrPath?: DatabaseSync | string,
  config?: DrizzleDenoSqliteConfig<TSchema>,
): SqliteRemoteDatabase<TSchema>;

export function drizzle<
  TSchema extends Record<string, unknown> = Record<string, never>,
>(
  config?: DrizzleDenoSqliteConfig<TSchema>,
): SqliteRemoteDatabase<TSchema>;

export function drizzle<
  TSchema extends Record<string, unknown> = Record<string, never>,
>(
  clientOrPathOrConfig?:
    | DatabaseSync
    | string
    | DrizzleDenoSqliteConfig<TSchema>,
  maybeConfig?: DrizzleDenoSqliteConfig<TSchema>,
): SqliteRemoteDatabase<TSchema> {
  let client: DatabaseSync;
  let config: DrizzleDenoSqliteConfig<TSchema>;

  // Parse overloaded arguments
  if (clientOrPathOrConfig === undefined) {
    // drizzle() - default in-memory
    client = new DatabaseSync(":memory:");
    config = {};
  } else if (clientOrPathOrConfig instanceof DatabaseSync) {
    // drizzle(client, config?)
    client = clientOrPathOrConfig;
    config = maybeConfig ?? {};
  } else if (typeof clientOrPathOrConfig === "string") {
    // drizzle(path, config?)
    config = maybeConfig ?? {};
    client = config.databaseOptions
      ? new DatabaseSync(clientOrPathOrConfig, config.databaseOptions)
      : new DatabaseSync(clientOrPathOrConfig);
  } else {
    // drizzle(config) - config object with optional client
    config = clientOrPathOrConfig;
    if (config.client instanceof DatabaseSync) {
      client = config.client;
    } else {
      const path = config.client ?? ":memory:";
      client = config.databaseOptions
        ? new DatabaseSync(path, config.databaseOptions)
        : new DatabaseSync(path);
    }
  }

  // Extract sqlite options
  const sqliteOptions = {
    readBigInts: config.readBigInts,
    allowBareNamedParameters: config.allowBareNamedParameters,
    allowUnknownNamedParameters: config.allowUnknownNamedParameters,
  };

  // Create callbacks
  const callback = createCallback(client, sqliteOptions);
  const batchCallback = createBatchCallback(client, sqliteOptions);

  // Create Drizzle instance via sqlite-proxy
  // Note: Cast needed because Drizzle types don't account for `rows: undefined` on empty get()
  return proxyDrizzle<TSchema>(
    callback as unknown as AsyncRemoteCallback,
    batchCallback as unknown as AsyncBatchRemoteCallback,
    {
      schema: config.schema,
      logger: config.logger,
    },
  );
}

/** Client wrapper returned by createClient */
export interface SqliteClient {
  /** Async callback for single queries */
  run: ReturnType<typeof createCallback>;
  /** Async callback for batch queries */
  batch: ReturnType<typeof createBatchCallback>;
  /** Underlying DatabaseSync instance for direct access */
  db: DatabaseSync;
}

/**
 * Create a client wrapper with callbacks for sqlite-proxy.
 *
 * @param path - Database file path or ":memory:"
 * @param options - DatabaseSync constructor options
 * @returns Client wrapper with run, batch callbacks and db access
 *
 * @example
 * ```ts
 * const client = createClient(":memory:");
 * const db = drizzle(client.run, client.batch, { schema });
 * client.db.exec("PRAGMA journal_mode = WAL");
 * ```
 */
export function createClient(
  path: string = ":memory:",
  options?: ConstructorParameters<typeof DatabaseSync>[1],
): SqliteClient {
  const db = options !== undefined
    ? new DatabaseSync(path, options)
    : new DatabaseSync(path);

  return {
    run: createCallback(db),
    batch: createBatchCallback(db),
    db,
  };
}
