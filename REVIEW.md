# Peer Review (re-review)

Date: 2026-03-05

## Scope (current working tree changes)
Based on `git status --porcelain`:
- Modified:
  - .github/workflows/publish.yml
  - deno.jsonc
  - deno.lock
  - src/kit.ts
  - src/shared.ts
- New (untracked):
  - scripts/build-kit-string.ts

Also present locally:
- Generated output: dist/kit-string.ts (currently ignored by git via .gitignore)

## High-level summary
- Switches the “kit-string” export to point at dist/kit-string.ts and adds a build step (`deno task build:kit-string`) to generate it.
- Adds CI/publish workflow step to generate the kit-string artifact before `deno publish`.
- Refines shared `node:sqlite` array-mode logic with explicit feature detection for `columns()` and a clearer runtime error.
- Refactors the kit driver to an injectable API shape: `createNodeSqlDriver(dbPath, prepareSqliteParams)`.

## What looks good
- **Publish pipeline awareness**: adding a build step in .github/workflows/publish.yml reduces the chance of publishing with missing generated files.
- **Cleaner injection story**: moving kit-string output to dist/ and exporting `./kit-string` from there makes it clear it’s a build artifact.
- **Better runtime guards**: `hasColumns()` + explicit error in src/shared.ts is an improvement over “hope columns exists”.
- **More explicit proxy semantics**: src/kit.ts now documents how it treats `method: 'execute'` and why `get` returns arrays (drizzle-kit expectation).

## Concerns / questions

### 1) dist/kit-string.ts is required by exports but is gitignored
- .gitignore contains `dist/`, so dist/kit-string.ts won’t appear in git diffs/status and won’t be present for anyone consuming directly from the repo (or switching branches) unless they run the build.
- deno.jsonc exports `"./kit-string": "./dist/kit-string.ts"`, so consumers/imports will break if the file isn’t generated.

Mitigations you already added:
- `deno task prepublish` (task alias)
- publish workflow step that runs `deno task build:kit-string`

**Remaining risk:** Deno doesn’t automatically run a `prepublish` task as part of `deno publish`; it must be invoked explicitly (as you do in CI).

**Suggestion:** document in README “run `deno task build:kit-string` before `deno publish` locally” (or consider committing dist artifacts, if repo-consumption matters).

### 2) Bundler brittleness: good new guard, still version-sensitive
scripts/build-kit-string.ts now fails fast if `export { ... }` wasn’t stripped from the bundle output. That’s a solid improvement.

But the build still depends on an unstable Deno bundling API and output shape.

**Suggestion:** consider pinning a Deno version for publishing (or at least documenting the minimum version needed) to reduce “works on CI, fails locally” cases.

### 3) deno.lock churn
The `deno.lock` update is large due to adding bundling dependencies (JSR std + emit/cache-dir). Expected, but it does increase review noise.

You already mitigate CI drift by restoring `deno.lock` after tests in publish.yml.

**Question:** should build:kit-string be run before tests, or should its lock impacts also be normalized/controlled? (Maybe it’s fine as-is.)

### 4) Remaining semantic footgun: sqlite-proxy `get` and `rows ?? []`
The internal sqlite-proxy drizzle wrapper in src/kit.ts still coerces `rows: result.rows ?? []`.
- This is probably OK since it’s “migration-only”.
- If that internal `drzl` is ever reused for `.get()`, a missing row would be coerced from `undefined` to `[]`.

This is mostly a documentation/encapsulation concern at this point.

### 5) Proxy fallback conversion path doesn’t guard `columns()`
In src/shared.ts, fallback conversion checks `hasColumns()` before calling `columns()`.

In the drizzle-kit proxy path (inside src/kit.ts, and reflected in dist/kit-string.ts), the fallback conversion for `mode: 'array'` does:
- `const columns = asExtended(stmt).columns();` (no guard)

If `setReturnArrays` is missing and `columns()` is also missing, it will throw a less-informative error.

**Suggestion:** mirror the shared guard or reuse `hasColumns()` in the proxy fallback path too (even if only to throw the same descriptive error).

## Notes on version bump
deno.jsonc version is now 0.1.2. publish.yml verifies tags against deno.jsonc, which is a good check.

## Generated output sanity
dist/kit-string.ts:
- includes `// deno-lint-ignore-file`
- exports `drizzleKitDriverBlock: string = `...``

That’s consistent with excluding dist/ from lint/fmt and with the “injection block” purpose.

## Overall
This iteration is materially better:
- clear separation between source and generated artifacts
- CI/publish path generates required output
- improved runtime capability checks

The main decision to confirm is whether “kit-string is only for published JSR consumers” (current design) vs “kit-string should work from a fresh git checkout” (would require committing dist/ or generating in post-checkout tooling).
