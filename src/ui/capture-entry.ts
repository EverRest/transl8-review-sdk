/**
 * Entry point, built by scripts/build.mjs into its own dist/capture.js
 * (never into dist/index.js or dist/index.global.js) and served by the
 * backend at GET /sdk/bundle/capture. capture-element-screenshot.ts loads it
 * via a runtime `import(url)` — never a static `import('html2canvas')` — so
 * html2canvas's bytes ship only to a host page that actually captures a
 * screenshot, regardless of which of the two dist/ artifacts loaded the rest
 * of the SDK (esbuild cannot code-split the IIFE build, so a real second
 * artifact is the only way to split it out of that one).
 */
export { default } from 'html2canvas';
