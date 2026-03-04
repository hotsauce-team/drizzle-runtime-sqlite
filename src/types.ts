/**
 * TypeScript interfaces for drizzle-runtime-sqlite
 */

import type { DatabaseSync } from "node:sqlite";

/** Method types for Drizzle's SQLite proxy */
export type ProxyMethod = "run" | "all" | "get" | "values";

/** Result shape expected by Drizzle's sqlite-proxy */
export interface ProxyResult {
  rows: unknown[] | unknown[][] | undefined;
}

/** Batch query item matching Drizzle's contract */
export interface BatchItem {
  sql: string;
  params: unknown[];
  method: ProxyMethod;
}

/** Options passed to node:sqlite statement execution */
export interface SqliteOptions {
  /**
   * When true, map INTEGER columns to JS `bigint`.
   * Remember to serialize bigint in your transport if needed.
   */
  readBigInts?: boolean;

  /**
   * Allow binding named parameters without the prefix in the JS object.
   */
  allowBareNamedParameters?: boolean;

  /**
   * Ignore unknown named parameters rather than throwing.
   */
  allowUnknownNamedParameters?: boolean;
}

/** Configuration for the drizzle() function */
export interface DrizzleDenoSqliteConfig<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
> extends SqliteOptions {
  /**
   * Either a `DatabaseSync` instance or a filesystem path (`:memory:` allowed).
   * Defaults to `:memory:` if not provided.
   */
  client?: DatabaseSync | string;

  /**
   * Options passed to `new DatabaseSync(path, options)` when client is a path.
   */
  databaseOptions?: ConstructorParameters<typeof DatabaseSync>[1];

  /**
   * Drizzle schema for relational query helpers.
   */
  schema?: TSchema;

  /**
   * Enable Drizzle query logging.
   */
  logger?: boolean;
}
