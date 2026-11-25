import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { NavigationCategory } from "@/lib/catalog/navigation";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { createQueryWrapper } from "@/test/setup-helpers";

import { type StoreAnnouncement, StoreFrame } from "./store-frame";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

/** A promise the test resolves when it wants, as a stream would. */
function deferred<T>() {
  let release: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });

  return {
    promise,
    /** Resolves it, and lets React show what was waiting on it. */
    settle: async (value: T) => {
      await act(async () => {
        release(value);
        await promise;
      });
    },
  };
}

async function setup({
  announcement,
  categories,
}: {
  announcement?: Promise<StoreAnnouncement | null>;
  categories?: Promise<readonly NavigationCategory[]>;
} = {}) {
  // Awaited: a render that suspends only resumes inside an awaited act.
  await act(async () => {
    renderWithI18n(
      <StoreFrame
        announcement={announcement}
        categories={categories}
        copy={DICTIONARIES.es.storefront.shell}
        currentPath="/productos"
        locale="es"
      >
        <main>Contenido</main>
      </StoreFrame>,
      // The cart's side panel reads the shop through the query client.
      { locale: "es", wrapper: createQueryWrapper() }
    );
    await Promise.resolve();
  });

  return {
    bar: () => screen.queryByTestId("store-announcement-bar"),
    frame: document.querySelector('[data-slot="store-frame"]'),
    header: screen.getByTestId("store-header"),
    main: screen.getByTestId("store-main"),
    user: userEvent.setup(),
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("StoreFrame", () => {
  test("puts the page under the header, in the content the skip link leads to", async () => {
    const { frame, header, main } = await setup();

    // An id of the frame's own (FER-064), the one its skip link leads to.
    expect(main.id).not.toBe("");
    expect(
      within(header).getByRole("link", { name: "Saltar al contenido" })
    ).toHaveAttribute("href", `#${main.id}`);
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(within(main).getByRole("main")).toHaveTextContent("Contenido");
    expect(frame?.firstElementChild).toBe(header);
    expect(header.nextElementSibling).toBe(main);
  });

  test("without words for the bar, has no bar", async () => {
    const { bar } = await setup();

    expect(bar()).toBeNull();
  });

  test("holds the bar's place empty while its words stream in, then shows them above the header", async () => {
    const words = deferred<StoreAnnouncement | null>();
    const { bar, header } = await setup({ announcement: words.promise });

    expect(bar()).toHaveAttribute("data-placeholder", "true");
    expect(bar()?.nextElementSibling).toBe(header);

    await words.settle({
      lang: "es",
      short: "Feria Paseo Prado · Puesto 86",
      text: "Te esperamos en la Feria Paseo Prado, puesto 86",
    });

    expect(bar()).toHaveAttribute("data-placeholder", "false");
    expect(
      bar()?.querySelector('[data-slot="store-announcement-bar-full"]')
    ).toHaveTextContent("Te esperamos en la Feria Paseo Prado, puesto 86");
    expect(
      bar()?.querySelector('[data-slot="store-announcement-bar-short"]')
    ).toHaveTextContent("Feria Paseo Prado · Puesto 86");
    expect(bar()?.querySelector("p")).toHaveAttribute("lang", "es");
    expect(bar()?.nextElementSibling).toBe(header);
  });

  test("makes the bar's words a link when the announcement has one (FER-020)", async () => {
    const words = deferred<StoreAnnouncement | null>();
    const { bar } = await setup({ announcement: words.promise });

    await words.settle({
      href: "/productos",
      lang: "es",
      text: "Encontranos en la feria, del 5/12 al 5/1",
    });

    expect(
      within(bar() ?? document.body).getByRole("link", {
        name: "Encontranos en la feria, del 5/12 al 5/1",
      })
    ).toHaveAttribute("href", "/productos");
  });

  test("leaves the bar out when the store has nothing to say", async () => {
    const words = deferred<StoreAnnouncement | null>();
    const { bar } = await setup({ announcement: words.promise });

    await words.settle(null);

    expect(bar()).toBeNull();
  });

  test("hands the header its categories and the page it is on", async () => {
    const categories = deferred<readonly NavigationCategory[]>();
    await setup({ categories: categories.promise });

    await categories.settle([
      {
        id: 1,
        lang: "es",
        name: "Anillos",
        parentId: null,
        path: "/anillos",
        slug: "anillos",
      },
    ]);

    const nav = within(
      screen.getByRole("navigation", { name: "Secciones de la tienda" })
    );
    expect(nav.getByRole("link", { name: "Anillos" })).toHaveAttribute(
      "href",
      "/anillos"
    );
    expect(nav.getByRole("link", { name: "Catálogo" })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("holds the cart's side panel, which the header's cart opens and closes back to it", async () => {
    const { user } = await setup();
    const cart = screen.getByRole("link", { name: "Carrito, vacío" });

    await user.click(cart);

    const panel = screen.getByRole("dialog", { name: "Tu carrito" });
    expect(panel).toHaveAttribute("data-testid", "store-cart-panel");
    expect(within(panel).getByText("Tu carrito está vacío.")).toBeVisible();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByTestId("store-cart-panel")).toBeNull();
    });
    expect(cart).toHaveFocus();
  });
});
