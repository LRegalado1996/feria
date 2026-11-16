import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { UserRole } from "@/lib/schemas/access";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { server } from "@/test/msw";

import { AdminShell, type AdminLocation } from "./admin-shell";

// The language toggle reads the URL, which exists only inside a Next render.
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

const LR_MARKET = { name: "LR Market", slug: "lr-market" };
const SAMPLE = { name: "Sample Store", slug: "sample-store" };

function inStore(
  section: Extract<AdminLocation, { kind: "store" }>["section"] = "products"
): AdminLocation {
  return { kind: "store", section, store: LR_MARKET };
}

function setup({
  locale = "en",
  location = inStore(),
  role = "member",
  stores = [LR_MARKET],
}: {
  locale?: Locale;
  location?: AdminLocation;
  role?: UserRole;
  stores?: { name: string; slug: string }[];
} = {}) {
  server.use(
    http.post("*/api/auth/sign-out", () => HttpResponse.json({ success: true }))
  );
  const assign = vi
    .spyOn(window.location, "assign")
    .mockImplementation(() => undefined);
  const user = userEvent.setup();

  renderWithI18n(
    <AdminShell
      dictionary={DICTIONARIES[locale].admin}
      locale={locale}
      location={location}
      role={role}
      stores={stores}
    >
      <p>Section content</p>
    </AdminShell>,
    { locale }
  );

  const links = (name: string) =>
    within(screen.getByRole("navigation", { name }))
      .getAllByRole("link")
      .map((link) => [
        link.textContent,
        link.getAttribute("href"),
        link.getAttribute("aria-current"),
      ]);

  return { assign, links, user };
}

describe("AdminShell", () => {
  test("renders its children in the main landmark the skip link targets", () => {
    setup();

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "admin-main");
    expect(main).toHaveTextContent(/^Section content$/);
    expect(
      screen.getByRole("link", { name: "Skip to content" })
    ).toHaveAttribute("href", "#admin-main");
    expect(screen.getByTestId("admin-shell")).toHaveAttribute(
      "data-slot",
      "admin-shell"
    );
  });

  test.each([
    [
      "en",
      "Admin sections",
      [
        ["Articles", "/en/admin/lr-market/products", null],
        ["Categories", "/en/admin/lr-market/categories", null],
        ["Orders", "/en/admin/lr-market/orders", "page"],
        ["Home", "/en/admin/lr-market/home", null],
        ["Settings", "/en/admin/lr-market/settings", null],
        ["Users", "/en/admin/lr-market/users", null],
      ],
    ],
    [
      "es",
      "Secciones del panel",
      [
        ["Artículos", "/admin/lr-market/products", null],
        ["Categorías", "/admin/lr-market/categories", null],
        ["Pedidos", "/admin/lr-market/orders", "page"],
        ["Inicio", "/admin/lr-market/home", null],
        ["Ajustes", "/admin/lr-market/settings", null],
        ["Usuarios", "/admin/lr-market/users", null],
      ],
    ],
  ] as const)(
    "in %s, lists the store's six sections, the one on screen current",
    (locale, name, expected) => {
      const { links } = setup({ locale, location: inStore("orders") });

      expect(links(name)).toEqual(expected);
    }
  );

  test("titles the store's navigation with the store's name", () => {
    setup();

    expect(
      screen.getByRole("navigation", { name: "Admin sections" })
    ).toHaveTextContent(/^LR Market/);
  });

  test("shows a member no platform navigation", () => {
    setup({ role: "member" });

    expect(
      screen.queryByRole("navigation", { name: "Platform sections" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Platform")).not.toBeInTheDocument();
  });

  test.each([
    [
      "en",
      "Platform sections",
      [
        ["Stores", "/en/admin/platform/stores", null],
        ["Users", "/en/admin/platform/users", "page"],
        ["Metrics", "/en/admin/platform/metrics", null],
      ],
    ],
    [
      "es",
      "Secciones de la plataforma",
      [
        ["Tiendas", "/admin/platform/stores", null],
        ["Usuarios", "/admin/platform/users", "page"],
        ["Métricas", "/admin/platform/metrics", null],
      ],
    ],
  ] as const)(
    "in %s, shows a superadmin in the platform its sections, without a store's",
    (locale, name, expected) => {
      const { links } = setup({
        locale,
        location: { kind: "platform", section: "users" },
        role: "superadmin",
      });

      expect(links(name)).toEqual(expected);
      expect(
        screen
          .getAllByRole("navigation")
          .map((nav) => nav.getAttribute("aria-label"))
      ).toEqual([name]);
    }
  );

  test("shows a superadmin in a store both navigations, no platform section current", () => {
    const { links } = setup({ role: "superadmin" });

    expect(links("Admin sections")[0]).toEqual([
      "Articles",
      "/en/admin/lr-market/products",
      "page",
    ]);
    expect(links("Platform sections").map((link) => link[2])).toEqual([
      null,
      null,
      null,
    ]);
  });

  test("shows a member of one store that store's name, without a switcher", () => {
    setup({ location: { kind: "landing" }, stores: [SAMPLE] });

    expect(screen.queryByTestId("store-switcher")).not.toBeInTheDocument();
    expect(screen.getByText("Sample Store")).toHaveTextContent(
      /^Sample Store$/
    );
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  test("shows a member of one store the current store's name in it", () => {
    setup();

    expect(screen.queryByTestId("store-switcher")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByText("LR Market")
    ).toHaveTextContent(/^LR Market$/);
  });

  test("offers a member of several stores the switcher, keeping the section", async () => {
    const { user } = setup({
      location: inStore("settings"),
      stores: [LR_MARKET, SAMPLE],
    });

    await user.click(
      screen.getByRole("button", { name: "Switch store: LR Market" })
    );

    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .map((link) => [
          link.textContent,
          link.getAttribute("href"),
          link.getAttribute("aria-current"),
        ])
    ).toEqual([
      ["LR Market", "/en/admin/lr-market/settings", "page"],
      ["Sample Store", "/en/admin/sample-store/settings", null],
    ]);
  });

  test("offers a superadmin with one store the switcher, opening stores on their articles outside a store", async () => {
    const { user } = setup({
      locale: "es",
      location: { kind: "platform", section: "stores" },
      role: "superadmin",
      stores: [SAMPLE],
    });

    const trigger = screen.getByRole("button", {
      name: "Cambiar de tienda: Tiendas",
    });
    expect(trigger).toHaveTextContent(/^Tiendas$/);

    await user.click(trigger);

    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([["Sample Store", "/admin/sample-store/products"]]);
  });

  test("shows a superadmin with no stores neither a switcher nor a store name", () => {
    setup({
      location: { kind: "platform", section: "stores" },
      role: "superadmin",
      stores: [],
    });

    const banner = screen.getByRole("banner");
    expect(screen.queryByTestId("store-switcher")).not.toBeInTheDocument();
    expect(
      [...banner.querySelectorAll("p")].map((line) => line.textContent)
    ).toEqual([]);
  });

  test("names the only store of a member on the landing in a line of the banner", () => {
    setup({ location: { kind: "landing" }, stores: [SAMPLE] });

    expect(
      [...screen.getByRole("banner").querySelectorAll("p")].map(
        (line) => line.textContent
      )
    ).toEqual(["Sample Store"]);
  });

  test("speaks Spanish in its own chrome", () => {
    setup({ locale: "es" });

    expect(
      screen.getByRole("link", { name: "Saltar al contenido" })
    ).toHaveAttribute("href", "#admin-main");
    expect(
      screen.getByRole("button", { name: "Cerrar sesión" })
    ).toBeInTheDocument();
  });

  test.each([
    ["en", "Sign out", "/en/admin/sign-in"],
    ["es", "Cerrar sesión", "/admin/sign-in"],
  ] as const)(
    "in %s, signs out to the admin's sign-in in that language",
    async (locale, name, landing) => {
      const { assign, user } = setup({ locale });

      await user.click(screen.getByRole("button", { name }));

      await waitFor(() => {
        expect(assign).toHaveBeenCalledExactlyOnceWith(landing);
      });
    }
  );
});
