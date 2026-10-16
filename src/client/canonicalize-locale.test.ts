import { describe, it, expect } from 'vitest';
import { canonicalizeLocale } from './canonicalize-locale';

describe('canonicalizeLocale', () => {
  it('canonicalizes a differently-cased BCP-47 tag', () => {
    expect(canonicalizeLocale('en-us')).toBe('en-US');
  });

  it('returns the tag unchanged if already canonical', () => {
    expect(canonicalizeLocale('de-DE')).toBe('de-DE');
  });

  it('returns undefined for a non-string input', () => {
    expect(canonicalizeLocale(123)).toBeUndefined();
    expect(canonicalizeLocale(undefined)).toBeUndefined();
    expect(canonicalizeLocale(null)).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(canonicalizeLocale('')).toBeUndefined();
  });

  it('returns undefined for a malformed tag that throws in Intl', () => {
    expect(canonicalizeLocale('!!!not-a-locale!!!')).toBeUndefined();
  });
});
