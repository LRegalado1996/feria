import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { SEARCH_DEBOUNCE_MS, useSearchField } from "./use-search-field";

/**
 * The field over a search the address holds (`current`), sending through a
 * spy; `rerender` brings a new address, and a new `send` with it.
 */
function setup(current?: string) {
  vi.useFakeTimers();
  const sent = vi.fn<(label: string, q: string | undefined) => void>();
  const view = renderHook(
    ({ address, label }: { address?: string; label: string }) =>
      useSearchField(address, (q) => {
        sent(label, q);
      }),
    { initialProps: { address: current, label: "first" } }
  );

  return {
    advance: (ms: number) => {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    },
    act: (run: (field: typeof view.result.current) => void) => {
      act(() => {
        run(view.result.current);
      });
    },
    rerender: (address: string | undefined, label = "first") => {
      view.rerender({ address, label });
    },
    sent,
    unmount: view.unmount,
    value: () => view.result.current.value,
  };
}

describe("useSearchField", () => {
  test("waits 300 ms after the last change, then sends what was typed, trimmed, once", () => {
    const field = setup();

    field.act((search) => {
      search.change("an");
    });
    field.advance(SEARCH_DEBOUNCE_MS - 1);
    field.act((search) => {
      search.change(" ana ");
    });
    field.advance(SEARCH_DEBOUNCE_MS - 1);

    expect(SEARCH_DEBOUNCE_MS).toBe(300);
    expect(field.sent).not.toHaveBeenCalled();
    expect(field.value()).toBe(" ana ");

    field.advance(1);

    expect(field.sent).toHaveBeenCalledExactlyOnceWith("first", "ana");
  });

  test("blank is no search", () => {
    const field = setup("ana");

    field.act((search) => {
      search.change("   ");
    });
    field.advance(SEARCH_DEBOUNCE_MS);

    expect(field.sent).toHaveBeenCalledExactlyOnceWith("first", undefined);
  });

  test("submitting sends what the field holds at once, and the waiting change sends nothing more", () => {
    const field = setup();
    field.act((search) => {
      search.change("aros");
    });

    field.act((search) => {
      search.submit();
    });
    field.advance(SEARCH_DEBOUNCE_MS);

    expect(field.sent).toHaveBeenCalledExactlyOnceWith("first", "aros");
  });

  test("clearing empties the field and sends no search at once", () => {
    const field = setup("ana");
    field.act((search) => {
      search.change("anas");
    });

    field.act((search) => {
      search.clear();
    });
    field.advance(SEARCH_DEBOUNCE_MS);

    expect(field.value()).toBe("");
    expect(field.sent).toHaveBeenCalledExactlyOnceWith("first", undefined);
  });

  test("sends through the latest `send`, which carries what the address holds by then", () => {
    const field = setup();
    field.act((search) => {
      search.change("ana");
    });

    field.rerender(undefined, "second");
    field.advance(SEARCH_DEBOUNCE_MS);

    expect(field.sent).toHaveBeenCalledExactlyOnceWith("second", "ana");
  });

  test("keeps typing that ran ahead of the address, through two searches in turn", () => {
    const field = setup();
    field.act((search) => {
      search.change("an");
    });
    field.advance(SEARCH_DEBOUNCE_MS);
    field.act((search) => {
      search.change("ana");
    });
    field.advance(SEARCH_DEBOUNCE_MS);
    field.act((search) => {
      search.change("ana p");
    });

    field.rerender("an");
    expect(field.value()).toBe("ana p");

    field.rerender("ana");
    expect(field.value()).toBe("ana p");
  });

  test("after catching up, a search from elsewhere replaces the field", () => {
    const field = setup();
    field.act((search) => {
      search.change("ana");
    });
    field.advance(SEARCH_DEBOUNCE_MS);
    field.rerender("ana");

    field.rerender("beto");

    expect(field.value()).toBe("beto");
  });

  test("a search from elsewhere drops the one still waiting to be sent", () => {
    const field = setup("ana");
    field.act((search) => {
      search.change("beto");
    });
    field.advance(SEARCH_DEBOUNCE_MS - 1);

    field.rerender("carla");
    field.advance(SEARCH_DEBOUNCE_MS);

    expect(field.sent).not.toHaveBeenCalled();
    expect(field.value()).toBe("carla");
  });

  test("an address without a search empties the field", () => {
    const field = setup("ana");

    field.rerender(undefined);

    expect(field.value()).toBe("");
  });

  test("sends nothing once the field is gone, though typing had not paused yet", () => {
    const field = setup();
    field.act((search) => {
      search.change("ana");
    });

    field.unmount();
    field.advance(SEARCH_DEBOUNCE_MS);

    expect(field.sent).not.toHaveBeenCalled();
  });
});
