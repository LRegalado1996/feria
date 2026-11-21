import { act, fireEvent, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CartPanelContext, type CartPanelOptions } from "@/lib/hooks/cart";
import type { Locale } from "@/lib/i18n/config";
import { collectHydrationErrors } from "@/test/hydration";
import { createI18nWrapper, renderWithI18n } from "@/test/i18n";

import { StoreCartButton } from "./store-cart-button";

const { navigate } = vi.hoisted(() => ({
  navigate: vi.fn<(href: string) => void>(),
}));

// The app's links navigate without a reload, as next/link does: they take
// the click unless something before them already did.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a
      href={href}
      {...props}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
          event.preventDefault();
          navigate(href);
        }
      }}
    >
      {children}
    </a>
  ),
}));

const KEY = "feria:cart";

/** A cart of these quantities, one article each. */
function makeCart(quantities: number[]) {
  return quantities.map((quantity, index) => ({
    productId: index + 1,
    quantity,
  }));
}

function setup({
  cart = [],
  locale = "en",
  panel = false,
}: {
  cart?: number[];
  locale?: Locale;
  /** Inside a store page's frame, with its side panel. */
  panel?: boolean;
} = {}) {
  localStorage.setItem(KEY, JSON.stringify(makeCart(cart)));
  const open = vi.fn<(options?: CartPanelOptions) => void>();
  const ui = (isOpen: boolean) =>
    panel ? (
      <CartPanelContext value={{ isOpen, open }}>
        <StoreCartButton className="custom" />
      </CartPanelContext>
    ) : (
      <StoreCartButton className="custom" />
    );
  const { rerender } = renderWithI18n(ui(false), { locale });

  return {
    badge: () => screen.queryByTestId("store-cart-count"),
    link: () => screen.getByTestId("store-cart-button"),
    open,
    /** The panel over the header opens or closes. */
    panelOpen: (isOpen: boolean) => {
      rerender(ui(isOpen));
    },
    /** The cart changes, here or in another tab. */
    store: (quantities: number[]) => {
      act(() => {
        localStorage.setItem(KEY, JSON.stringify(makeCart(quantities)));
        window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
      });
    },
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("StoreCartButton", () => {
  test.each([
    ["en", [], "Cart, empty"],
    ["en", [1], "Cart, 1 item"],
    ["en", [2], "Cart, 2 items"],
    ["en", [1, 1], "Cart, 2 items"],
    ["en", [3, 4], "Cart, 7 items"],
    ["es", [], "Carrito, vacío"],
    ["es", [1], "Carrito, 1 unidad"],
    ["es", [2, 3], "Carrito, 5 unidades"],
  ] as const)(
    "in %s, with quantities %j, is named %j",
    (locale, cart, name) => {
      const { link } = setup({ cart: [...cart], locale });

      expect(screen.getByRole("link", { name })).toBe(link());
    }
  );

  test("shows no badge for an empty cart", () => {
    const { badge } = setup();

    expect(badge()).toBeNull();
  });

  test.each([
    [[1], "1"],
    [[3, 4], "7"],
  ])(
    "with quantities %j, its badge shows %s, hidden from screen readers",
    (cart, text) => {
      const { badge } = setup({ cart });

      expect(badge()).toHaveTextContent(new RegExp(`^${text}$`, "u"));
      expect(badge()).toHaveAttribute("aria-hidden", "true");
    }
  );

  test.each([
    ["es", "/cart"],
    ["en", "/en/cart"],
  ] as const)("in %s, leads to the checkout at %s", (locale, href) => {
    const { link } = setup({ locale });

    expect(link()).toHaveAttribute("href", href);
    expect(link()).toHaveAttribute("data-slot", "store-cart-button");
    expect(link()).toHaveClass("custom");
  });

  test("is a round accent icon on the header's moss, its count a round accent badge", () => {
    const { badge, link } = setup({ cart: [2] });

    expect(link()).toHaveClass(
      "size-11",
      "rounded-full",
      "text-store-accent",
      "focus-visible:outline-store-accent"
    );
    expect(badge()).toHaveClass(
      "rounded-full",
      "bg-store-accent",
      "text-store-foreground"
    );
  });

  test("in a store page's frame, a plain click opens the side panel instead of the page, giving focus back to the link", () => {
    const { link, open } = setup({ cart: [2], panel: true });

    fireEvent.click(link());

    expect(open).toHaveBeenCalledExactlyOnceWith({ returnFocus: link() });
    expect(navigate).not.toHaveBeenCalled();
    expect(link()).toHaveAttribute("aria-haspopup", "dialog");
  });

  test.each([
    ["with Control", { ctrlKey: true }],
    ["with Command", { metaKey: true }],
    ["with Shift", { shiftKey: true }],
    ["with Alt", { altKey: true }],
    ["with the middle button", { button: 1 }],
  ])(
    "in a store page's frame, a click %s still follows the link",
    (_case, init) => {
      const { link, open } = setup({ panel: true });

      fireEvent.click(link(), init);

      expect(open).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledExactlyOnceWith("/en/cart");
    }
  );

  test("outside a store page's frame, it is only the link to the checkout", () => {
    const { link } = setup();

    fireEvent.click(link());

    expect(navigate).toHaveBeenCalledExactlyOnceWith("/en/cart");
    expect(link()).not.toHaveAttribute("aria-haspopup");
  });

  test("the count read as the page opens does not bump", () => {
    const { badge } = setup({ cart: [2], panel: true });

    expect(badge()).toHaveAttribute("data-bumps", "0");
    expect(badge()).not.toHaveClass("motion-safe:animate-store-bump");
  });

  test("a count that grows in sight bumps, drawn anew; one that shrinks does not", () => {
    const { badge, store } = setup({ cart: [2], panel: true });
    const before = badge();

    store([3]);

    expect(badge()).toHaveTextContent(/^3$/u);
    expect(badge()).not.toBe(before);
    expect(badge()).toHaveAttribute("data-bumps", "1");
    expect(badge()).toHaveClass("motion-safe:animate-store-bump");

    store([1]);

    expect(badge()).toHaveTextContent(/^1$/u);
    expect(badge()).toHaveAttribute("data-bumps", "1");
  });

  test("a count that grows under the open panel bumps as the panel closes", () => {
    const { badge, panelOpen, store } = setup({ cart: [2], panel: true });

    panelOpen(true);
    store([4]);

    expect(badge()).toHaveTextContent(/^4$/u);
    expect(badge()).toHaveAttribute("data-bumps", "0");

    panelOpen(false);

    expect(badge()).toHaveAttribute("data-bumps", "1");
    expect(badge()).toHaveClass("motion-safe:animate-store-bump");
  });

  test("a count that ends where it was while the panel was open does not bump", () => {
    const { badge, panelOpen, store } = setup({ cart: [2], panel: true });

    panelOpen(true);
    store([3]);
    store([2]);
    panelOpen(false);

    expect(badge()).toHaveAttribute("data-bumps", "0");
  });

  test("the server's link is plain, and opens the panel only once React owns it", () => {
    localStorage.setItem(KEY, JSON.stringify(makeCart([2])));
    const I18n = createI18nWrapper("en");
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <I18n>
        <CartPanelContext
          value={{
            isOpen: false,
            open: vi.fn<(options?: CartPanelOptions) => void>(),
          }}
        >
          <StoreCartButton />
        </CartPanelContext>
      </I18n>,
      { clientNowMs: 1000, serverNowMs: 0 }
    );

    expect(serverHtml).not.toContain("aria-haspopup");
    expect(serverHtml).not.toContain("store-cart-count");
    expect(clientHtml).toContain('aria-haspopup="dialog"');
    expect(clientHtml).toContain('data-bumps="0"');
    expect(errors).toEqual([]);
  });
});
