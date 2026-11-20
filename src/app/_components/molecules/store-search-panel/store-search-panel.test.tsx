import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import { SEARCH_MAX_LENGTH } from "@/lib/schemas/catalog";
import { createI18nWrapper, DICTIONARIES, renderWithI18n } from "@/test/i18n";
import { required } from "@/test/required";

import { StoreSearchPanel } from "./store-search-panel";

const { push } = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function setup({ locale = "es" }: { locale?: "en" | "es" } = {}) {
  const user = userEvent.setup();
  const copy = DICTIONARIES[locale].storefront.shell;
  renderWithI18n(
    <header className="relative">
      <StoreSearchPanel className="custom" copy={copy} locale={locale} />
    </header>,
    { locale }
  );
  const trigger = screen.getByRole("button", { name: copy.search });

  return {
    copy,
    open: async () => {
      await user.click(trigger);
      return screen.getByRole("dialog", { name: copy.search });
    },
    panel: () => screen.queryByTestId("store-search-panel"),
    trigger,
    user,
  };
}

describe("StoreSearchPanel", () => {
  test("is closed at first, behind an icon button named after the search", () => {
    const { panel, trigger } = setup();

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("data-variant", "contrast");
    expect(trigger).toHaveClass("custom", "size-11");
    expect(panel()).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  test.each([
    ["es", "Buscar artículos", "Buscá lo que quieras", "/productos"],
    ["en", "Search articles", "Search for anything", "/en/productos"],
  ] as const)(
    "in %s opens a dark panel with one field, %j, focused, that searches the catalog at %s",
    async (locale, label, placeholder, action) => {
      const { open, trigger } = setup({ locale });

      const dialog = await open();

      const field = within(dialog).getByRole("searchbox", { name: label });
      expect(field).toHaveFocus();
      expect(field).toHaveAttribute("placeholder", placeholder);
      expect(field).toHaveAttribute("name", "q");
      expect(field).toHaveAttribute("maxLength", String(SEARCH_MAX_LENGTH));
      expect(within(dialog).getByTestId("store-search-form")).toHaveAttribute(
        "action",
        action
      );
      expect(screen.getByTestId("store-search-panel")).toHaveClass(
        "bg-store-contrast",
        "top-full"
      );
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    }
  );

  test("a search opens the catalog with it, without a reload, and closes the panel", async () => {
    push.mockClear();
    const { open, panel, trigger, user } = setup();
    const dialog = await open();

    await user.type(within(dialog).getByRole("searchbox"), "  anillo dorado ");
    await user.keyboard("{Enter}");

    expect(push).toHaveBeenCalledExactlyOnceWith("/productos?q=anillo+dorado");
    await waitFor(() => {
      expect(panel()).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  test("the arrow sends it too, in English to the English catalog", async () => {
    push.mockClear();
    const { open, user } = setup({ locale: "en" });
    const dialog = await open();

    await user.type(within(dialog).getByRole("searchbox"), "ring");
    await user.click(within(dialog).getByRole("button", { name: "Search" }));

    expect(push).toHaveBeenCalledExactlyOnceWith("/en/productos?q=ring");
  });

  test("an empty search opens the whole catalog", async () => {
    push.mockClear();
    const { open, user } = setup();
    const dialog = await open();

    await user.type(within(dialog).getByRole("searchbox"), "   ");
    await user.keyboard("{Enter}");

    expect(push).toHaveBeenCalledExactlyOnceWith("/productos");
  });

  test("Escape closes it and gives focus back to the icon", async () => {
    const { open, panel, trigger, user } = setup();
    await open();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(panel()).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  test("its close button closes it", async () => {
    const { copy, open, panel, user } = setup();
    const dialog = await open();

    await user.click(
      within(dialog).getByRole("button", { name: copy.searchClose })
    );

    await waitFor(() => {
      expect(panel()).toBeNull();
    });
  });

  test("before the script runs, the icon opens the browser's own panel, a plain form that searches the catalog", () => {
    const copy = DICTIONARIES.es.storefront.shell;
    const Wrapper = createI18nWrapper("es");
    const host = document.createElement("div");

    host.innerHTML = renderToString(
      <Wrapper>
        <StoreSearchPanel copy={copy} locale="es" />
      </Wrapper>
    );

    const plain = required(host.querySelector("[popover]"));
    expect(plain).toHaveAttribute("popover", "auto");
    expect(plain).toHaveAttribute("data-testid", "store-search-plain");
    expect(plain.id).not.toBe("");
    expect(
      host.querySelector('[data-testid="store-search-button"]')
    ).toHaveAttribute("popovertarget", plain.id);
    // It closes without a script too.
    const close = required(
      plain.querySelector(`[aria-label="${copy.searchClose}"]`)
    );
    expect(close).toHaveAttribute("popovertarget", plain.id);
    expect(close).toHaveAttribute("popovertargetaction", "hide");
    const form = required(plain.querySelector("form"));
    expect(form).toHaveAttribute("action", "/productos");
    expect(form).toHaveAttribute("method", "get");
    const field = required(plain.querySelector("input"));
    expect(field).toHaveAttribute("name", "q");
    expect(field).toHaveAttribute("type", "search");
    expect(required(plain.querySelector("label"))).toHaveAttribute(
      "for",
      field.id
    );
  });

  test("once React owns the page, the icon opens the dialog, and the plain panel's form loads the catalog itself", () => {
    push.mockClear();
    const { trigger } = setup({ locale: "en" });
    const plain = screen.getByTestId("store-search-plain");

    expect(trigger).not.toHaveAttribute("popovertarget");
    expect(plain).toHaveAttribute("popover", "auto");
    expect(
      within(plain).getByTestId("store-search-plain-form")
    ).toHaveAttribute("action", "/en/productos");
    // A visitor who opened it before React took over still searches: the
    // browser submits it, no router push.
    fireEvent.submit(within(plain).getByTestId("store-search-plain-form"));
    expect(push).not.toHaveBeenCalled();
  });

  test("the dialog takes over from a plain panel opened before React did", async () => {
    const { open } = setup();
    const hidePopover = vi.fn<() => void>();
    Object.assign(screen.getByTestId("store-search-plain"), { hidePopover });

    await open();

    expect(hidePopover).toHaveBeenCalledOnce();
  });

  test("keeps the keyboard inside while open", async () => {
    const { copy, open, user } = setup();
    const dialog = await open();

    await user.tab();
    expect(
      within(dialog).getByRole("button", { name: copy.searchSubmit })
    ).toHaveFocus();
    await user.tab();
    expect(
      within(dialog).getByRole("button", { name: copy.searchClose })
    ).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole("searchbox")).toHaveFocus();
  });
});
