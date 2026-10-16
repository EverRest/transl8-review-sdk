import { createTrustedHtml } from './trusted-types';

/**
 * Single stable Shadow DOM mount point for all SDK UI. Other SDK UI
 * pieces (hover overlay, inspector, report form) attach as light-DOM
 * children projected through this element's <slot>, so there is exactly
 * one thing injected into the host page regardless of how many SDK UI
 * pieces exist.
 */
export class Transl8SdkRoot extends HTMLElement {
  connectedCallback(): void {
    if (this.shadowRoot) {
      return;
    }
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = createTrustedHtml(
      '<style>:host { all: initial; }</style><slot></slot>',
    );
  }
}

customElements.define('transl8-sdk-root', Transl8SdkRoot);

export function mountSdkRoot(target: HTMLElement): Transl8SdkRoot {
  const existing = target.querySelector('transl8-sdk-root');
  if (existing instanceof Transl8SdkRoot) {
    return existing;
  }
  const root = document.createElement('transl8-sdk-root') as Transl8SdkRoot;
  target.appendChild(root);
  return root;
}
