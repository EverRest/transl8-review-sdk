/**
 * `locale` reaches `setLocale` either as a typed method argument or as a
 * host-supplied `CustomEvent.detail` — the latter could be anything,
 * including `undefined` or a non-string. Rather than hand-roll a BCP-47
 * parser, this defers to the platform's own: `Intl.getCanonicalLocales`
 * throws a `RangeError` on a syntactically malformed tag, and — since it's
 * already doing the parse — hands back the canonical form as a side benefit
 * (e.g. `'en-us'` -> `'en-US'`), which is stored instead of the raw input so
 * every subsequent request sends the same casing regardless of how the host
 * spelled it. Case-sensitive matching on the backend means a stray
 * `'en-us'` would otherwise 404 silently instead of finding `'en-US'`.
 * `Intl.getCanonicalLocales(undefined)` does NOT throw (the spec treats a
 * missing locale list as empty), so the empty-array result is checked too.
 * This only validates tag shape, not that the tag names a real language —
 * "xx-Yyyy-ZZ" canonicalizes and passes, which is fine: the backend is the
 * authority on which locales actually exist.
 */
export function canonicalizeLocale(locale: unknown): string | undefined {
  if (typeof locale !== 'string' || locale.length === 0) {
    return undefined;
  }
  try {
    const [canonical] = Intl.getCanonicalLocales(locale);
    return canonical;
  } catch {
    return undefined;
  }
}
