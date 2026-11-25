import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  type CartPanelAdded,
  type CartProduct,
  useCartPanel,
} from "@/lib/hooks/cart";
import type { Locale } from "@/lib/i18n/config";
import { browserClick } from "@/test/browser-click";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { required } from "@/test/required";
import { createQueryWrapper } from "@/test/setup-helpers";

import { StoreCartPanel } from "./store-cart-panel";

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

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// The app's client reports a failed query; that has its own tests.
vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const KEY = "feria:cart";

function makeProduct(
  id: number,
  overrides: Partial<CartProduct> = {}
): CartProduct {
  return {
    categorySlug: null,
    cover: null,
    currencyCode: "UYU",
    id,
    isAvailable: true,
    lang: "es",
    priceAmount: id * 10_000,
    slug: `articulo-${id}`,
    title: `Artículo ${id}`,
    ...overrides,
  };
}

function makeLine(productId: number, quantity: number, seen?: number) {
  return seen === undefined
    ? { productId, quantity }
    : { productId, quantity, seenPriceAmount: seen };
}

/** Two articles: 2 of article 4, 1 of article 9. */
const CART = [makeLine(4, 2, 40_000), makeLine(9, 1, 90_000)];

/** What a page puts in the frame: something that opens the panel. */
function Opener({ added }: { added?: CartPanelAdded }) {
  const panel = useCartPanel();

  return (
    <>
      <button
        onClick={(event) => {
          panel?.open({ added, returnFocus: event.currentTarget });
        }}
        type="button"
      >
        Open
      </button>
      <button
        onClick={() => {
          panel?.open();
        }}
        type="button"
      >
        Open as it is
      </button>
      <output data-testid="opened">{String(panel?.isOpen)}</output>
    </>
  );
}

interface SetupOptions {
  added?: CartPanelAdded;
  cart?: unknown[];
  locale?: Locale;
  products?: "fail" | CartProduct[];
}

function setup({
  added,
  cart = CART,
  locale = "en",
  products = [makeProduct(4), makeProduct(9)],
}: SetupOptions = {}) {
  localStorage.setItem(KEY, JSON.stringify(cart));
  const cartProducts = vi.fn(async (_input: unknown) => products);
  server.use(
    products === "fail"
      ? createOrpcErrorHandler("catalog.cartProducts", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
          status: 500,
        })
      : createOrpcHandler("catalog.cartProducts", cartProducts)
  );
  const user = userEvent.setup();
  renderWithI18n(
    <StoreCartPanel>
      <Opener added={added} />
    </StoreCartPanel>,
    { locale, wrapper: createQueryWrapper() }
  );
  const panel = () => screen.queryByTestId("store-cart-panel");

  return {
    cartProducts,
    /** The polite announcement of the last line taken out. */
    announcement: () =>
      screen.getByTestId("store-cart-panel-removed").textContent,
    /** The lines on screen, as `[title, flag]`. */
    lines: () =>
      screen
        .queryAllByTestId("store-cart-line")
        .map((line) => [
          within(line).queryByRole("link")?.textContent ??
            line.querySelector("p")?.textContent ??
            line.querySelector(".sr-only")?.textContent,
          line.dataset.flag ?? null,
        ]),
    open: async (name = "Open") => {
      const opener = screen.getByRole("button", { name });
      await user.click(opener);

      return { dialog: required(panel()), opener };
    },
    panel,
    storedCart: (): unknown => JSON.parse(localStorage.getItem(KEY) ?? "null"),
    /** Waits for the shop's answer to fill the lines. */
    shown: async () => {
      await waitFor(() => {
        expect(
          screen
            .getAllByTestId("store-cart-line")
            .every((line) => line.dataset.flag !== "pending")
        ).toBe(true);
      });
    },
    total: () =>
      screen
        .getByTestId("store-cart-panel-total")
        .textContent?.replaceAll(" ", " "),
    user,
  };
}

afterEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/");
  // The frame clock a test held, given back.
  vi.restoreAllMocks();
});

describe("StoreCartPanel", () => {
  test("is shut at first: the page is there, the panel is not, and the page knows", () => {
    const { panel } = setup();

    expect(screen.getByRole("button", { name: "Open" })).toBeVisible();
    expect(panel()).toBeNull();
    expect(screen.getByTestId("opened")).toHaveTextContent("false");
  });

  test.each([
    [
      "en",
      "Your cart, 3 units",
      "Place the order",
      "/en/cart",
      "Keep shopping",
      "Close",
    ],
    [
      "es",
      "Tu carrito, 3 unidades",
      "Hacer el pedido",
      "/cart",
      "Seguir comprando",
      "Cerrar",
    ],
  ] as const)(
    "in %s, opens a dialog named %j with every line, the total, %j to %s and %j",
    async (locale, name, placeOrder, href, keepShopping, close) => {
      const { open, shown, total } = setup({ locale });

      const { dialog } = await open();
      await shown();

      expect(screen.getByRole("dialog", { name })).toBe(dialog);
      expect(
        within(dialog).getByTestId("store-cart-panel-count")
      ).toHaveTextContent("(3)");
      expect(
        screen
          .getAllByTestId("store-cart-line")
          .map((line) => [
            within(line).getByRole("link").textContent,
            within(line).getByTestId("store-cart-quantity").textContent,
          ])
      ).toEqual([
        ["Artículo 4", "2"],
        ["Artículo 9", "1"],
      ]);
      expect(total()).toBe(locale === "en" ? "TotalUYU 1,700" : "Total$ 1.700");
      const checkout = within(dialog).getByRole("link", { name: placeOrder });
      expect(checkout).toHaveAttribute("href", href);
      // On the moss, the main action is the lime pill.
      expect(checkout).toHaveAttribute("data-variant", "accent");
      expect(
        within(dialog).getByRole("button", { name: keepShopping })
      ).toBeVisible();
      expect(within(dialog).getByRole("button", { name: close })).toBeVisible();
      expect(screen.getByTestId("opened")).toHaveTextContent("true");
    }
  );

  test("slides in from the right over a dimmed page, all of a phone's width, and slides out only when it stays on the page", async () => {
    const { open } = setup();

    const { dialog } = await open();

    expect(dialog).toHaveClass(
      "fixed",
      "right-0",
      "h-dvh",
      "w-full",
      "sm:max-w-120",
      "data-[state=open]:animate-store-panel-in",
      "data-[state=closed]:animate-store-panel-out"
    );
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    const scrim = screen.getByTestId("dialog-overlay");
    expect(scrim).toHaveClass(
      "bg-store-foreground/50",
      "data-[state=open]:animate-store-scrim-in",
      "data-[state=closed]:animate-store-scrim-out"
    );
    expect(scrim).toHaveAttribute("data-slot", "dialog-overlay");
  });

  test("opened by adding, says what adding did politely once it is open, marks that line and bumps the count", async () => {
    const { open, shown } = setup({
      added: { message: "You added Artículo 9 to your cart.", productId: 9 },
    });

    const { dialog } = await open();
    const status = within(dialog).getByTestId("store-cart-panel-status");
    expect(status).toHaveAttribute("aria-live", "polite");
    await waitFor(() => {
      expect(status).toHaveTextContent("You added Artículo 9 to your cart.");
    });
    await shown();

    expect(
      screen
        .getAllByTestId("store-cart-line")
        .map((line) => line.dataset.justAdded ?? null)
    ).toEqual([null, ""]);
    expect(within(dialog).getByTestId("store-cart-panel-count")).toHaveClass(
      "motion-safe:animate-store-bump"
    );
  });

  test("the words of what adding did go into the region a frame after it is on the page, so they are announced", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);

      return frames.length;
    });
    const { open } = setup({
      added: { message: "You added Artículo 9 to your cart.", productId: 9 },
    });

    const { dialog } = await open();
    const status = within(dialog).getByTestId("store-cart-panel-status");

    // On the page, empty: a live region added with its words is not read.
    expect(status).toHaveTextContent(/^$/u);

    act(() => {
      for (const frame of frames.splice(0)) {
        frame(0);
      }
    });

    expect(status).toHaveTextContent(/^You added Artículo 9 to your cart\.$/u);
  });

  test("opened from the header, says nothing of adding, marks no line and leaves the count still", async () => {
    const { open, shown } = setup();

    const { dialog } = await open();
    await shown();

    expect(within(dialog).queryByTestId("store-cart-panel-status")).toBeNull();
    expect(
      screen
        .getAllByTestId("store-cart-line")
        .map((line) => line.dataset.justAdded ?? null)
    ).toEqual([null, null]);
    expect(
      within(dialog).getByTestId("store-cart-panel-count")
    ).not.toHaveClass("motion-safe:animate-store-bump");
  });

  test("a quantity raised in the panel is stored and bumps the count", async () => {
    const { open, shown, storedCart, user } = setup();
    const { dialog } = await open();
    await shown();
    const before = within(dialog).getByTestId("store-cart-panel-count");

    await user.click(
      screen.getByRole("button", { name: "One unit more of Artículo 4" })
    );

    expect(storedCart()).toEqual([
      makeLine(4, 3, 40_000),
      makeLine(9, 1, 90_000),
    ]);
    const after = within(dialog).getByTestId("store-cart-panel-count");
    expect(after).toHaveTextContent("(4)");
    // Drawn anew, so the bump plays.
    expect(after).not.toBe(before);
    expect(after).toHaveClass("motion-safe:animate-store-bump");
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Your cart, 4 units"
    );
  });

  test("a quantity lowered in the panel is stored and leaves the count still", async () => {
    const { open, shown, storedCart, user } = setup();
    const { dialog } = await open();
    await shown();

    await user.click(
      screen.getByRole("button", { name: "One unit less of Artículo 4" })
    );

    expect(storedCart()).toEqual([
      makeLine(4, 1, 40_000),
      makeLine(9, 1, 90_000),
    ]);
    expect(
      within(dialog).getByTestId("store-cart-panel-count")
    ).not.toHaveClass("motion-safe:animate-store-bump");
  });

  test("taking out a line moves focus to the remove button now in its place, and says what was taken out", async () => {
    const { announcement, open, shown, storedCart, user } = setup({
      cart: [...CART, makeLine(12, 1, 120_000)],
      products: [makeProduct(4), makeProduct(9), makeProduct(12)],
    });
    await open();
    await shown();

    await user.click(screen.getByRole("button", { name: "Remove Artículo 4" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove Artículo 9" })
      ).toHaveFocus();
    });
    expect(storedCart()).toEqual([
      makeLine(9, 1, 90_000),
      makeLine(12, 1, 120_000),
    ]);
    expect(announcement()).toBe("You removed Artículo 4 from the cart.⁠");
  });

  test("taking out the last of several lines moves focus to the one before it", async () => {
    const { open, shown, user } = setup();
    await open();
    await shown();

    await user.click(screen.getByRole("button", { name: "Remove Artículo 9" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Remove Artículo 4" })
      ).toHaveFocus();
    });
  });

  test.each([
    ["en", "Browse the catalog", "You removed Artículo 4 from the cart.⁠"],
    ["es", "Ver el catálogo", "Quitaste Artículo 4 del carrito.⁠"],
  ] as const)(
    "in %s, taking out the only line empties the panel, moves focus to %j and announces it",
    async (locale, link, said) => {
      const { announcement, open, shown, user } = setup({
        cart: [makeLine(4, 2, 40_000)],
        locale,
        products: [makeProduct(4)],
      });
      await open();
      await shown();

      await user.click(
        screen.getByRole("button", {
          name: locale === "en" ? "Remove Artículo 4" : "Quitar Artículo 4",
        })
      );

      const empty = await screen.findByTestId("store-cart-panel-empty");
      expect(within(empty).getByRole("link", { name: link })).toHaveFocus();
      expect(announcement()).toBe(said);
      // Nothing to order: no total and no way to the checkout.
      expect(screen.queryByTestId("store-cart-panel-total")).toBeNull();
      expect(screen.queryByTestId("store-cart-panel-checkout")).toBeNull();
    }
  );

  test("the same message said twice flips its invisible mark, so it is announced again", async () => {
    const { announcement, lines, open, user } = setup({ products: [] });
    await open();
    await waitFor(() => {
      expect(lines()).toEqual([
        ["Article no longer for sale", "gone"],
        ["Article no longer for sale", "gone"],
      ]);
    });
    expect(announcement()).toBe("");
    await user.click(
      required(
        screen.getAllByRole("button", {
          name: "Remove Article no longer for sale",
        })[0]
      )
    );
    await waitFor(() => {
      expect(lines()).toEqual([["Article no longer for sale", "gone"]]);
    });
    expect(announcement()).toBe(
      "You removed Article no longer for sale from the cart.⁠"
    );

    await user.click(screen.getByRole("button", { name: /^Remove /u }));

    await screen.findByTestId("store-cart-panel-empty");
    expect(announcement()).toBe(
      "You removed Article no longer for sale from the cart."
    );
  });

  test("an empty cart says so and offers the catalog, with nothing to order", async () => {
    const { cartProducts, open } = setup({ cart: [] });

    const { dialog } = await open();

    const empty = within(dialog).getByTestId("store-cart-panel-empty");
    expect(empty).toHaveTextContent("Your cart is empty.");
    const browse = within(empty).getByRole("link", {
      name: "Browse the catalog",
    });
    expect(browse).toHaveAttribute("href", "/en/productos");
    expect(browse).toHaveAttribute("data-variant", "primary");
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Your cart");
    expect(within(dialog).queryByTestId("store-cart-panel-count")).toBeNull();
    expect(screen.queryByTestId("store-cart-panel-checkout")).toBeNull();
    expect(cartProducts).not.toHaveBeenCalled();
  });

  test("one unit is named in the singular", async () => {
    const { open } = setup({ cart: [makeLine(4, 1)] });

    await open();

    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Your cart, 1 unit"
    );
  });

  test("shows the same flags as the checkout, and a sold-out line holds the order there until it is taken out", async () => {
    const { lines, open, shown, total, user } = setup({
      cart: [makeLine(4, 2, 30_000), makeLine(9, 1, 90_000)],
      products: [makeProduct(4), makeProduct(9, { isAvailable: false })],
    });
    await open();
    await shown();

    expect(lines()).toEqual([
      ["Artículo 4", "price_changed"],
      ["Artículo 9", "unavailable"],
    ]);
    expect(
      screen.getByText("The price changed: it was UYU 300.")
    ).toBeVisible();
    expect(total()).toBe("TotalUYU 800");
    const held = screen.getByTestId("store-cart-panel-checkout");
    expect(held.tagName).toBe("BUTTON");
    expect(held).toBeDisabled();
    expect(held).toHaveAccessibleDescription(
      "Remove the articles that can no longer be bought to place the order."
    );

    await user.click(screen.getByRole("button", { name: "Remove Artículo 9" }));

    await waitFor(() => {
      expect(screen.getByTestId("store-cart-panel-checkout").tagName).toBe("A");
    });
  });

  test("says the prices could not be read and reads them again on retry", async () => {
    const { cartProducts, lines, open, user } = setup({ products: "fail" });
    await open();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not fetch the current prices."
    );
    expect(lines()).toEqual([
      ["Fetching the current prices…", "pending"],
      ["Fetching the current prices…", "pending"],
    ]);
    server.use(createOrpcHandler("catalog.cartProducts", cartProducts));
    cartProducts.mockResolvedValue([makeProduct(4), makeProduct(9)]);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(lines()).toEqual([
        ["Artículo 4", null],
        ["Artículo 9", null],
      ]);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test.each([
    [
      "Escape",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.keyboard("{Escape}");
      },
    ],
    [
      "the dimmed page",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByTestId("dialog-overlay"));
      },
    ],
    [
      "its close button",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Close" }));
      },
    ],
    [
      "Keep shopping",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("button", { name: "Keep shopping" }));
      },
    ],
  ])(
    "%s closes it and gives focus back to what opened it",
    async (_case, close) => {
      const { open, panel, user } = setup();
      const { opener } = await open();

      await close(user);

      await waitFor(() => {
        expect(panel()).toBeNull();
      });
      expect(opener).toHaveFocus();
      expect(screen.getByTestId("opened")).toHaveTextContent("false");
    }
  );

  test("opened without saying by what, gives focus back to what had it", async () => {
    const { open, panel, user } = setup();
    const { opener } = await open("Open as it is");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(panel()).toBeNull();
    });
    expect(opener).toHaveFocus();
  });

  test("keeps focus inside while open, starting on its close button", async () => {
    const { open, user } = setup({ cart: [] });
    const { dialog } = await open();

    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    await user.tab();
    expect(
      within(dialog).getByRole("link", { name: "Browse the catalog" })
    ).toHaveFocus();
    await user.tab();

    expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
  });

  test("following a link to another page closes it at once and leaves focus where the page puts it", async () => {
    const { open, panel, shown, user } = setup();
    const { opener } = await open();
    await shown();

    // As a browser delivers it: the panel must still be there, with its
    // link, when the link's own handler runs (FER-064).
    await browserClick(
      user,
      screen.getByRole("link", { name: "Place the order" })
    );

    expect(navigate).toHaveBeenCalledExactlyOnceWith("/en/cart");
    await waitFor(() => {
      expect(panel()).toBeNull();
    });
    expect(opener).not.toHaveFocus();
  });

  test.each([
    [
      "following a link away drops the exit slide from",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole("link", { name: "Artículo 4" }));
      },
      false,
    ],
    [
      "Escape keeps the exit slide on",
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.keyboard("{Escape}");
      },
      true,
    ],
  ])(
    "%s the panel and its scrim as they close",
    async (_case, close, slides) => {
      const { open, panel, shown, user } = setup();
      await open();
      await shown();
      const seen = new Map<string, string>();
      // The classes the panel and its scrim carry as they close.
      const observer = new MutationObserver((records) => {
        for (const { target } of records) {
          if (
            target instanceof HTMLElement &&
            target.dataset.state === "closed" &&
            target.dataset.slot?.startsWith("dialog-")
          ) {
            seen.set(target.dataset.slot, target.className);
          }
        }
      });
      observer.observe(document.body, {
        attributeFilter: ["data-state", "class"],
        attributes: true,
        subtree: true,
      });

      await close(user);
      await waitFor(() => {
        expect(panel()).toBeNull();
      });
      observer.disconnect();

      expect(new Set(seen.keys())).toEqual(
        new Set(["dialog-content", "dialog-overlay"])
      );
      expect(
        seen
          .get("dialog-content")
          ?.includes("data-[state=closed]:animate-store-panel-out")
      ).toBe(slides);
      expect(
        seen
          .get("dialog-overlay")
          ?.includes("data-[state=closed]:animate-store-scrim-out")
      ).toBe(slides);
    }
  );

  test("following a link to the page already open only closes it, giving focus back", async () => {
    window.history.replaceState(null, "", "/en/cart");
    const { open, panel, shown, user } = setup();
    const { opener } = await open();
    await shown();

    await user.click(screen.getByRole("link", { name: "Place the order" }));

    await waitFor(() => {
      expect(panel()).toBeNull();
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
  });

  test("a click that opens a new tab leaves it open", async () => {
    const { open, panel, shown, user } = setup();
    await open();
    await shown();

    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("link", { name: "Place the order" }));
    await user.keyboard("{/Control}");

    expect(panel()).not.toBeNull();
  });

  test("opening again after closing starts over: a new add, a new message", async () => {
    const { open, user } = setup({
      added: { message: "You added Artículo 4 to your cart.", productId: 4 },
    });
    const { dialog } = await open();
    await waitFor(() => {
      expect(
        within(dialog).getByTestId("store-cart-panel-status")
      ).toHaveTextContent("You added Artículo 4 to your cart.");
    });
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByTestId("store-cart-panel")).toBeNull();
    });

    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Open as it is" }));
    });

    expect(screen.queryByTestId("store-cart-panel-status")).toBeNull();
  });
});
