import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { required } from "@/test/required";

import { useAboveKeyboard } from "./use-above-keyboard";

/** A phone's screen in CSS pixels, and the bar along its bottom. */
const SCREEN_HEIGHT = 800;
const BAR_HEIGHT = 72;

/** The visual viewport a browser exposes: what is still visible. */
class FakeVisualViewport extends EventTarget {
  height = SCREEN_HEIGHT;
  offsetTop = 0;
  scale = 1;

  move(changes: Partial<Pick<this, "height" | "offsetTop" | "scale">>) {
    Object.assign(this, changes);
  }
}

function Bar() {
  const ref = useAboveKeyboard<HTMLDivElement>();

  return <div data-testid="bar" ref={ref} />;
}

/**
 * Renders the bar over a page with one field, the browser around them played
 * by hand: frames run when `flushFrame()` says so, the page scrolls through
 * `window.scrollBy`, and the bar is laid out as the admin's CSS lays it out,
 * its bottom at the layout viewport's (`layout.height`), moved up by
 * `--keyboard-inset` while `data-keyboard="open"`.
 */
function setup({
  barBottom,
  field = { bottom: 300, top: 260 },
  inDialog,
  visualViewport = true,
}: {
  /** The field sits in a dialog of this role, over the page and its bar. */
  inDialog?: "alertdialog" | "dialog";
  /** Where the bar's bottom sits when it is not fixed to the screen's. */
  barBottom?: number;
  field?: { bottom: number; top: number };
  visualViewport?: boolean;
} = {}) {
  const viewport = new FakeVisualViewport();
  // The window's width against `md`, as the hook asks the browser.
  const width = { wide: false };
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === "(min-width: 48rem)" && width.wide;
        },
        media: query,
      }) as unknown as MediaQueryList
  );
  const layout = { height: SCREEN_HEIGHT, scrollY: 0 };
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;

  vi.stubGlobal("visualViewport", visualViewport ? viewport : undefined);
  const requestFrame = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      const id = nextFrame;
      nextFrame += 1;
      frames.set(id, callback);
      return id;
    });
  const cancelFrame = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation((id) => {
      frames.delete(id);
    });
  const scrollBy = vi
    .spyOn(window, "scrollBy")
    .mockImplementation((options?: ScrollToOptions | number) => {
      if (typeof options === "object") {
        layout.scrollY += options.top ?? 0;
      }
    });
  const addListener = vi.spyOn(viewport, "addEventListener");

  const input = document.createElement("input");
  vi.spyOn(input, "getBoundingClientRect").mockImplementation(
    () =>
      new DOMRect(0, field.top - layout.scrollY, 300, field.bottom - field.top)
  );
  if (inDialog) {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", inDialog);
    dialog.append(input);
    document.body.append(dialog);
  } else {
    document.body.append(input);
  }

  const view = render(<Bar />);
  const bar = view.getByTestId("bar");
  vi.spyOn(bar, "getBoundingClientRect").mockImplementation(() => {
    const shift =
      bar.dataset.keyboard === "open"
        ? Number(
            bar.style.getPropertyValue("--keyboard-inset").replace("px", "")
          )
        : 0;
    const bottom = (barBottom ?? layout.height) - shift;

    return new DOMRect(0, bottom - BAR_HEIGHT, 390, BAR_HEIGHT);
  });

  function flushFrame() {
    const pending = [...frames.values()];
    frames.clear();
    for (const runFrame of pending) {
      runFrame(0);
    }
  }

  return {
    addListener,
    width,
    bar,
    cancelFrame,
    /** The bar's state as the page's CSS reads it. */
    barState: () => ({
      inset: bar.style.getPropertyValue("--keyboard-inset"),
      keyboard: bar.dataset.keyboard,
    }),
    focusField: () => {
      act(() => {
        input.focus();
      });
    },
    frames,
    flushFrame,
    input,
    layout,
    requestFrame,
    scrollBy,
    /** The visual viewport changes, then tells its listeners. */
    viewportChanges: (
      event: "resize" | "scroll",
      changes: Parameters<FakeVisualViewport["move"]>[0]
    ) => {
      viewport.move(changes);
      viewport.dispatchEvent(new Event(event));
    },
    view,
  };
}

const CLOSED = { inset: "", keyboard: undefined };

afterEach(() => {
  vi.restoreAllMocks();
  // The field each setup() adds to the page, outside Testing Library's root.
  for (const added of document.body.querySelectorAll(
    "body > input, body > [role]"
  )) {
    added.remove();
  }
});

describe("useAboveKeyboard", () => {
  test("leaves the bar alone in the server's markup", () => {
    expect(renderToString(<Bar />)).toBe('<div data-testid="bar"></div>');
  });

  test("leaves the bar where it is while no keyboard is open", () => {
    const { barState, flushFrame, scrollBy } = setup();

    flushFrame();

    expect(barState()).toEqual(CLOSED);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  test("rides the bar above an iPhone's keyboard, follows the visible part as it scrolls, and comes back down when the keyboard closes", () => {
    const { barState, flushFrame, viewportChanges } = setup();
    flushFrame();

    // The layout viewport keeps its 800 px; 500 of them are still visible.
    viewportChanges("resize", { height: 500 });
    flushFrame();
    expect(barState()).toEqual({ inset: "300px", keyboard: "open" });

    viewportChanges("scroll", { offsetTop: 120 });
    flushFrame();
    expect(barState()).toEqual({ inset: "180px", keyboard: "open" });

    viewportChanges("resize", { height: SCREEN_HEIGHT, offsetTop: 0 });
    flushFrame();
    expect(barState()).toEqual({ inset: "0px", keyboard: undefined });
  });

  test.each([
    ["1 px of keyboard", 799, { inset: "1px", keyboard: "open" }],
    // Browsers report fractions; the bar moves by whole pixels.
    ["300.4 px of keyboard", 499.6, { inset: "300px", keyboard: "open" }],
    ["no keyboard", SCREEN_HEIGHT, CLOSED],
  ])("moves the bar for %s", (_case, height, expected) => {
    const { barState, flushFrame, viewportChanges } = setup();

    viewportChanges("resize", { height });
    flushFrame();

    expect(barState()).toEqual(expected);
  });

  test("does not move the bar again where the layout viewport already shrank for the keyboard (Android's resizes-content)", () => {
    const { barState, flushFrame, layout, viewportChanges } = setup();

    layout.height = 500;
    viewportChanges("resize", { height: 500 });
    flushFrame();

    expect(barState()).toEqual(CLOSED);
  });

  test("leaves the bar where it is under pinch zoom, which shrinks the visible part with no keyboard", () => {
    const { barState, flushFrame, viewportChanges } = setup();

    viewportChanges("resize", { height: 400, scale: 2 });
    flushFrame();

    expect(barState()).toEqual(CLOSED);
  });

  test("leaves the bar where it is while a rubber-band scroll pulls the page down", () => {
    const { barState, flushFrame, viewportChanges } = setup();

    viewportChanges("scroll", { offsetTop: -40 });
    flushFrame();

    expect(barState()).toEqual(CLOSED);
  });

  test("leaves a bar that is not along the screen's bottom where it is (the top bar from md up)", () => {
    const { barState, flushFrame, viewportChanges } = setup({ barBottom: 64 });

    viewportChanges("resize", { height: 500 });
    flushFrame();

    expect(barState()).toEqual(CLOSED);
  });

  test("lets go of the keyboard once the window crosses md, where the action moves to the top bar", () => {
    const {
      barState,
      flushFrame,
      focusField,
      scrollBy,
      viewportChanges,
      width,
    } = setup({ field: { bottom: 480, top: 440 } });
    viewportChanges("resize", { height: 500 });
    flushFrame();
    expect(barState()).toEqual({ inset: "300px", keyboard: "open" });
    scrollBy.mockClear();

    width.wide = true;
    viewportChanges("resize", { height: 500 });
    flushFrame();
    focusField();
    flushFrame();

    expect(barState()).toEqual({ inset: "0px", keyboard: undefined });
    expect(scrollBy).not.toHaveBeenCalled();
  });

  test("does nothing where the browser has no visualViewport", () => {
    const { barState, frames, requestFrame } = setup({
      visualViewport: false,
    });

    expect(requestFrame).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(barState()).toEqual(CLOSED);
  });

  test("measures once per frame, however many events arrive in it", () => {
    const { barState, flushFrame, frames, viewportChanges } = setup();
    flushFrame();

    viewportChanges("resize", { height: 600 });
    viewportChanges("scroll", { offsetTop: 10 });
    viewportChanges("resize", { height: 500 });

    expect(frames.size).toBe(1);
    flushFrame();
    expect(barState()).toEqual({ inset: "290px", keyboard: "open" });
  });

  test.each([
    // The bar's top is at 500 - 72 = 428 once it rides the keyboard; the
    // field keeps 8 px of room above it.
    ["covered by the bar", { bottom: 480, top: 440 }, [[{ top: 60 }]]],
    ["1 px short of its room", { bottom: 421, top: 381 }, [[{ top: 1 }]]],
    ["with exactly its room", { bottom: 420, top: 380 }, []],
    ["above the bar", { bottom: 300, top: 260 }, []],
    ["under the keyboard", { bottom: 700, top: 660 }, [[{ top: 280 }]]],
    // Taller than the room left: its top stops at the visible top.
    [
      "taller than the visible part",
      { bottom: 900, top: 100 },
      [[{ top: 100 }]],
    ],
  ])(
    "scrolls a focused field %s out from under the bar when the keyboard opens",
    (_case, field, scrolls) => {
      const { flushFrame, focusField, scrollBy, viewportChanges } = setup({
        field,
      });
      flushFrame();

      focusField();
      viewportChanges("resize", { height: 500 });
      flushFrame();

      expect(scrollBy.mock.calls).toEqual(scrolls);
    }
  );

  test.each([
    // Visible from 100 to 600: the bar's top at 528, the field 40 px short.
    ["that fits", { bottom: 560, top: 520 }, 40],
    // Its top stops at the visible part's top, 100, not the page's.
    ["taller than the visible part", { bottom: 700, top: 150 }, 50],
  ] as const)(
    "reveals a field %s focused while the keyboard is already open, against the visible part's own top",
    (_case, field, distance) => {
      const { flushFrame, focusField, scrollBy, viewportChanges } = setup({
        field,
      });
      viewportChanges("resize", { height: 500, offsetTop: 100 });
      flushFrame();
      expect(scrollBy).not.toHaveBeenCalled();

      focusField();
      flushFrame();

      expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: distance });
    }
  );

  test.each(["dialog", "alertdialog"] as const)(
    "scrolls nothing for a field in a %s, which the bar under it never covers",
    (inDialog) => {
      // The field the bar covers in the first case above, 60 px short.
      const { flushFrame, focusField, scrollBy, viewportChanges } = setup({
        field: { bottom: 480, top: 440 },
        inDialog,
      });
      flushFrame();

      focusField();
      viewportChanges("resize", { height: 500 });
      flushFrame();

      expect(scrollBy).not.toHaveBeenCalled();
    }
  );

  test.each([
    // Safari panned the visible part (300 to 800) down to the layout's bottom
    // for a field there: the bar, at 728, rides the keyboard without moving
    // and covers the field, 70 px short of its room.
    ["with the keyboard open", { scale: 1 }, [[{ top: 70 }]]],
    // The same visible part from pinch zoom: no keyboard, nothing moves.
    ["under pinch zoom", { scale: 2 }, []],
  ])(
    "reveals a field under a bar that the keyboard does not displace %s",
    (_case, { scale }, scrolls) => {
      const { flushFrame, focusField, scrollBy, viewportChanges } = setup({
        field: { bottom: 790, top: 750 },
      });
      flushFrame();

      focusField();
      viewportChanges("resize", { height: 500, offsetTop: 300, scale });
      flushFrame();

      expect(scrollBy.mock.calls).toEqual(scrolls);
    }
  );

  test("lets a field the user scrolled under the bar stay there", () => {
    const { flushFrame, focusField, layout, scrollBy, viewportChanges } =
      setup();
    focusField();
    viewportChanges("resize", { height: 500 });
    flushFrame();

    layout.scrollY = -180;
    viewportChanges("scroll", { offsetTop: 0 });
    flushFrame();

    expect(scrollBy).not.toHaveBeenCalled();
  });

  test("scrolls nothing for focus in the bar itself, which rides with it", () => {
    const { bar, flushFrame, scrollBy, viewportChanges } = setup();
    const button = document.createElement("button");
    bar.append(button);
    // Wherever the bar is, its button is: under the bar's top edge.
    vi.spyOn(button, "getBoundingClientRect").mockImplementation(() =>
      bar.getBoundingClientRect()
    );
    act(() => {
      button.focus();
    });

    viewportChanges("resize", { height: 500 });
    flushFrame();

    expect(scrollBy).not.toHaveBeenCalled();
  });

  test("scrolls nothing when focus moves while no keyboard is open", () => {
    const { flushFrame, focusField, scrollBy } = setup({
      field: { bottom: 790, top: 750 },
    });

    focusField();
    flushFrame();

    expect(scrollBy).not.toHaveBeenCalled();
  });

  test("stops following the keyboard when it unmounts, its frame cancelled and the bar put back", () => {
    const {
      addListener,
      barState,
      cancelFrame,
      flushFrame,
      focusField,
      frames,
      scrollBy,
      view,
      viewportChanges,
    } = setup({ field: { bottom: 480, top: 440 } });
    viewportChanges("resize", { height: 500 });
    flushFrame();
    expect(addListener.mock.calls.map(([type]) => type)).toEqual([
      "resize",
      "scroll",
    ]);
    viewportChanges("scroll", { offsetTop: 20 });
    const pending = required([...frames.keys()][0]);

    view.unmount();

    expect(cancelFrame).toHaveBeenCalledExactlyOnceWith(pending);
    expect(barState()).toEqual(CLOSED);
    viewportChanges("resize", { height: 400 });
    focusField();
    expect(frames.size).toBe(0);
    expect(scrollBy).not.toHaveBeenCalled();
    expect(barState()).toEqual(CLOSED);
  });
});
