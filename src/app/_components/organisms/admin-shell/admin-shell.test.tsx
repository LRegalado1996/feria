import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, test, vi } from "vitest";

import { AdminPage } from "@/app/_components/molecules/admin-page";
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
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const LOGIN = { email: "ada@example.com", name: "Ada Admin" };

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
      login={LOGIN}
      section={section}
    >
      {/* A page, as every admin page renders one: its top bar has the
          menu button. */}
      <AdminPage title="Section title">
        <p>Section content</p>
      </AdminPage>
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
  const links = (scope: HTMLElement, name: string) =>
    within(within(scope).getByRole("navigation", { name }))
      .getAllByRole("link")
      .map((link) => [
        spoken(link),
        link.getAttribute("href"),
        link.getAttribute("aria-current"),
      ]);

  return {
    assign,
    banner: () => screen.getByRole("banner"),
    links,
    openMenu: async () => {
      await user.click(
        screen.getByRole("button", { name: locale === "en" ? "Menu" : "Menú" })
      );
      return await screen.findByRole("dialog");
    },
    user,
  };
}

describe("AdminShell", () => {
  test("renders the page in the main landmark the skip link targets, on the grey canvas", () => {
    setup();

    const main = screen.getByRole("main");
    expect(within(main).getByText("Section content")).toBeInTheDocument();
    // The frame's own id (FER-064), never a fixed one.
    expect(main.id).not.toBe("");
    expect(
      screen.getByRole("link", { name: "Skip to content" })
    ).toHaveAttribute("href", `#${main.id}`);
    const shell = screen.getByTestId("admin-shell");
    expect(shell).toHaveAttribute("data-slot", "admin-frame");
    expect(shell).toHaveClass("bg-sidebar");
  });

  test("from md up, sets the sections in a sidebar the window's height beside the page", () => {
    const { banner } = setup();

    expect(screen.getByTestId("admin-shell")).toHaveClass(
      "md:grid",
      "md:grid-cols-[16rem_minmax(0,1fr)]"
    );
    // Hidden on a phone, where the menu panel shows the same.
    expect(banner()).toHaveClass("hidden", "md:block", "sticky", "h-dvh");
  });

  test("tops the sidebar with the full logo: the tag, LR and MARKET", () => {
    const { banner } = setup();

    const logo = within(banner()).getByRole("img", { name: "LR Market" });
    expect(logo).toHaveAttribute("data-variant", "full");
    // Its minimum size, with its clear space around it.
    expect(logo).toHaveClass("h-24");
    expect(logo.parentElement).toHaveClass("p-6");
  });

  test.each([
    [
      "en",
      "Admin sections",
      [
        ["Orders", "/en/admin/orders", null],
        ["Articles", "/en/admin/products", null],
        ["Categories", "/en/admin/categories", "page"],
        ["Filters", "/en/admin/filters", null],
        ["Pages", "/en/admin/pages", null],
        ["Settings", "/en/admin/settings", null],
        ["Users", "/en/admin/users", null],
        ["Metrics", "/en/admin/metrics", null],
      ],
    ],
    [
      "es",
      "Secciones del panel",
      [
        ["Pedidos", "/admin/orders", null],
        ["Artículos", "/admin/products", null],
        ["Categorías", "/admin/categories", "page"],
        ["Filtros", "/admin/filters", null],
        ["Páginas", "/admin/pages", null],
        ["Ajustes", "/admin/settings", null],
        ["Usuarios", "/admin/users", null],
        ["Métricas", "/admin/metrics", null],
      ],
    ],
  ] as const)(
    "in %s, lists the eight sections, the orders first, the one on screen current",
    (locale, name, expected) => {
      const { banner, links } = setup({ locale, section: "categories" });

      expect(links(banner(), name)).toEqual(expected);
    }
  );

  test("gives each section its own icon, for the eye only", () => {
    const { banner } = setup();

    const icons = within(within(banner()).getByRole("navigation"))
      .getAllByRole("link")
      .map((link) => link.querySelector("svg"));
    expect(icons.map((icon) => icon?.getAttribute("aria-hidden"))).toEqual(
      Array.from({ length: 8 }, () => "true")
    );
    // One drawing per section, none shared.
    const drawings = icons.map((icon) =>
      [...(icon?.classList ?? [])].find(
        (name) => name.startsWith("lucide-") && name !== "lucide-icon"
      )
    );
    expect(new Set(drawings).size).toBe(8);
    expect(drawings).not.toContain(undefined);
  });

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

  test("ends the sidebar with the signed-in login, the language, the theme and sign-out", () => {
    const { banner } = setup();

    const account = within(banner()).getByTestId("admin-account");
    expect(
      [...account.querySelectorAll("p")].map((line) => line.textContent)
    ).toEqual(["Signed in as", "Ada Admin", "ada@example.com"]);
    expect(
      within(account).getByRole("link", { name: "Español" })
    ).toHaveAttribute("href", "/admin");
    expect(within(account).getByTestId("theme-toggle")).toBeInTheDocument();
    expect(
      within(account).getByRole("button", { name: "Sign out" })
    ).toBeInTheDocument();
  });

  test("speaks Spanish in its own chrome", () => {
    const { banner } = setup({ locale: "es" });

    expect(
      screen.getByRole("link", { name: "Saltar al contenido" })
    ).toHaveAttribute("href", `#${screen.getByRole("main").id}`);
    expect(
      within(banner()).getByRole("button", { name: "Cerrar sesión" })
    ).toBeInTheDocument();
    expect(within(banner()).getByText("Sesión iniciada como")).toHaveClass(
      "sr-only"
    );
  });

  test.each([
    ["en", "Sign out", "/en/admin/sign-in"],
    ["es", "Cerrar sesión", "/admin/sign-in"],
  ] as const)(
    "in %s, signs out to the admin's sign-in in that language",
    async (locale, name, landing) => {
      const { assign, banner, user } = setup({ locale });

      await user.click(within(banner()).getByRole("button", { name }));

      await waitFor(() => {
        expect(assign).toHaveBeenCalledExactlyOnceWith(landing);
      });
    }
  );

  test("on a phone, the page's menu button opens the same sidebar as a panel", async () => {
    const { links, openMenu } = setup({ section: "orders" });

    const panel = await openMenu();

    expect(
      within(panel).getByRole("img", { name: "LR Market" })
    ).toHaveAttribute("data-variant", "full");
    expect(links(panel, "Admin sections")[0]).toEqual([
      "Orders",
      "/en/admin/orders",
      "page",
    ]);
    expect(
      within(within(panel).getByTestId("admin-account")).getByText(
        "ada@example.com"
      )
    ).toBeInTheDocument();
  });
});
