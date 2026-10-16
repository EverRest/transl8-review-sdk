/**
 * Dialog behaviour shared by every SDK panel: focus in on open, focus back
 * to the opener on close, Escape to dismiss.
 *
 * Deliberately not a full focus trap. The SDK renders inside a host page it
 * does not own; stealing Tab from the host is more hostile than letting
 * focus leave a non-modal inspector. What matters is that keyboard users can
 * reach the panel and get out of it.
 */
/**
 * The element that actually has focus, not the one the document reports.
 *
 * `document.activeElement` retargets a focused node inside a shadow root to
 * that root's HOST — so every opener this SDK has resolves to a custom
 * element with no tabindex, whose `.focus()` is a silent no-op and whose
 * focus therefore never comes back. Every opener the panels have is inside
 * a shadow root: the review-mode badge lives in
 * `transl8-review-mode-badges`'s, and the Ask AI / Report buttons live in
 * the inspector's. Walking `shadowRoot.activeElement` down the chain
 * recovers the real element, and fixes all three call sites at once rather
 * than plumbing an opener argument through the tracker, the client and
 * three `show()` signatures.
 */
function focusedElement(): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement as HTMLElement;
  }
  return el;
}

export function trapPanelFocus(panel: HTMLElement, onDismiss: () => void): () => void {
  const opener = focusedElement();

  if (!panel.hasAttribute('tabindex')) {
    panel.setAttribute('tabindex', '-1');
  }
  panel.focus({ preventScroll: true });

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onDismiss();
    }
  };
  panel.addEventListener('keydown', onKeydown);

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    panel.removeEventListener('keydown', onKeydown);
    if (opener && opener.isConnected && typeof opener.focus === 'function') {
      opener.focus({ preventScroll: true });
    }
  };
}
