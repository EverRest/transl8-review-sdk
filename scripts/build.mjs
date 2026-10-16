// Bundles the public SDK entry point (src/index.ts) into dist/ as both an ESM
// module (for bundler / npm consumers) and an IIFE global (for a plain
// <script src> embed on a customer page).
//
// Type declarations are emitted separately via `tsc -p tsconfig.build.json`
// (see package.json "build" script) since esbuild does not type-check or
// generate .d.ts files.
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as esbuild from 'esbuild';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distDir = path.join(packageRoot, 'dist');
const entryPoint = path.join(packageRoot, 'src', 'index.ts');
const captureEntryPoint = path.join(
  packageRoot,
  'src',
  'ui',
  'capture-entry.ts',
);

async function main() {
  await rm(distDir, { recursive: true, force: true });

  // Build-time version constant, see src/client/version.ts. Read
  // from this package's own package.json rather than duplicated anywhere,
  // so a version bump is still the one line to change (this package has its
  // own semver, independent of any host product).
  const pkg = JSON.parse(
    await readFile(path.join(packageRoot, 'package.json'), 'utf8'),
  );

  const shared = {
    entryPoints: [entryPoint],
    bundle: true,
    sourcemap: true,
    define: { __SDK_VERSION__: JSON.stringify(pkg.version) },
    // This build used to ship unminified, so every host
    // page downloaded ~544 KB of source with comments and whitespace intact.
    // Nothing documented that as deliberate; it looks like an omission, and it
    // dwarfed the dependency-level tuning considered at the time.
    //
    // Safe here because nothing in this package depends on identifier names:
    // the custom-element tags are string literals, and the only `.name` reads
    // are `DOMException.name` ('AbortError' / 'TimeoutError'), which the
    // runtime sets.
    minify: true,
    target: 'es2020',
    logLevel: 'info',
  };

  // ESM build — for bundler / npm consumers (import { ReviewSdk } from '@transl8.ai/review-sdk').
  await esbuild.build({
    ...shared,
    outfile: path.join(distDir, 'index.js'),
    format: 'esm',
  });

  // IIFE global build — for a plain <script src> embed on a customer page.
  await esbuild.build({
    ...shared,
    // The host that self-hosts the bundle serves only
    // index.global.js, with no route for index.global.js.map. A `sourceMappingURL`
    // comment pointing at a file nobody can fetch is a false promise, not a
    // degraded one: the browser resolves it to a 404.
    //
    // `'external'` writes index.global.js.map to disk without adding that
    // comment to the bundle, so the check above keeps passing. CI uploads
    // the map as a version-named artifact for offline symbolication; it must
    // never be copied to the host that self-hosts the bundle.
    sourcemap: 'external',
    outfile: path.join(distDir, 'index.global.js'),
    format: 'iife',
    globalName: 'Transl8ReviewSdk',
  });

  // The html2canvas dependency is split into its own artifact. Loaded at
  // runtime via `import(url)` from capture-element-screenshot.ts, never a
  // static `import('html2canvas')` in the two builds above — see
  // capture-entry.ts's doc comment for why a real second file is the only
  // way to keep it out of dist/index.global.js.
  await esbuild.build({
    ...shared,
    entryPoints: [captureEntryPoint],
    outfile: path.join(distDir, 'capture.js'),
    format: 'esm',
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
