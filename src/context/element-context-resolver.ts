import { SdkContext } from './types';

/**
 * SECURITY: attributes are copied by allowlist, never by exclusion.
 *
 * The SDK runs on third-party customer pages, and everything captured here is
 * shipped to transl8.ai and persisted in the audit log. Copying every attribute
 * leaked hidden CSRF tokens, prefilled `value`s, signed URL params in
 * `href`/`src`, and `data-user-id`-style identifiers. This list is exactly what
 * is needed to identify and describe a translatable element — nothing else.
 */
/** Matches the backend's per-string cap (SDK_CONTEXT_TEXT_MAX). */
const MAX_TEXT_CHARS = 500;

const ALLOWED_ATTRIBUTES: readonly string[] = [
  'data-translation-key',
  'id',
  'class',
  'aria-label',
  'title',
  'placeholder',
  'alt',
];

/**
 * Acceptance rule: "Hidden elements are not selectable." Uses computed style
 * rather than layout metrics (offsetParent/getBoundingClientRect) — those
 * require a real layout engine and are unreliable in jsdom, whereas
 * getComputedStyle on an element's own inline/matched styles works in both
 * jsdom and real browsers and is the correct check either way (this only
 * catches the element's own hidden/display/visibility, not an ancestor's —
 * good enough for the explicit-marker/fallback cases this resolver handles).
 */
export function isHidden(el: Element): boolean {
  if ((el as HTMLElement).hidden) {
    return true;
  }
  const style = getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden';
}

export interface ResolvedElementInfo {
  element: NonNullable<SdkContext['element']>;
  translation?: SdkContext['translation'];
}

/**
 * The element/translation-identification core, without requiring a `base`
 * envelope (project/locale/page/etc). Click-to-select needs exactly
 * this — which element was selected and its key/text — without yet building
 * the full `SdkContext` envelope, used elsewhere for the report/review flow.
 */
export function extractElementInfo(el: Element): ResolvedElementInfo | undefined {
  // Skip if element is inside [data-transl8-sdk]
  if (el.closest('[data-transl8-sdk]')) {
    return undefined;
  }

  // Hidden elements are not selectable/collectable.
  if (isHidden(el)) {
    return undefined;
  }

  // Read data-translation-key attribute
  const translationKey = el.getAttribute('data-translation-key') || undefined;

  // Get text content, trimmed to 500 chars
  const rawText = el.textContent?.trim() || '';
  const text =
    rawText.length > MAX_TEXT_CHARS
      ? rawText.substring(0, MAX_TEXT_CHARS)
      : rawText;

  // Build attributes from the allowlist only (see ALLOWED_ATTRIBUTES above).
  // `value`, `href`, `src`, `name`, and arbitrary `data-*` are never copied,
  // which subsumes the old password-input-specific carve-out.
  const attributes: Record<string, string> = {};
  for (const name of ALLOWED_ATTRIBUTES) {
    const value = el.getAttribute(name);
    if (value !== null) {
      // Trimmed to the same 500-char cap the backend enforces per attribute
      // value, so a long `class` (utility-CSS pages) cannot 400 the envelope.
      attributes[name] = value.slice(0, MAX_TEXT_CHARS);
    }
  }

  // Build element object
  const elementObj: SdkContext['element'] = {
    tagName: el.tagName.toLowerCase(),
  };

  if (text) {
    elementObj.text = text;
  }

  if (translationKey) {
    elementObj.translationKey = translationKey;
  }

  if (Object.keys(attributes).length > 0) {
    elementObj.attributes = attributes;
  }

  // Build translation object if translationKey is present
  let translationObj: SdkContext['translation'] | undefined;
  if (translationKey) {
    translationObj = {
      key: translationKey,
    };
    if (text) {
      translationObj.currentText = text;
    }
  }

  return {
    element: elementObj,
    ...(translationObj && { translation: translationObj }),
  };
}

export function resolveElementContext(
  el: Element,
  base: Omit<SdkContext, 'element' | 'translation'>,
): SdkContext {
  const info = extractElementInfo(el);
  if (!info) {
    return base;
  }
  return { ...base, ...info };
}
