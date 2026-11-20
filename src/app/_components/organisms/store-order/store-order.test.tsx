import { screen, within } from "@testing-library/react";
import useEmblaCarousel from "embla-carousel-react";
import { describe, expect, test, vi } from "vitest";

import type { StoreRelatedArticle } from "@/app/_components/organisms/store-article";
import type { Locale } from "@/lib/i18n/config";
import type { OrderStatus } from "@/lib/schemas/order";
import { createFakeEmbla } from "@/test/embla";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";
import { required } from "@/test/required";

import { StoreOrder, type StoreOrderProps } from "./store-order";

// The row measures a layout happy-dom does not have.
vi.mock("embla-carousel-react", () => ({ default: vi.fn() }));

function makeArticle(id: number): StoreRelatedArticle {
  return {
    cover: id === 8 ? null : { alt: `Foto ${id}`, url: `/related-${id}.jpg` },
    currencyCode: "UYU",
    id,
    isAvailable: id !== 8,
    lang: "es",
    priceAmount: id * 1000,
    slug: `articulo-${id}`,
    title: `Artículo ${id}`,
  };
}

const WHATSAPP = "https://wa.me/59899000111?text=Hola";

function makeOrder(
  overrides: Partial<StoreOrderProps["order"]> = {}
): StoreOrderProps["order"] {
  return {
    code: "K7M2Q",
    currencyCode: "UYU",
    customerPhone: "+598 ••• ••• 456",
    items: [
      { quantity: 2, title: "Collar de perlas", unitPriceAmount: 125_000 },
      { quantity: 1, title: "Aros dorados", unitPriceAmount: 50_050 },
    ],
    note: null,
    status: "received",
    totalAmount: 300_050,
    ...overrides,
  };
}

function setup({
  again = null,
  locale = "en",
  order = makeOrder(),
  whatsappHref = null,
}: {
  again?: StoreOrderProps["again"];
  locale?: Locale;
  order?: StoreOrderProps["order"];
  whatsappHref?: string | null;
} = {}) {
  stubReducedMotion(false);
  vi.mocked(useEmblaCarousel).mockReturnValue(
    createFakeEmbla({ snaps: 1 }).hook
  );
  const { storefront } = DICTIONARIES[locale];
  renderWithI18n(
    <StoreOrder
      again={again}
      catalogHref={locale === "en" ? "/en/products" : "/products"}
      className="custom"
      copy={storefront}
      locale={locale}
      order={order}
      whatsappHref={whatsappHref}
    />,
    { locale }
  );

  return {
    /** Each ordered line's text, no-break spaces read as spaces. */
    items: () =>
      within(screen.getByTestId("store-order-items"))
        .getAllByRole("listitem")
        .map((item) => item.textContent?.replaceAll(" ", " ")),
    total: () =>
      screen.getByTestId("store-order-total").textContent?.replaceAll(" ", " "),
  };
}

describe("StoreOrder", () => {
  test("says the order was received, with its code to say at the stall", () => {
    setup();

    expect(screen.getByTestId("store-order-banner")).toHaveTextContent(
      "We received your order!Your order codeK7M2Q"
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Your order code K7M2Q" })
    ).toBeVisible();
    expect(screen.getByTestId("store-order-code")).toHaveTextContent(
      /^K7M2Q$/u
    );
  });

  test("puts the code on the moss block, in the wide display face", () => {
    setup();

    expect(screen.getByTestId("store-order-banner")).toHaveClass(
      "bg-store-contrast",
      "text-store-background"
    );
    expect(screen.getByTestId("store-order-code")).toHaveClass(
      "font-display",
      "font-extrabold",
      "store-display-page"
    );
  });

  test("lists what was ordered, each line at its quantity, and the total", () => {
    const { items, total } = setup();

    expect(
      screen.getByRole("heading", { level: 2, name: "What you ordered" })
    ).toBeVisible();
    expect(items()).toEqual([
      "2 × Collar de perlasUYU 2,500",
      "1 × Aros doradosUYU 500.50",
    ]);
    expect(total()).toBe("TotalUYU 3,000.50");
  });

  test("lets a long title wrap anywhere so its price stays on screen", () => {
    setup({
      order: makeOrder({
        items: [
          {
            quantity: 1,
            title: "Collardeperlascultivadasconcierredeoroyplata",
            unitPriceAmount: 125_000,
          },
        ],
        totalAmount: 125_000,
      }),
    });
    const [line] = within(screen.getByTestId("store-order-items")).getAllByRole(
      "listitem"
    );

    expect(line?.firstElementChild).toHaveTextContent(
      "1 × Collardeperlascultivadasconcierredeoroyplata"
    );
    expect(line?.firstElementChild).toHaveClass("min-w-0", "wrap-anywhere");
    expect(line?.lastElementChild).toHaveClass("shrink-0");
  });

  test("says what happens next, at the masked phone", () => {
    setup();

    expect(
      screen.getByText(
        "The store will write to you at +598 ••• ••• 456 to arrange payment and delivery. Keep this link: it shows how your order is going."
      )
    ).toBeVisible();
  });

  test.each([
    ["en", "received", "Received: the store will pack it"],
    ["en", "packed", "Packed: ready to deliver"],
    ["en", "delivered", "Delivered"],
    [
      "en",
      "undeliverable",
      "Could not be delivered: the store will write to you",
    ],
    ["es", "received", "Recibido: la tienda lo va a preparar"],
    ["es", "packed", "Preparado: listo para entregar"],
    ["es", "delivered", "Entregado"],
    ["es", "undeliverable", "No se pudo entregar: la tienda te va a escribir"],
  ] as const satisfies readonly (readonly [Locale, OrderStatus, string])[])(
    "in %s, an order %s reads %j",
    (locale, status, label) => {
      setup({ locale, order: makeOrder({ status }) });
      const shown = screen.getByTestId("store-order-status");

      expect(shown).toHaveTextContent(new RegExp(`^${label}$`, "u"));
      expect(shown).toHaveAttribute("data-status", status);
    }
  );

  test("shows the shopper's note, line breaks kept", () => {
    setup({ order: makeOrder({ note: "Sin bolsa\nDespués de las 18" }) });

    expect(
      screen.getByRole("heading", { level: 2, name: "Your note" })
    ).toBeVisible();
    expect(screen.getByText(/^Sin bolsa\s+Después de las 18$/u)).toHaveClass(
      "whitespace-pre-line"
    );
  });

  test("shows no note section when there is none", () => {
    setup();

    expect(screen.queryByRole("heading", { name: "Your note" })).toBeNull();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)
    ).toEqual(["What you ordered"]);
  });

  test("links to the store's WhatsApp in a new tab, and says so", () => {
    setup({ whatsappHref: WHATSAPP });

    const link = screen.getByRole("link", {
      name: "Write to the store (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", WHATSAPP);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // A convenience, so the second look: an outlined pill.
    expect(link).toHaveAttribute("data-slot", "store-button");
    expect(link).toHaveAttribute("data-variant", "outline");
  });

  test("offers no WhatsApp link when the store has none", () => {
    setup();

    expect(
      within(screen.getByTestId("store-order-actions"))
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual(["Keep browsing the store"]);
  });

  test("centers its buttons, each on its own line, the way back last", () => {
    setup({ whatsappHref: WHATSAPP });

    const actions = screen.getByTestId("store-order-actions");
    expect(actions).toHaveClass("flex-col", "items-center");
    expect(actions).not.toHaveClass("sm:flex-row");
    expect(actions.lastElementChild).toHaveTextContent(
      "Keep browsing the store"
    );
  });

  test.each([
    ["received", "Order status: Received"],
    ["undeliverable", "Order status: Couldn't deliver"],
  ] as const)(
    "shows a %s order's steps read only: across on a computer, down on a phone above the buttons",
    (status, name) => {
      setup({ order: makeOrder({ status }) });

      const steppers = screen.getAllByRole("list", { name });
      const [wide, narrow] = steppers.map((list) => list.parentElement);

      expect(steppers).toHaveLength(2);
      expect(wide).toHaveClass("hidden", "md:block");
      expect(narrow).toHaveClass("md:hidden");
      expect(
        screen
          .getByTestId("store-order-banner")
          .compareDocumentPosition(required(wide))
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(
        required(narrow).compareDocumentPosition(
          screen.getByTestId("store-order-actions")
        )
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      for (const list of steppers) {
        expect(within(list).queryAllByRole("button")).toEqual([]);
      }
    }
  );

  test("sets the festive band apart after the order, with its pause", () => {
    setup();

    const band = document.querySelector('[data-slot="store-article-band"]');

    expect(band).toHaveClass("my-6", "md:my-10");
    expect(band).toHaveTextContent("Happy Holidays!");
    expect(
      screen
        .getByTestId("store-order-actions")
        .compareDocumentPosition(required(band))
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  test("under the band, a row of one category's articles to order again, leading to its page", () => {
    setup({
      again: {
        articles: [makeArticle(7), makeArticle(8)],
        href: "/en/aros",
        name: "Earrings",
      },
    });

    const row = screen.getByRole("region", {
      name: "Order as often as you like",
    });
    expect(
      within(row)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(["Artículo 7", "Artículo 8"]);
    expect(
      within(row).getByRole("link", { name: "Artículo 7" })
    ).toHaveAttribute("href", "/en/productos/articulo-7");
    expect(
      screen.getByRole("link", { name: "See all: Earrings" })
    ).toHaveAttribute("href", "/en/aros");
    expect(
      document
        .querySelector('[data-slot="store-article-band"]')
        ?.compareDocumentPosition(row)
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  test.each([
    ["no category to show", null],
    [
      "a category whose articles are gone",
      { articles: [], href: "/aros", name: "Aros" },
    ],
  ])("shows no row for %s", (_case, again) => {
    setup({ again });

    expect(
      document.querySelector('[data-slot="store-article-row"]')
    ).not.toBeInTheDocument();
  });

  test.each([
    ["en", "Keep browsing the store", "/en/products"],
    ["es", "Seguir mirando la tienda", "/products"],
  ] as const)("in %s, %j goes back to the catalog", (locale, name, href) => {
    setup({ locale });

    const link = screen.getByRole("link", { name });
    expect(link).toHaveAttribute("href", href);
    // The page's one next step: the primary pill.
    expect(link).toHaveAttribute("data-slot", "store-button");
    expect(link).toHaveAttribute("data-variant", "primary");
  });

  test("speaks Spanish on a Spanish page", () => {
    const { items, total } = setup({
      locale: "es",
      order: makeOrder({ note: "Sin bolsa" }),
      whatsappHref: WHATSAPP,
    });

    expect(screen.getByTestId("store-order-banner")).toHaveTextContent(
      "¡Recibimos tu pedido!Tu código de pedidoK7M2Q"
    );
    expect(items()).toEqual([
      "2 × Collar de perlas$ 2.500",
      "1 × Aros dorados$ 500,50",
    ]);
    expect(total()).toBe("Total$ 3.000,50");
    expect(
      screen.getByText(
        "La tienda te va a escribir al +598 ••• ••• 456 para coordinar el pago y la entrega. Guardá este enlace: acá ves cómo va tu pedido."
      )
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Tu nota" })).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: "Escribirle a la tienda (se abre en otra pestaña)",
      })
    ).toHaveAttribute("href", WHATSAPP);
  });
});
