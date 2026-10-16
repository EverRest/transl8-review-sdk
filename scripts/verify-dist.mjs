#!/usr/bin/env node
/**
 * Smoke-checks the built dist/ artifact.
 *
 * A passing `npm run build` proves esbuild/tsc ran without error; it does
 * not prove the output is actually importable or exposes the expected
 * public API. This script closes that gap by import()-ing the real built
 * dist/index.js (not the TS source) in Node and asserting ReviewSdk comes
 * through as a class/function.
 *
 * The SDK is a browser package (src/ui/sdk-root.ts defines a custom element
 * — `class Transl8SdkRoot extends HTMLElement` — evaluated at module load),
 * so it needs DOM globals to import at all, same as the existing test suite
 * (vitest.config.ts uses `environment: 'jsdom'`). This script installs the
 * same jsdom globals before importing, so it exercises the real dist output
 * rather than re-testing the TS source.
 *
 * Usage: node scripts/verify-dist.mjs   (run after `npm run build`)
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const DIST_ENTRY = join(PACKAGE_ROOT, 'dist', 'index.js');

if (!existsSync(DIST_ENTRY)) {
  console.error(
    `dist/index.js not found at ${DIST_ENTRY} — run "npm run build" first.`,
  );
  process.exit(1);
}

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
for (const key of ['window', 'document', 'HTMLElement', 'customElements', 'navigator']) {
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    writable: true,
    configurable: true,
  });
}
// jsdom has no EventSource — same workaround as src/test-setup.ts.
if (typeof globalThis.EventSource === 'undefined') {
  globalThis.EventSource = class NoopEventSource {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
    }
    close() {
      this.readyState = 2;
    }
  };
}

const mod = await import(pathToFileURL(DIST_ENTRY).href);

const checks = [
  ['ReviewSdk exported from dist/index.js', typeof mod.ReviewSdk === 'function'],
  [
    'resolveElementContext exported from dist/index.js',
    typeof mod.resolveElementContext === 'function',
  ],
  [
    'ApplyTranslationConflictError exported from dist/index.js',
    typeof mod.ApplyTranslationConflictError === 'function',
  ],
  [
    // This export was declared and thrown internally but never
    // re-exported from the package root, so a host's documented
    // `error instanceof SdkSessionExpiredError` branch could never match.
    'SdkSessionExpiredError exported from dist/index.js',
    typeof mod.SdkSessionExpiredError === 'function',
  ],
];

// The build is minified now, so "the export exists" is
// too weak a check: identifier mangling would not break `typeof x === 'function'`
// on any of the above. These two do exercise it.
//
// Custom elements are registered as a side effect of evaluating the UI modules,
// under string tag names that minification must leave alone. If mangling or
// tree-shaking ever dropped one of those modules, the SDK would load and then
// render nothing — silently.
for (const tag of [
  'transl8-sdk-root',
  'transl8-launcher',
  'transl8-report-form',
  'transl8-inspector-panel',
]) {
  checks.push([`custom element <${tag}> registered`, Boolean(customElements.get(tag))]);
}

// And the IIFE build, which is what a host page actually loads via <script src>
// — verify-dist checked only the ESM entry, so the artifact in the quickstart
// was never verified at all.
const globalBundle = join(PACKAGE_ROOT, 'dist', 'index.global.js');
if (!existsSync(globalBundle)) {
  console.error(`dist/index.global.js not found at ${globalBundle}`);
  process.exit(1);
}
// Loaded through a real <script> element rather than window.eval: the bundle
// opens with "use strict", and a strict-mode eval keeps its `var` bindings in
// its own scope, so eval would report a failure the browser never sees. This is
// how a host page loads it.
const iifeDom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  runScripts: 'dangerously',
});
iifeDom.window.EventSource = globalThis.EventSource;
const scriptEl = iifeDom.window.document.createElement('script');
scriptEl.textContent = readFileSync(globalBundle, 'utf8');
iifeDom.window.document.body.appendChild(scriptEl);
checks.push([
  'IIFE build defines the Transl8ReviewSdk global',
  typeof iifeDom.window.Transl8ReviewSdk?.ReviewSdk === 'function',
]);

// The host that self-hosts the bundle serves only index.global.js, with no
// route for a .map beside it. A sourceMappingURL comment here would resolve to a 404
// on a customer page; this bundle must not advertise a map it cannot serve.
checks.push([
  'IIFE build does not advertise an unservable sourcemap',
  !readFileSync(globalBundle, 'utf8').includes('sourceMappingURL'),
]);

// The map is still
// written to disk (esbuild's `sourcemap: 'external'`, not `false`), just not
// referenced by the bundle above. CI uploads this file as a version-named
// artifact; it must never be copied to the host that self-hosts the bundle.
checks.push([
  'IIFE build writes an external sourcemap file (for the CI artifact, not served)',
  existsSync(join(PACKAGE_ROOT, 'dist', 'index.global.js.map')),
]);

const failed = checks.filter(([, ok]) => !ok);

for (const [name, ok] of checks) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
}

if (failed.length > 0) {
  console.error(
    `\nBuilt artifacts failed verification: ${failed.map(([name]) => name).join(', ')}`,
  );
  process.exit(1);
}

console.log('\nBuilt artifacts verified: ESM exports, custom elements, IIFE global.');
