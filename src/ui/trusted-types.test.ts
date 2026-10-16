import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrustedHtml, TRUSTED_TYPES_POLICY_NAME } from './trusted-types';

describe('createTrustedHtml', () => {
  afterEach(() => {
    // jsdom (the test environment) has no Trusted Types support by default;
    // undo anything a test stubbed onto `window` so later tests see the
    // same clean baseline.
    delete (window as unknown as { trustedTypes?: unknown }).trustedTypes;
  });

  it('falls back to the plain string when window.trustedTypes is undefined (jsdom default)', () => {
    expect(window.trustedTypes).toBeUndefined();

    const html = '<style>:host { all: initial; }</style><slot></slot>';

    expect(() => createTrustedHtml(html)).not.toThrow();
    expect(createTrustedHtml(html)).toBe(html);
  });

  it('creates exactly one named policy and routes the string through its createHTML', () => {
    const createHTML = vi.fn((input: string) => input);
    const createPolicy = vi.fn().mockReturnValue({ createHTML });
    (window as unknown as { trustedTypes: unknown }).trustedTypes = { createPolicy };

    const html = '<div part="panel"></div>';
    const result = createTrustedHtml(html);

    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy).toHaveBeenCalledWith(
      TRUSTED_TYPES_POLICY_NAME,
      expect.objectContaining({ createHTML: expect.any(Function) }),
    );
    expect(createHTML).toHaveBeenCalledWith(html);
    expect(result).toBe(html);
  });

  it('does not call createPolicy again — and does not throw — on a second call for the same trustedTypes object', () => {
    const createHTML = vi.fn((input: string) => input);
    const createPolicy = vi.fn().mockReturnValue({ createHTML });
    (window as unknown as { trustedTypes: unknown }).trustedTypes = { createPolicy };

    createTrustedHtml('<div>first</div>');
    expect(() => createTrustedHtml('<div>second</div>')).not.toThrow();

    expect(createPolicy).toHaveBeenCalledTimes(1);
  });

  it('falls back to the plain string instead of throwing if createPolicy itself throws (e.g. duplicate policy name)', () => {
    const createPolicy = vi.fn(() => {
      throw new Error('Policy with name "transl8-review-sdk" already exists.');
    });
    (window as unknown as { trustedTypes: unknown }).trustedTypes = { createPolicy };

    const html = '<div>fallback</div>';
    expect(() => createTrustedHtml(html)).not.toThrow();
    expect(createTrustedHtml(html)).toBe(html);
  });
});
