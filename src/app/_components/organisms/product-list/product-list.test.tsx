import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { ProductListItem } from "@/app/_components/molecules/product-list-row";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { ProductList } from "./product-list";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const CURSOR = { id: 8, updatedAt: "2026-11-15T09:38:00.000Z" };

function makeItem(
  id: number,
  overrides: Partial<ProductListItem> = {}
): ProductListItem {
  return {
    category: { id: 4, nameEn: "Rings", nameEs: "Anillos" },
    cover: null,
    id,
    isAvailable: true,
    priceAmount: 129_000,
    slug: `articulo-${id}`,
    status: "published",
    title: `Artículo ${id}`,
    titleLang: "es",
    updatedAt: new Date(`2026-11-15T09:3${id}:00.000Z`),
    ...overrides,
  };
}

function makePage(
  items: ProductListItem[],
  nextCursor: typeof CURSOR | null = null
) {
  return { currencyCode: "UYU", items, nextCursor };
}

const REFUSAL = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

/**
 * The list over `product.list`, answering `first` without a cursor and
 * `next` with one; or refusing the first read when `refusesFirst`.
 */
function setup({
  first = makePage([makeItem(9), makeItem(8)]),
  locale = "en",
  next = makePage([makeItem(3)]),
  refusesFirst = false,
}: {
  first?: ReturnType<typeof makePage>;
  locale?: Locale;
  next?: ReturnType<typeof makePage>;
  refusesFirst?: boolean;
} = {}) {
  const list = vi.fn((input: unknown) =>
    typeof input === "object" && input !== null && "cursor" in input
      ? next
      : first
  );
  server.use(
    refusesFirst
      ? createOrpcErrorHandler("product.list", REFUSAL)
      : createOrpcHandler("product.list", list)
  );
  renderWithI18n(<ProductList />, { locale, wrapper: createQueryWrapper() });

  return {
    /** From now on the server answers every read. */
    heal: () => {
      server.use(createOrpcHandler("product.list", list));
    },
    list,
    /** From now on the server refuses every read. */
    refuse: () => {
      server.use(createOrpcErrorHandler("product.list", REFUSAL));
    },
    rows: () =>
      within(screen.getByTestId("product-list-rows"))
        .getAllByRole("link")
        .map((link) => link.textContent),
    user: userEvent.setup(),
  };
}

describe("ProductList", () => {
  test("holds the list's place with a skeleton until the first page arrives", async () => {
    setup();

    expect(screen.getByTestId("product-list-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(await screen.findByTestId("product-list-rows")).toBeVisible();
    expect(screen.queryByTestId("product-list-skeleton")).toBeNull();
  });

  test("lists each article as a link to its wizard, the newest change first", async () => {
    const { list } = setup();

    await screen.findByTestId("product-list-rows");

    expect(
      within(screen.getByTestId("product-list-rows"))
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
    ).toEqual(["/en/admin/products/9", "/en/admin/products/8"]);
    expect(list).toHaveBeenCalledExactlyOnceWith({});
  });

  test.each([
    ["es", "Nuevo artículo", "/admin/products/new"],
    ["en", "New article", "/en/admin/products/new"],
  ] as const)(
    "in %s, its main action is %s, leading to %s",
    async (locale, name, href) => {
      setup({ locale });

      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
      await screen.findByTestId("product-list-rows");
    }
  );

  test.each([
    ["es", "Artículos", "Artículo 9", "Anillos"],
    ["en", "Articles", "Artículo 9", "Rings"],
  ] as const)(
    "in %s, is titled %s and names each article and its category",
    async (locale, title, article, category) => {
      setup({ locale });

      const row = await screen.findByTestId("product-row-9");

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        title
      );
      expect(row).toHaveTextContent(article);
      expect(row).toHaveTextContent(category);
    }
  );

  test.each([
    [
      "es",
      "Todavía no hay artículos. Empezá por las fotos: en un minuto queda publicado.",
    ],
    [
      "en",
      "No articles yet. Start with the photos: it is published in a minute.",
    ],
  ] as const)(
    "in %s, says so when there is no article",
    async (locale, message) => {
      setup({ first: makePage([]), locale });

      expect(await screen.findByTestId("empty-state")).toHaveTextContent(
        message
      );
      expect(screen.queryByTestId("product-list-rows")).toBeNull();
    }
  );

  test("says a failed read in an alert, and reads again on retry", async () => {
    const { heal, user } = setup({ refusesFirst: true });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the articles.");
    expect(screen.queryByTestId("empty-state")).toBeNull();

    heal();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("product-list-rows")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("loads the next page from the last one's cursor, focusing its first row, and stops at the end", async () => {
    const { list, rows, user } = setup({
      first: makePage([makeItem(9), makeItem(8)], CURSOR),
    });
    const more = await screen.findByRole("button", { name: "Load more" });

    await user.click(more);

    await waitFor(() => {
      expect(rows()).toHaveLength(3);
    });
    expect(list).toHaveBeenLastCalledWith({ cursor: CURSOR });
    expect(
      screen.getByTestId("product-row-3").querySelector("a")
    ).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  test("offers no next page when the server says there is none", async () => {
    setup();

    await screen.findByTestId("product-list-rows");

    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  test("says a failed next page under the list and keeps the rows it has", async () => {
    const { refuse, rows, user } = setup({
      first: makePage([makeItem(9), makeItem(8)], CURSOR),
    });
    const more = await screen.findByRole("button", { name: "Load more" });

    refuse();
    await user.click(more);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load more articles."
    );
    expect(rows()).toHaveLength(2);
    expect(screen.queryByText("We couldn't load the articles.")).toBeNull();
  });

  test("waits on a next page already on its way instead of asking twice", async () => {
    const { user } = setup({
      first: makePage([makeItem(9), makeItem(8)], CURSOR),
    });
    const more = await screen.findByRole("button", { name: "Load more" });
    let answer = (): void => undefined;
    const nextReads = vi.fn(async (_input: unknown) => {
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      return makePage([makeItem(3)]);
    });
    server.use(createOrpcHandler("product.list", nextReads));

    await user.click(more);
    await waitFor(() => {
      expect(more).toHaveAttribute("aria-disabled", "true");
    });
    expect(more).toHaveTextContent("Loading…");
    await user.click(more);
    answer();

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    });
    expect(nextReads).toHaveBeenCalledExactlyOnceWith({ cursor: CURSOR });
  });
});
