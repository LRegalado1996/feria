/**
 * The main action of a screen whose "add" form is a card on the page
 * (FER-040): the card comes into view, clear of the sticky top bar (its
 * `scroll-margin-top`), and focus goes to its first field, so the keyboard
 * opens on a phone. Run from the top bar, or the bar under a phone's thumb.
 */
export function focusFirstField(container: HTMLElement | null): void {
  if (!container) {
    return;
  }

  container.scrollIntoView({ block: "start" });
  // Already in view: a second scroll would only fight the first.
  container.querySelector("input")?.focus({ preventScroll: true });
}
