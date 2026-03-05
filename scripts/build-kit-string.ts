/**
 * Build script to generate kit-string.ts from the actual kit.ts source.
 *
 * Usage: deno run --allow-read=src --allow-write=dist scripts/build-kit-string.ts
 */

const result = await Deno.bundle({
  entrypoints: ["./src/kit.ts"],
  write: false,
  minify: false,
  external: ["drizzle-orm", "drizzle-orm/*"],
});

const bundledCode = result.outputFiles![0].text();

// Remove the export statement at the end
const codeWithoutExport = bundledCode.replace(/\nexport\s*\{[^}]*\};\s*$/, "\n");

// Validate the export was stripped (fail fast if bundler output format changes)
if (codeWithoutExport.includes("export {")) {
  console.error("ERROR: Failed to strip export statement from bundle. Bundler output format may have changed.");
  Deno.exit(1);
}

// Escape backticks and ${} for template literal
const escaped = codeWithoutExport
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

// Generate .ts file with explicit type annotation
const tsOutput = `// deno-lint-ignore-file
/**
 * Drizzle Kit driver for node:sqlite as an injectable string.
 *
 * AUTO-GENERATED - DO NOT EDIT
 * Run: deno task build:kit-string
 *
 * This exports the driver code as a string that can be injected into
 * drizzle-kit's connections.ts at build time.
 */

export const drizzleKitDriverBlock: string = \`
${escaped}\`;
`;

await Deno.mkdir("dist", { recursive: true });
await Deno.writeTextFile("dist/kit-string.ts", tsOutput);
console.log("Generated dist/kit-string.ts");
