/**
 * Updates host-page text for a keyed translation after a successful apply.
 * MVP: sets textContent directly; framework/Transloco callbacks deferred.
 */
export function refreshKeyedElementText(
  key: string,
  text: string,
  selectedElement?: Element | null,
): void {
  const selector = `[data-translation-key="${CSS.escape(key)}"]`;

  const fromSelection =
    selectedElement &&
    (selectedElement.matches(selector)
      ? selectedElement
      : selectedElement.closest(selector));

  const target = fromSelection ?? document.querySelector(selector);
  if (target instanceof HTMLElement) {
    target.textContent = text;
  }
}
