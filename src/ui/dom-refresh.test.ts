import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { refreshKeyedElementText } from './dom-refresh';

describe('refreshKeyedElementText', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('h1');
    host.setAttribute('data-translation-key', 'hero.title');
    host.textContent = 'Hello';
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('updates textContent on [data-translation-key]', () => {
    refreshKeyedElementText('hero.title', 'Привіт!');

    expect(host.textContent).toBe('Привіт!');
  });

  it('prefers the selected element when it matches the key', () => {
    const other = document.createElement('span');
    other.setAttribute('data-translation-key', 'hero.title');
    other.textContent = 'Other';
    document.body.appendChild(other);

    refreshKeyedElementText('hero.title', 'Updated', host);

    expect(host.textContent).toBe('Updated');
    expect(other.textContent).toBe('Other');
  });

  it('resolves the selected element via closest [data-translation-key]', () => {
    const child = document.createElement('span');
    child.textContent = 'Nested';
    host.appendChild(child);

    refreshKeyedElementText('hero.title', 'Привіт!', child);

    expect(host.textContent).toBe('Привіт!');
  });

  it('falls back to querySelector when the selected element does not match the key', () => {
    const unrelated = document.createElement('p');
    unrelated.textContent = 'Unrelated';
    document.body.appendChild(unrelated);

    refreshKeyedElementText('hero.title', 'Привіт!', unrelated);

    expect(host.textContent).toBe('Привіт!');
  });

  it('no-ops when no matching element exists', () => {
    host.removeAttribute('data-translation-key');

    expect(() => refreshKeyedElementText('missing.key', 'Text')).not.toThrow();
  });
});
