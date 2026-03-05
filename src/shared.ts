/**
 * Shared utilities for node:sqlite operations
 *
 * Common code used by both callback.ts (drizzle-orm) and kit.ts (drizzle-kit).
 */

import type { StatementSync } from "node:sqlite";

/**
 * Extended StatementSync interface for newer Node.js APIs.
 * These APIs exist in Node 22.16+/24+ and Deno 2.7+.
 */
export interface ExtendedStatementMethods {
  columns(): { name: string }[];
  setReturnArrays(enabled: boolean): void;
  setAllowUnknownNamedParameters(enabled: boolean): void;
}

/**
 * Cast a StatementSync to include extended methods.
 */
export function asExtended(stmt: StatementSync): ExtendedStatementMethods {
  return stmt as unknown as ExtendedStatementMethods;
}

/**
 * Check if the statement supports setReturnArrays (Node 22.16+/24+, Deno 2.7+)
 */
export function hasArrayMode(stmt: StatementSync): boolean {
  return typeof (stmt as unknown as ExtendedStatementMethods)
    .setReturnArrays ===
    "function";
}

/**
 * Check if the statement supports columns() metadata (Node 22.5.0+, Deno 2.6+)
 */
export function hasColumns(stmt: StatementSync): boolean {
  return typeof (stmt as unknown as ExtendedStatementMethods).columns ===
    "function";
}

/**
 * Convert an object row to an array using column order from statement metadata.
 * Note: This doesn't work correctly for joins with duplicate column names.
 */
export function rowToArray(
  row: Record<string, unknown>,
  columns: { name: string }[],
): unknown[] {
  return columns.map((col) => row[col.name]);
}

/**
 * Execute a statement and return results as arrays.
 * Handles the complexity of runtime detection and fallback conversion.
 *
 * @param stmt - Prepared statement
 * @param params - Parameters to bind
 * @param method - Query method type
 * @returns Results with rows as arrays
 */
export function executeWithArrayMode(
  stmt: StatementSync,
  params: unknown[],
  method: "run" | "all" | "get" | "values",
): { rows: unknown[] | unknown[][] | undefined } {
  const extStmt = asExtended(stmt);
  const useArrayMode = hasArrayMode(stmt);

  if (useArrayMode) {
    extStmt.setReturnArrays(true);
  }

  switch (method) {
    case "run": {
      stmt.run(...(params as Parameters<typeof stmt.run>));
      return { rows: [] };
    }
    case "get": {
      const row = stmt.get(...(params as Parameters<typeof stmt.get>)) as
        | unknown[]
        | Record<string, unknown>
        | undefined;
      if (row === undefined) {
        return { rows: undefined };
      }
      if (useArrayMode) {
        return { rows: row as unknown[] };
      }
      // Fallback: convert object row to array using column metadata
      if (!hasColumns(stmt)) {
        throw new Error(
          "node:sqlite stmt.columns() not available. Requires Node.js 22.5.0+ or Deno 2.6+.",
        );
      }
      const columns = extStmt.columns();
      return { rows: rowToArray(row as Record<string, unknown>, columns) };
    }
    case "all":
    case "values": {
      const rows = stmt.all(...(params as Parameters<typeof stmt.all>)) as
        | unknown[][]
        | Record<string, unknown>[];
      if (rows.length === 0) {
        return { rows: [] };
      }
      if (useArrayMode) {
        return { rows: rows as unknown[][] };
      }
      // Fallback: convert object rows to arrays using column metadata
      if (!hasColumns(stmt)) {
        throw new Error(
          "node:sqlite stmt.columns() not available. Requires Node.js 22.5.0+ or Deno 2.6+.",
        );
      }
      const columns = extStmt.columns();
      return {
        rows: (rows as Record<string, unknown>[]).map((row) =>
          rowToArray(row, columns)
        ),
      };
    }
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}
