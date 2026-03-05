## Export kit driver as injectable string for drizzle-kit

### Summary

Adds a `./kit-string` export containing the bundled driver code as a string. This enables drizzle-kit to inject the `node:sqlite` driver without adding a runtime dependency.

### Changes

**API Refactoring**
- Move kit-only functions (`prepareSqliteParams`, `normaliseSQLiteUrl`) from `shared.ts` to `kit.ts`
- Simplify driver API: `createNodeSqlDriver(dbPath, prepareSqliteParams)` — caller provides the param preparation function

**New Export**
- `./kit-string` exports `drizzleKitDriverBlock: string` containing the bundled driver code
- Generated via `deno task build:kit-string` using `Deno.bundle`
- Output goes to `dist/kit-string.ts` (gitignored, generated at publish time)

**CI/Publishing**
- Added `build:kit-string` step to publish workflow
- Validates export statement is stripped (fails fast if bundler output format changes)

**Improved Error Handling**
- Add `hasColumns()` guard in proxy fallback path with descriptive error message
- Consistent error handling between shared and kit code paths

### Usage in drizzle-kit

```ts
import { drizzleKitDriverBlock } from "@hotsauce/drizzle-runtime-sqlite/kit-string";

// Inject into connections.ts at build time
const nodeSqliteDriver = new Function(drizzleKitDriverBlock + "; return createNodeSqlDriver;")();
```

### Testing

- All 133 tests pass (Deno 2.7)
- Build script validated
