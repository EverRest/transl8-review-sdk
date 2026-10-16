/**
 * Renders the reported element to a PNG Blob. Never rejects — a
 * capture failure (cross-origin canvas taint, unsupported CSS, an element
 * that vanished mid-flow) must never block the text report from reaching
 * the admin, so every failure path resolves `undefined` instead.
 *
 * @param captureModuleUrl where to `import()` the
 * html2canvas capture chunk from at runtime (the caller builds this from its
 * own `apiBaseUrl`: `${apiBaseUrl}/sdk/bundle/capture`). Deliberately never a
 * static `import('html2canvas')` here: `scripts/build.mjs` bundles both
 * `dist/index.js` and `dist/index.global.js` to a single `outfile` per
 * format, and esbuild cannot code-split an IIFE at all, so a literal
 * specifier would still inline html2canvas into every host's download even
 * when `captureScreenshots` is off. A runtime URL esbuild can't statically
 * resolve keeps it out of both bundles instead — measured via
 * `scripts/build.mjs`'s own `dist/capture.js` entry, not assumed.
 */
/** The one export dist/capture.js's build entry (capture-entry.ts) has. */
type CaptureModule = {
  default: (
    element: HTMLElement,
    options: { logging: boolean },
  ) => Promise<HTMLCanvasElement>;
};

export async function captureElementScreenshot(
  element: HTMLElement,
  captureModuleUrl: string,
): Promise<Blob | undefined> {
  try {
    // Typed via `as` rather than a generic on import(): TS resolves a dynamic
    // import's type from the specifier's own statically-known module when
    // possible, but captureModuleUrl is a runtime string (the whole point —
    // see the doc comment above), so there's nothing for it to resolve here.
    const { default: html2canvas } = (await import(
      captureModuleUrl
    )) as CaptureModule;
    const canvas = await html2canvas(element, { logging: false });
    return await new Promise<Blob | undefined>((resolve) => {
      canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/png');
    });
  } catch (error) {
    console.error('[review-sdk] element screenshot capture failed', error);
    return undefined;
  }
}
