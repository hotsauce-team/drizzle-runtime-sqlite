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

/**
 * Prepare SQLite params, converting binary objects to byte arrays.
 * Matches drizzle-kit's prepareSqliteParams behavior.
 */
export function prepareSqliteParams(params: unknown[]): unknown[] {
  return params.map((param) => {
    if (
      param &&
      typeof param === "object" &&
      "type" in param &&
      "value" in param &&
      (param as { type: string }).type === "binary"
    ) {
      const value = typeof (param as { value: unknown }).value === "object"
        ? JSON.stringify((param as { value: unknown }).value)
        : ((param as { value: unknown }).value as string);
      // Use TextEncoder for cross-runtime compatibility (works in Node, Deno, browsers)
      return new TextEncoder().encode(value);
    }
    return param;
  });
}

/**
 * Normalise SQLite URL for node:sqlite.
 * Handles file: URLs and plain paths.
 *
 * - `file:./relative.db` -> `./relative.db`
 * - `file:///absolute/path.db` -> `/absolute/path.db`
 * - `file://localhost/path.db` -> `/path.db`
 * - `./relative.db` -> `./relative.db` (unchanged)
 */
export function normaliseSQLiteUrl(url: string): string {
  if (!url.startsWith("file:")) {
    return url;
  }

  // Handle file:// URLs (with authority)
  if (url.startsWith("file://")) {
    try {
      const parsed = new URL(url);
      return parsed.pathname;
    } catch {
      // If URL parsing fails, strip prefix and return
      return url.slice(7);
    }
  }

  // Handle file: prefix without // (e.g., file:./db.sqlite)
  return url.slice(5);
}
