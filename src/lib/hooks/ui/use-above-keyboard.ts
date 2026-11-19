import { useEffect, useState } from "react";

/** The CSS variable that carries how far the keyboard reaches into the bar. */
const KEYBOARD_INSET_VARIABLE = "--keyboard-inset";

/** Room kept between a focused field and the top of the bar. */
const FIELD_GAP_PX = 8;

// Pinch zoom shrinks the visual viewport too, with no keyboard at all: the bar
// then stays where the layout puts it, as it always did.
const SCALE_TOLERANCE = 0.01;

/** Where the visible part of the page ends, against the layout viewport. */
function visibleBottom(viewport: VisualViewport) {
  // A rubber-band scroll can pull the top above zero for a moment.
  return Math.max(0, viewport.offsetTop) + viewport.height;
}

/**
 * Follows the keyboard with one element fixed to the bottom of the layout
 * viewport, and keeps the focused element above it; answers the cleanup.
 */
function followKeyboard(element: HTMLElement, viewport: VisualViewport) {
  let frame: number | null = null;
  let inset = 0;
  // Only when the keyboard comes or focus moves, never on a scroll: a field
  // the user scrolled under the bar on purpose stays there.
  let revealPending = false;

  function measure(bar: DOMRect) {
    if (Math.abs(viewport.scale - 1) > SCALE_TOLERANCE) {
      return 0;
    }

    // The element's own edge, without the shift this hook gave it, is the
    // bottom of the layout viewport. Where the layout viewport already shrank
    // for the keyboard (Android's `resizes-content`) it meets the visible
    // bottom and nothing moves; where it did not (Safari on iOS), the gap
    // between them is the keyboard. Where the element is not fixed to the
    // bottom (the top bar from `md` up) its edge sits above the visible
    // bottom, which is no keyboard either.
    return Math.max(
      0,
      Math.round(bar.bottom + inset - visibleBottom(viewport))
    );
  }

  // How far the page must scroll for the bar, once it ends where the visible
  // part does, to leave the focused element uncovered; never so far that the
  // element's top leaves the visible part.
  function revealDistance(barHeight: number) {
    const focused = document.activeElement;

    // With nothing focused the active element is the body, whose top is never
    // below the visible top, so it scrolls nothing.
    if (!(focused instanceof HTMLElement) || element.contains(focused)) {
      return 0;
    }

    const field = focused.getBoundingClientRect();
    const barTop = visibleBottom(viewport) - barHeight;

    return Math.min(
      field.bottom + FIELD_GAP_PX - barTop,
      field.top - Math.max(0, viewport.offsetTop)
    );
  }

  function update() {
    frame = null;
    // Every read before any write, so the frame lays the page out once.
    const bar = element.getBoundingClientRect();
    const next = measure(bar);
    const distance = revealPending && next > 0 ? revealDistance(bar.height) : 0;
    revealPending = false;

    if (next !== inset) {
      inset = next;
      element.style.setProperty(KEYBOARD_INSET_VARIABLE, `${inset}px`);

      // Riding above the keyboard is styled through this attribute; hiding
      // the bar while typing instead would only change the CSS it selects.
      if (inset > 0) {
        element.dataset.keyboard = "open";
      } else {
        delete element.dataset.keyboard;
      }
    }

    if (distance > 0) {
      window.scrollBy({ top: distance });
    }
  }

  // Several events in one frame cost one measurement and one write.
  function schedule() {
    frame ??= window.requestAnimationFrame(update);
  }

  function scheduleReveal() {
    revealPending = true;
    schedule();
  }

  viewport.addEventListener("resize", scheduleReveal);
  viewport.addEventListener("scroll", schedule);
  document.addEventListener("focusin", scheduleReveal);
  schedule();

  return () => {
    viewport.removeEventListener("resize", scheduleReveal);
    viewport.removeEventListener("scroll", schedule);
    document.removeEventListener("focusin", scheduleReveal);

    if (frame !== null) {
      window.cancelAnimationFrame(frame);
    }

    element.style.removeProperty(KEYBOARD_INSET_VARIABLE);
    delete element.dataset.keyboard;
  };
}

/**
 * Returns a callback ref for a bar fixed along the bottom of a phone's screen
 * that must stay above the on-screen keyboard (FER-053).
 *
 * Safari on iOS keeps the layout viewport's height when the keyboard opens
 * and ignores `interactiveWidget: "resizes-content"`, so a bar fixed to its
 * bottom ends up under the keyboard. The visual viewport (`height`,
 * `offsetTop`) is what is still visible: the hook writes how far the keyboard
 * reaches above the bar's bottom into `--keyboard-inset` on the element, with
 * `data-keyboard="open"` while it is more than zero, once per animation frame
 * on the visual viewport's `resize` and `scroll`, and scrolls the focused
 * field out from under the bar when the keyboard comes or focus moves. The
 * element's CSS does the moving (a transform, no layout).
 *
 * Nothing changes where the layout viewport already shrank (Chrome on Android
 * with `resizes-content`), on a computer, under pinch zoom, without
 * `visualViewport`, or in the server render: the element gets no variable and
 * no attribute until a keyboard covers it.
 */
export function useAboveKeyboard<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!element || !viewport) {
      return undefined;
    }

    return followKeyboard(element, viewport);
  }, [element]);

  return setElement;
}
