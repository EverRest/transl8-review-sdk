import { describe, expect, it } from 'vitest';
import { mountSdkRoot, Transl8SdkRoot } from './sdk-root';

describe('mountSdkRoot', () => {
  it('appends a transl8-sdk-root element to the target', () => {
    document.body.innerHTML = '';
    const root = mountSdkRoot(document.body);

    expect(root).toBeInstanceOf(Transl8SdkRoot);
    expect(document.body.querySelector('transl8-sdk-root')).toBe(root);
    expect(root.shadowRoot).not.toBeNull();
  });

  it('reuses an existing root instead of creating a second one', () => {
    document.body.innerHTML = '';
    const first = mountSdkRoot(document.body);
    const second = mountSdkRoot(document.body);

    expect(second).toBe(first);
    expect(document.body.querySelectorAll('transl8-sdk-root')).toHaveLength(1);
  });
});
