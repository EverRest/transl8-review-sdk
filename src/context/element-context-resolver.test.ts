import { describe, expect, it } from 'vitest';
import { resolveElementContext, extractElementInfo } from './element-context-resolver';

const base = {
  schemaVersion: '0.1.0' as const,
  project: { id: 'p1' },
  keyEnvironment: 'live' as const,
  application: { sdkVersion: '0.0.0' },
  locale: { source: 'en', target: 'de' },
  page: { url: 'https://app.example/checkout' },
};

describe('resolveElementContext', () => {
  it('reads data-translation-key and text', () => {
    document.body.innerHTML =
      '<button data-translation-key="checkout.submit">Pay</button>';
    const el = document.querySelector('button')!;
    const ctx = resolveElementContext(el, base);
    expect(ctx.element?.translationKey).toBe('checkout.submit');
    expect(ctx.translation?.key).toBe('checkout.submit');
    expect(ctx.element?.text).toBe('Pay');
  });

  it('returns context without element when inside data-transl8-sdk', () => {
    document.body.innerHTML =
      '<div data-transl8-sdk><span>x</span></div>';
    const el = document.querySelector('span')!;
    const ctx = resolveElementContext(el, base);
    expect(ctx.element).toBeUndefined();
  });

  it('never copies the value attribute of an input — password or otherwise', () => {
    document.body.innerHTML =
      '<input type="password" value="secret123" name="pwd" class="input-pwd" />' +
      '<input type="text" value="jane@example.com" name="email" class="input-email" />';
    const [pwd, text] = Array.from(document.querySelectorAll('input'));

    expect(
      resolveElementContext(pwd, base).element?.attributes?.value,
    ).toBeUndefined();
    expect(
      resolveElementContext(text, base).element?.attributes?.value,
    ).toBeUndefined();
    // `class` is on the allowlist, so identification still works.
    expect(resolveElementContext(pwd, base).element?.attributes?.class).toBe(
      'input-pwd',
    );
  });

  it('copies only allowlisted attributes and drops everything else', () => {
    document.body.innerHTML =
      '<a data-translation-key="nav.home" id="home" class="link" aria-label="Home"' +
      ' title="Go home" href="https://app.example/x?token=sig123"' +
      ' data-user-id="u_42" data-csrf="csrf_abc" name="home-link">Home</a>';
    const el = document.querySelector('a')!;

    const attrs = resolveElementContext(el, base).element?.attributes;

    expect(attrs).toEqual({
      'data-translation-key': 'nav.home',
      id: 'home',
      class: 'link',
      'aria-label': 'Home',
      title: 'Go home',
    });
    expect(attrs?.href).toBeUndefined();
    expect(attrs?.['data-user-id']).toBeUndefined();
    expect(attrs?.['data-csrf']).toBeUndefined();
    expect(attrs?.name).toBeUndefined();
  });

  // Guard: the allowlisted attribute set is documented in the
  // SDK's context-minimization notes. If an attribute is added to
  // ALLOWED_ATTRIBUTES, update the literal list below AND those notes together
  // — this test exists so that widening what leaves the browser is a
  // deliberate, visible edit, not a silent side effect.
  it('locks the allowlisted attribute set to exactly what the context-minimization notes document', () => {
    document.body.innerHTML =
      '<a data-translation-key="k" id="i" class="c" aria-label="a" title="t"' +
      ' placeholder="p" alt="al">x</a>';
    const el = document.querySelector('a')!;

    const attrs = resolveElementContext(el, base).element?.attributes;

    expect(Object.keys(attrs ?? {}).sort()).toEqual(
      [
        'data-translation-key',
        'id',
        'class',
        'aria-label',
        'title',
        'placeholder',
        'alt',
      ].sort(),
    );
  });

  it('trims an allowlisted attribute value to the backend 500-char cap', () => {
    document.body.innerHTML = `<div class="${'c'.repeat(900)}">x</div>`;
    const el = document.querySelector('div')!;

    expect(
      resolveElementContext(el, base).element?.attributes?.class,
    ).toHaveLength(500);
  });

  it('returns context without element for a hidden ([hidden]) element', () => {
    document.body.innerHTML =
      '<span hidden data-translation-key="checkout.hidden">Hidden</span>';
    const el = document.querySelector('span')!;
    const ctx = resolveElementContext(el, base);
    expect(ctx.element).toBeUndefined();
  });

  it('returns context without element for display:none', () => {
    document.body.innerHTML =
      '<span style="display:none" data-translation-key="checkout.none">None</span>';
    const el = document.querySelector('span')!;
    const ctx = resolveElementContext(el, base);
    expect(ctx.element).toBeUndefined();
  });

  it('returns context without element for visibility:hidden', () => {
    document.body.innerHTML =
      '<span style="visibility:hidden" data-translation-key="checkout.vh">VH</span>';
    const el = document.querySelector('span')!;
    const ctx = resolveElementContext(el, base);
    expect(ctx.element).toBeUndefined();
  });

  it('still resolves a visible element (sanity check against the hidden checks above)', () => {
    document.body.innerHTML =
      '<span data-translation-key="checkout.visible">Visible</span>';
    const el = document.querySelector('span')!;
    expect(resolveElementContext(el, base).element).toBeDefined();
  });

  it('omits translation when no data-translation-key is present, keeping only read-only element.text', () => {
    document.body.innerHTML = '<p>Just some visible copy</p>';
    const el = document.querySelector('p')!;
    const ctx = resolveElementContext(el, base);
    expect(ctx.element?.text).toBe('Just some visible copy');
    expect(ctx.translation).toBeUndefined();
  });

  it('resolves an element appended to the DOM after the module has already loaded (dynamic DOM / SPA navigation)', () => {
    document.body.innerHTML = '';
    const el = document.createElement('button');
    el.setAttribute('data-translation-key', 'dynamic.added');
    el.textContent = 'Dynamically added';
    document.body.appendChild(el);

    const ctx = resolveElementContext(el, base);
    expect(ctx.element?.translationKey).toBe('dynamic.added');
  });

  it('copies placeholder and alt when present', () => {
    document.body.innerHTML =
      '<input placeholder="Your name" /><img alt="Logo" src="/secret/a.png" />';
    const input = document.querySelector('input')!;
    const img = document.querySelector('img')!;

    expect(
      resolveElementContext(input, base).element?.attributes?.placeholder,
    ).toBe('Your name');
    const imgAttrs = resolveElementContext(img, base).element?.attributes;
    expect(imgAttrs?.alt).toBe('Logo');
    expect(imgAttrs?.src).toBeUndefined();
  });
});

describe('extractElementInfo (envelope-free element/translation extraction)', () => {
  it('returns element + translation for a keyed element, without needing a base envelope', () => {
    document.body.innerHTML =
      '<button data-translation-key="checkout.submit">Pay</button>';
    const el = document.querySelector('button')!;

    const info = extractElementInfo(el);

    expect(info?.element.translationKey).toBe('checkout.submit');
    expect(info?.element.text).toBe('Pay');
    expect(info?.translation?.key).toBe('checkout.submit');
  });

  it('returns undefined for a hidden element', () => {
    document.body.innerHTML =
      '<span hidden data-translation-key="checkout.hidden">Hidden</span>';
    const el = document.querySelector('span')!;

    expect(extractElementInfo(el)).toBeUndefined();
  });

  it('returns undefined for an SDK-owned element', () => {
    document.body.innerHTML = '<div data-transl8-sdk><span>x</span></div>';
    const el = document.querySelector('span')!;

    expect(extractElementInfo(el)).toBeUndefined();
  });

  it('agrees with resolveElementContext on the element/translation it produces', () => {
    document.body.innerHTML =
      '<a data-translation-key="nav.home" id="home">Home</a>';
    const el = document.querySelector('a')!;

    const info = extractElementInfo(el);
    const ctx = resolveElementContext(el, base);

    expect(info?.element).toEqual(ctx.element);
    expect(info?.translation).toEqual(ctx.translation);
  });
});
