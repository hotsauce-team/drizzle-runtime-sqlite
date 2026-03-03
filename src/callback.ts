/**
 * SQLite proxy callback implementation for node:sqlite
 *
 * Clean room implementation based on Drizzle's sqlite-proxy contract.
 */

import type { DatabaseSync, StatementSync, SupportedValueType } from "node:sqlite";
import type { BatchItem, ProxyMethod, ProxyResult, SqliteOptions } from "./types.ts";

/**
 * Extended StatementSync interface for newer Node.js APIs not yet in Deno's types.
 * These APIs exist in Node 22.16+/24+.
 */
interface ExtendedStatementMethods {
  columns(): { name: string }[];
  setReturnArrays(enabled: boolean): void;
  setAllowUnknownNamedParameters(enabled: boolean): void;
}

/**
 * Cast a StatementSync to include extended methods.
 */
function asExtended(stmt: StatementSync): ExtendedStatementMethods {
  return stmt as unknown as ExtendedStatementMethods;
}

/**
 * Apply statement options from SqliteOptions to a prepared statement.
 */
function applyStatementOptions(
  stmt: StatementSync,
  options: SqliteOptions,
): void {
  if (options.readBigInts) {
    stmt.setReadBigInts(true);
  }
  if (options.allowBareNamedParameters !== undefined) {
    stmt.setAllowBareNamedParameters(options.allowBareNamedParameters);
  }
  if (options.allowUnknownNamedParameters !== undefined) {
    asExtended(stmt).setAllowUnknownNamedParameters(options.allowUnknownNamedParameters);
  }
}

/**
 * Convert an object row to an array using column order from statement metadata.
 * Note: This doesn't work correctly for joins with duplicate column names.
 */
function rowToArray(
  row: Record<string, unknown>,
  columns: { name: string }[],
): unknown[] {
  return columns.map((col) => row[col.name]);
}

/**
 * Check if the statement supports setReturnArrays (Node 22.16+/24+)
 */
function hasArrayMode(stmt: StatementSync): boolean {
  return typeof (stmt as unknown as ExtendedStatementMethods).setReturnArrays === "function";
}

/**
 * Execute a prepared statement based on the method type.
 *
 * @param stmt - Prepared statement
 * @param params - Bound parameters
 * @param method - Drizzle proxy method
 * @returns Result in sqlite-proxy expected format
 */
function executeStatement(
  stmt: StatementSync,
  params: unknown[],
  method: ProxyMethod,
): ProxyResult {
  // Try to use array mode if available (Node 22.16+/24+)
  const extStmt = asExtended(stmt);
  const useArrayMode = hasArrayMode(stmt);
  if (useArrayMode) {
    extStmt.setReturnArrays(true);
  }

  const typedParams = params as SupportedValueType[];

  switch (method) {
    case "run": {
      stmt.run(...typedParams);
      return { rows: [] };
    }
    case "get": {
      const row = stmt.get(...typedParams) as unknown[] | Record<string, unknown> | undefined;
      if (row === undefined) {
        return { rows: undefined };
      }
      if (useArrayMode) {
        // Already an array
        return { rows: row as unknown[] };
      }
      // Convert object to array using column metadata
      const columns = extStmt.columns();
      return { rows: rowToArray(row as Record<string, unknown>, columns) };
    }
    case "all":
    case "values": {
      const rows = stmt.all(...typedParams) as unknown[][] | Record<string, unknown>[];
      if (rows.length === 0) {
        return { rows: [] };
      }
      if (useArrayMode) {
        // Already arrays
        return { rows: rows as unknown[][] };
      }
      // Convert objects to arrays using column metadata
      const columns = extStmt.columns();
      return { rows: (rows as Record<string, unknown>[]).map((row) => rowToArray(row, columns)) };
    }
    default: {
      throw new Error(`Unknown method: ${method}`);
    }
  }
}

/**
 * Create an async callback function for Drizzle's sqlite-proxy.
 *
 * Note: The underlying `node:sqlite` operations are synchronous. The async
 * signature is required to match Drizzle's `AsyncRemoteCallback` interface.
 *
 * @param db - node:sqlite DatabaseSync instance
 * @param options - Statement execution options
 * @returns Async callback matching Drizzle's AsyncRemoteCallback signature
 */
export function createCallback(
  db: DatabaseSync,
  options: SqliteOptions = {},
): (
  sql: string,
  params: unknown[],
  method: ProxyMethod,
) => Promise<ProxyResult> {
  return (
    sql: string,
    params: unknown[],
    method: ProxyMethod,
  ): Promise<ProxyResult> => {
    const stmt = db.prepare(sql);
    applyStatementOptions(stmt, options);
    return Promise.resolve(executeStatement(stmt, params, method));
  };
}

/**
 * Create an async batch callback function for Drizzle's sqlite-proxy.
 *
 * Note: The underlying `node:sqlite` operations are synchronous. The async
 * signature is required to match Drizzle's `AsyncBatchRemoteCallback` interface.
 *
 * @param db - node:sqlite DatabaseSync instance
 * @param options - Statement execution options
 * @returns Async batch callback matching Drizzle's AsyncBatchRemoteCallback signature
 */
export function createBatchCallback(
  db: DatabaseSync,
  options: SqliteOptions = {},
): (batch: BatchItem[]) => Promise<ProxyResult[]> {
  return (batch: BatchItem[]): Promise<ProxyResult[]> => {
    const results: ProxyResult[] = [];

    for (const item of batch) {
      const stmt = db.prepare(item.sql);
      applyStatementOptions(stmt, options);
      results.push(executeStatement(stmt, item.params, item.method));
    }

    return Promise.resolve(results);
  };
}
