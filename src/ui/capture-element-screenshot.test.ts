import { describe, expect, it, vi } from 'vitest';
import { captureElementScreenshot } from './capture-element-screenshot';

vi.mock('html2canvas', () => ({
  default: vi.fn(),
}));

import html2canvas from 'html2canvas';

// The function takes a runtime URL to `import()` the
// capture chunk from (see its doc comment for why: a literal
// `import('html2canvas')` would defeat the whole point by getting inlined
// into the IIFE bundle regardless). Tests point it at the bare 'html2canvas'
// specifier itself, which the mock above intercepts the same way it would
// intercept dist/capture.js's own `export { default } from 'html2canvas'` at
// build time — the real backend URL is exercised by
// sdk-bundle.controller.spec.ts and sdk-client.test.ts instead.
const TEST_CAPTURE_URL = 'html2canvas';

describe('captureElementScreenshot', () => {
  it('resolves a PNG Blob from the rendered canvas', async () => {
    const fakeBlob = new Blob(['fake'], { type: 'image/png' });
    const fakeCanvas = {
      toBlob: (cb: (blob: Blob | null) => void) => cb(fakeBlob),
    } as unknown as HTMLCanvasElement;
    vi.mocked(html2canvas).mockResolvedValue(fakeCanvas);

    const el = document.createElement('div');
    const result = await captureElementScreenshot(el, TEST_CAPTURE_URL);

    expect(result).toBe(fakeBlob);
    expect(html2canvas).toHaveBeenCalledWith(el, expect.objectContaining({ logging: false }));
  });

  it('resolves undefined instead of throwing when html2canvas rejects', async () => {
    vi.mocked(html2canvas).mockRejectedValue(new Error('tainted canvas'));

    const el = document.createElement('div');
    const result = await captureElementScreenshot(el, TEST_CAPTURE_URL);

    expect(result).toBeUndefined();
  });

  it('resolves undefined when canvas.toBlob yields null', async () => {
    const fakeCanvas = {
      toBlob: (cb: (blob: Blob | null) => void) => cb(null),
    } as unknown as HTMLCanvasElement;
    vi.mocked(html2canvas).mockResolvedValue(fakeCanvas);

    const el = document.createElement('div');
    const result = await captureElementScreenshot(el, TEST_CAPTURE_URL);

    expect(result).toBeUndefined();
  });

  it('resolves undefined instead of throwing when the capture module URL itself fails to load', async () => {
    const el = document.createElement('div');
    const result = await captureElementScreenshot(
      el,
      'https://example.com/does-not-exist.js',
    );

    expect(result).toBeUndefined();
  });
});
