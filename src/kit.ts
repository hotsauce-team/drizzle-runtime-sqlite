/**
 * Drizzle Kit driver for node:sqlite
 *
 * Provides a drop-in replacement for better-sqlite3 in drizzle-kit's connections.
 */

import { DatabaseSync } from "node:sqlite";
import type { MigrationConfig } from "drizzle-orm/migrator";
import {
  asExtended,
  executeWithArrayMode,
  hasArrayMode,
  normaliseSQLiteUrl,
  prepareSqliteParams,
  rowToArray,
} from "./shared.ts";

/** SQLiteDB interface matching drizzle-kit's expectations */
export interface SQLiteDB {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  run: (query: string) => Promise<void>;
}

/**
 * Proxy params matching drizzle-kit's ProxyParams.
 * This is a practical subset - drizzle-kit's full type has mode/method required,
 * but SQLite proxy paths don't always provide them.
 */
export interface ProxyParams {
  sql: string;
  params?: unknown[];
  method?: "run" | "all" | "get" | "values" | "execute";
  mode?: "array" | "object";
}

/** Proxy function type matching drizzle-kit */
export type Proxy = (params: ProxyParams) => Promise<unknown[]>;

/** Transaction proxy params */
export interface TransactionQuery {
  sql: string;
  method?: "run" | "all" | "get" | "values";
}

/** Transaction proxy function type matching drizzle-kit */
export type TransactionProxy = (
  queries: TransactionQuery[],
) => Promise<(unknown[] | Error)[]>;

/** Credentials for SQLite connection */
export interface SqliteCredentials {
  url: string;
}

/** Return type of createDrizzleKitDriver */
export interface DrizzleKitDriver extends SQLiteDB {
  packageName: "node:sqlite";
  proxy: Proxy;
  transactionProxy: TransactionProxy;
  migrate: (config: MigrationConfig) => Promise<void>;
}

/**
 * Create a Drizzle Kit compatible driver using node:sqlite.
 *
 * This provides the same interface as drizzle-kit's better-sqlite3 driver,
 * allowing it to be used as a drop-in replacement.
 *
 * @param credentials - SQLite credentials with url property
 * @returns Driver object compatible with drizzle-kit
 *
 * @example
 * ```ts
 * import { createDrizzleKitDriver } from "@hotsauce/drizzle-runtime-sqlite/kit";
 *
 * const driver = await createDrizzleKitDriver({ url: "./database.db" });
 * // Use with drizzle-kit internals
 * ```
 */
export async function createDrizzleKitDriver(
  credentials: SqliteCredentials,
): Promise<DrizzleKitDriver> {
  const { drizzle } = await import("drizzle-orm/sqlite-proxy");
  const { migrate } = await import("drizzle-orm/sqlite-proxy/migrator");

  const sqlite = new DatabaseSync(normaliseSQLiteUrl(credentials.url));

  /**
   * Callback for sqlite-proxy following its expected semantics.
   * Note: This is only used internally for the migration drizzle instance.
   * Migrations use "run" method, so get/all semantics don't matter in practice,
   * but we keep them correct for safety.
   */
  const sqliteProxyCallback = (
    sql: string,
    params: unknown[],
    method: "run" | "all" | "get" | "values",
  ): { rows: unknown[] | unknown[][] | undefined } => {
    const stmt = sqlite.prepare(sql);
    return executeWithArrayMode(stmt, params, method);
  };

  // Create drizzle instance for migrations (internal use only)
  // Note: drizzle's AsyncRemoteCallback expects { rows: any[] }, but sqlite-proxy
  // semantics return undefined for get() with no row. We coerce here since
  // migrations only use "run" method which always returns { rows: [] }.
  const drzl = drizzle((sql, params, method) => {
    const result = sqliteProxyCallback(sql, params as unknown[], method);
    return Promise.resolve({
      rows: result.rows ?? [],
    });
  });

  const migrateFn = (config: MigrationConfig): Promise<void> => {
    return migrate(
      drzl,
      (queries) => {
        for (const query of queries) {
          sqliteProxyCallback(query, [], "run");
        }
        return Promise.resolve();
      },
      config,
    );
  };

  const db: SQLiteDB = {
    query: <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      const stmt = sqlite.prepare(sql);
      return Promise.resolve(
        stmt.all(...(params as Parameters<typeof stmt.all>)) as T[],
      );
    },
    run: (query: string): Promise<void> => {
      sqlite.prepare(query).run();
      return Promise.resolve();
    },
  };

  const proxy: Proxy = (params: ProxyParams): Promise<unknown[]> => {
    const preparedParams = prepareSqliteParams(params.params || []);
    const stmt = sqlite.prepare(params.sql);

    const method = params.method ?? "all";

    if (method === "values" || method === "get" || method === "all") {
      const useArrayMode = hasArrayMode(stmt);
      if (useArrayMode && params.mode === "array") {
        asExtended(stmt).setReturnArrays(true);
      }

      const rows = stmt.all(
        ...(preparedParams as Parameters<typeof stmt.all>),
      ) as unknown[][] | Record<string, unknown>[];

      if (params.mode === "array" && !useArrayMode && rows.length > 0) {
        // Fallback: convert objects to arrays using column metadata
        const columns = asExtended(stmt).columns();
        return Promise.resolve(
          (rows as Record<string, unknown>[]).map((row) =>
            rowToArray(row, columns)
          ),
        );
      }

      return Promise.resolve(rows);
    }

    stmt.run(...(preparedParams as Parameters<typeof stmt.run>));
    return Promise.resolve([]);
  };

  const transactionProxy: TransactionProxy = (
    queries: TransactionQuery[],
  ): Promise<(unknown[] | Error)[]> => {
    const results: (unknown[] | Error)[] = [];

    try {
      sqlite.exec("BEGIN");

      for (const query of queries) {
        const stmt = sqlite.prepare(query.sql);
        const method = query.method ?? "all";

        let result: unknown[] = [];
        if (method === "values" || method === "get" || method === "all") {
          result = stmt.all() as unknown[];
        } else {
          stmt.run();
        }
        results.push(result);
      }

      sqlite.exec("COMMIT");
    } catch (error) {
      try {
        sqlite.exec("ROLLBACK");
      } catch {
        // Ignore rollback errors
      }
      results.push(error as Error);
    }

    return Promise.resolve(results);
  };

  return {
    ...db,
    packageName: "node:sqlite",
    proxy,
    transactionProxy,
    migrate: migrateFn,
  };
}
