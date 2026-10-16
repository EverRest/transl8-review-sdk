/**
 * Trusted Types compatibility.
 *
 * All 6 `innerHTML` assignments in `src/ui/` are hardcoded, static template
 * strings (a `<style>` block plus fixed skeleton markup); the only
 * interpolated values are code-controlled constants (`INTENT_CHIPS`,
 * `SDK_REVIEW_ISSUE_TYPES`, and the `icon()` markup from `tokens.ts`),
 * never AI output, translation content, or user
 * input (verified file by file). A host that enforces
 * `Content-Security-Policy: require-trusted-types-for 'script'` still
 * rejects a plain string assigned to `.innerHTML`, though, so every one of
 * those assignments would throw a `TypeError` in `connectedCallback()` the
 * instant it runs.
 *
 * This helper registers one identity Trusted Types policy — `createHTML`
 * returns its input unchanged — purely to satisfy that browser-level
 * structural requirement. It is not a sanitizer: since nothing routed
 * through it is untrusted, there is nothing to sanitize. On a host with no
 * Trusted Types support (`window.trustedTypes` undefined — true for most
 * browsers, and for any host without that CSP directive), it degrades to
 * returning the plain string, never throwing.
 */

/**
 * TypeScript's bundled `lib.dom.d.ts` does not model the Trusted Types API,
 * so this declares just the shape used here.
 * See https://www.w3.org/TR/trusted-types/.
 */
interface TrustedTypePolicyOptionsLike {
  createHTML?: (input: string) => string;
}

interface TrustedTypePolicyLike {
  createHTML(input: string): unknown;
}

interface TrustedTypePolicyFactoryLike {
  createPolicy(name: string, rules: TrustedTypePolicyOptionsLike): TrustedTypePolicyLike;
}

declare global {
  interface Window {
    trustedTypes?: TrustedTypePolicyFactoryLike;
  }
}

export const TRUSTED_TYPES_POLICY_NAME = 'transl8-review-sdk';

// Keyed by the `trustedTypes` factory object itself (a page-wide singleton)
// rather than a module-level variable, so repeated calls against the same
// factory never call `createPolicy()` twice for the same name — the
// Trusted Types spec throws on that — while still letting each isolated
// test provide its own mock factory without cross-test leakage.
const policyCache = new WeakMap<TrustedTypePolicyFactoryLike, TrustedTypePolicyLike | null>();

function getPolicy(): TrustedTypePolicyLike | null {
  const trustedTypes = typeof window !== 'undefined' ? window.trustedTypes : undefined;
  if (!trustedTypes) {
    return null;
  }
  const cached = policyCache.get(trustedTypes);
  if (cached !== undefined) {
    return cached;
  }
  let policy: TrustedTypePolicyLike | null;
  try {
    policy = trustedTypes.createPolicy(TRUSTED_TYPES_POLICY_NAME, {
      createHTML: (input: string) => input,
    });
  } catch {
    // createPolicy() throws if a policy with this name is already
    // registered, or if the host's `trusted-types` CSP directive doesn't
    // allow it. Either way, fail open to the plain string rather than
    // crashing the SDK's connectedCallback().
    policy = null;
  }
  policyCache.set(trustedTypes, policy);
  return policy;
}

/**
 * Returns a value safe to assign to `.innerHTML` under a host CSP with
 * `require-trusted-types-for 'script'`. Falls back to `html` unchanged when
 * Trusted Types isn't available or policy creation fails — never throws.
 */
export function createTrustedHtml(html: string): string {
  const policy = getPolicy();
  if (!policy) {
    return html;
  }
  return policy.createHTML(html) as string;
}
