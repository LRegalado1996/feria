import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, test, vi } from "vitest";

import type { AdminSection } from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { server } from "@/test/msw";

import { AdminShell } from "./admin-shell";

// The badge polls the API and has its own tests; here it only says the
// label, as the real one names the link.
vi.mock("@/app/_components/molecules/orders-pending-badge", () => ({
  OrdersPendingBadge: ({ label }: { label: string }) => (
    <span data-testid="orders-pending-badge">{label}</span>
  ),
}));

// The language toggle reads the URL, which exists only inside a Next render.
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

function setup({
  locale = "en",
  section = "products",
}: {
  locale?: Locale;
  section?: AdminSection;
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
      section={section}
    >
      <p>Section content</p>
    </AdminShell>,
    { locale }
  );

  // What a screen reader hears of a link: its text without the parts
  // hidden from it (the orders label, which the badge says instead).
  const spoken = (link: HTMLElement) => {
    const copy = link.cloneNode(true);
    if (!(copy instanceof HTMLElement)) {
      return null;
    }
    for (const hidden of copy.querySelectorAll("[aria-hidden='true']")) {
      hidden.remove();
    }
    return copy.textContent;
  };
  const links = (name: string) =>
    within(screen.getByRole("navigation", { name }))
      .getAllByRole("link")
      .map((link) => [
        spoken(link),
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
        ["Articles", "/en/admin/products", null],
        ["Categories", "/en/admin/categories", null],
        ["Filters", "/en/admin/filters", null],
        ["Orders", "/en/admin/orders", "page"],
        ["Home", "/en/admin/home", null],
        ["Settings", "/en/admin/settings", null],
        ["Users", "/en/admin/users", null],
        ["Metrics", "/en/admin/metrics", null],
      ],
    ],
    [
      "es",
      "Secciones del panel",
      [
        ["Artículos", "/admin/products", null],
        ["Categorías", "/admin/categories", null],
        ["Filtros", "/admin/filters", null],
        ["Pedidos", "/admin/orders", "page"],
        ["Inicio", "/admin/home", null],
        ["Ajustes", "/admin/settings", null],
        ["Usuarios", "/admin/users", null],
        ["Métricas", "/admin/metrics", null],
      ],
    ],
  ] as const)(
    "in %s, lists the eight sections, the one on screen current",
    (locale, name, expected) => {
      const { links } = setup({ locale, section: "orders" });

      expect(links(name)).toEqual(expected);
    }
  );

  test("has one navigation, the same for every login: no platform area", () => {
    setup({ section: "metrics" });

    expect(
      screen
        .getAllByRole("navigation")
        .map((nav) => nav.getAttribute("aria-label"))
    ).toEqual(["Admin sections"]);
    expect(screen.queryByText("Platform")).not.toBeInTheDocument();
  });

  test("shows the orders still to pack inside the orders link, and in no other", () => {
    setup({ section: "categories" });

    const badges = screen.getAllByTestId("orders-pending-badge");
    expect(badges.map((badge) => badge.textContent)).toEqual(["Orders"]);
    expect(screen.getByRole("link", { name: "Orders" })).toContainElement(
      badges[0] ?? null
    );
  });

  test("keeps the banner to the logo and the controls: no store to name", () => {
    setup();

    const banner = screen.getByRole("banner");
    expect(
      within(banner).getByRole("img", { name: "LR Market" })
    ).toBeInTheDocument();
    expect(
      [...banner.querySelectorAll("p")].map((line) => line.textContent)
    ).toEqual([]);
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
