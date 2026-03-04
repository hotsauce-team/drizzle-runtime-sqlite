/**
 * SQLite proxy callback implementation for node:sqlite
 *
 * Clean room implementation based on Drizzle's sqlite-proxy contract.
 */

import type {
  DatabaseSync,
  StatementSync,
  SupportedValueType,
} from "node:sqlite";
import type {
  BatchItem,
  ProxyMethod,
  ProxyResult,
  SqliteOptions,
} from "./types.ts";
import { asExtended, executeWithArrayMode } from "./shared.ts";

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
    asExtended(stmt).setAllowUnknownNamedParameters(
      options.allowUnknownNamedParameters,
    );
  }
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
  const typedParams = params as SupportedValueType[];
  return executeWithArrayMode(stmt, typedParams, method) as ProxyResult;
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
