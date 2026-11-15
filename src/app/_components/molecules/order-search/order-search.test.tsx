import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { OrdersQuery } from "@/lib/admin/orders";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { ORDER_SEARCH_DEBOUNCE_MS, OrderSearch } from "./order-search";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function setup({
  locale = "es",
  query = { status: "received" },
}: { locale?: Locale; query?: OrdersQuery } = {}) {
  vi.useFakeTimers();
  const view = renderWithI18n(
    <OrderSearch className="custom" query={query} storeSlug="lr-market" />,
    { locale }
  );
  const field = () =>
    screen.getByRole("searchbox", {
      name: locale === "es" ? "Buscar pedidos" : "Search orders",
    });

  return {
    advance: (ms: number) => {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    },
    field,
    form: () => {
      const form = field().closest("form");

      if (!form) {
        throw new Error("No form");
      }

      return form;
    },
    rerender: (next: OrdersQuery) => {
      view.rerender(
        <OrderSearch className="custom" query={next} storeSlug="lr-market" />
      );
    },
    /** Types into the field as the browser reports it: one change event. */
    type: (text: string) => {
      field().focus();
      fireEvent.change(field(), { target: { value: text } });
    },
    unmount: () => {
      view.unmount();
    },
  };
}

describe("OrderSearch", () => {
  test("waits for typing to pause, then replaces the address with the search, keeping the status", () => {
    const { advance, type } = setup();

    type("K7P2Q");
    advance(ORDER_SEARCH_DEBOUNCE_MS - 1);

    expect(ORDER_SEARCH_DEBOUNCE_MS).toBe(300);
    expect(replace).not.toHaveBeenCalled();

    advance(1);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/admin/lr-market/orders?status=received&q=K7P2Q",
      { scroll: false }
    );
  });

  test("navigates nowhere once unmounted, though typing had not paused yet", () => {
    const { advance, type, unmount } = setup();

    type("ana");
    advance(ORDER_SEARCH_DEBOUNCE_MS - 1);
    unmount();
    advance(ORDER_SEARCH_DEBOUNCE_MS);

    expect(replace).not.toHaveBeenCalled();
  });

  test("sends the search trimmed, once, after the last keystroke", () => {
    const { advance, type } = setup({ locale: "en", query: {} });

    type("a");
    advance(ORDER_SEARCH_DEBOUNCE_MS - 1);
    type(" ana ");
    advance(ORDER_SEARCH_DEBOUNCE_MS);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/lr-market/orders?q=ana",
      { scroll: false }
    );
  });

  test("a search cleared to blank takes q out of the address", () => {
    const { advance, type } = setup({
      query: { q: "ana", status: "packed" },
    });

    type("   ");
    advance(ORDER_SEARCH_DEBOUNCE_MS);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/admin/lr-market/orders?status=packed",
      { scroll: false }
    );
  });

  test("submitting searches at once, and the pending wait sends nothing more", () => {
    const { advance, form, type } = setup({ query: {} });

    type("099 123");
    fireEvent.submit(form());

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/admin/lr-market/orders?q=099+123",
      { scroll: false }
    );

    advance(ORDER_SEARCH_DEBOUNCE_MS);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/admin/lr-market/orders?q=099+123",
      { scroll: false }
    );
  });

  test("submitting with nothing pending searches what the field holds", () => {
    const { form } = setup({ query: { q: "ana" } });

    fireEvent.submit(form());

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/admin/lr-market/orders?q=ana",
      { scroll: false }
    );
  });

  test("keeps focus and what was typed when the address catches up with it", () => {
    const { advance, field, rerender, type } = setup({ query: {} });
    type("ana");
    advance(ORDER_SEARCH_DEBOUNCE_MS);
    const input = field();

    rerender({ q: "ana" });

    expect(field()).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("ana");
  });

  test("keeps typing that ran ahead of the address, through two searches in turn", () => {
    const { advance, field, rerender, type } = setup({ query: {} });
    type("an");
    advance(ORDER_SEARCH_DEBOUNCE_MS);
    type("ana");
    advance(ORDER_SEARCH_DEBOUNCE_MS);
    type("ana p");

    rerender({ q: "an" });
    expect(field()).toHaveValue("ana p");

    rerender({ q: "ana" });
    expect(field()).toHaveValue("ana p");
  });

  test("after catching up, a search from elsewhere replaces the field again", () => {
    const { advance, field, rerender, type } = setup({ query: {} });
    type("ana");
    advance(ORDER_SEARCH_DEBOUNCE_MS);
    rerender({ q: "ana" });

    rerender({});

    expect(field()).toHaveValue("");
  });

  test("a search from elsewhere drops the one still waiting to be sent", () => {
    const { advance, field, rerender, type } = setup({ query: { q: "ana" } });

    type("beto");
    advance(ORDER_SEARCH_DEBOUNCE_MS - 1);
    rerender({ q: "carla" });
    advance(ORDER_SEARCH_DEBOUNCE_MS);

    expect(replace).not.toHaveBeenCalled();
    expect(field()).toHaveValue("carla");
  });

  test("before the script runs, the form itself carries the status", () => {
    const { field, form } = setup();

    expect(form()).toHaveAttribute("action", "/admin/lr-market/orders");
    expect(
      [...form().querySelectorAll('input[type="hidden"]')].map((input) => [
        input.getAttribute("name"),
        input.getAttribute("value"),
      ])
    ).toEqual([["status", "received"]]);
    expect(field()).toHaveAttribute("name", "q");
    expect(field()).toHaveAttribute("maxlength", "80");
    expect(field()).toHaveAttribute("placeholder", "Código, nombre o teléfono");
    expect(form().parentElement).toHaveAttribute("data-slot", "order-search");
    expect(form().parentElement).toHaveClass("custom");
  });

  test("carries no status for all of them", () => {
    const { field, form } = setup({ locale: "en", query: {} });

    expect(form()).toHaveAttribute("action", "/en/admin/lr-market/orders");
    expect(form().querySelectorAll('input[type="hidden"]')).toHaveLength(0);
    expect(field()).toHaveAttribute("placeholder", "Code, name or phone");
  });
});
