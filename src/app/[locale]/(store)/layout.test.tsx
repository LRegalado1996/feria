import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";

import type { StoreHeaderProps } from "@/app/_components/organisms/store-header";
import { getDictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";

import * as layoutModule from "./layout";

const { readStore, storeHeader, storeTheme } = vi.hoisted(() => ({
  readStore: vi.fn(),
  storeHeader: vi.fn(),
  storeTheme: vi.fn(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// Nothing here may read the store: the build prerenders this layout, and
// the build has no database.
vi.mock("@/server/cache/store", () => ({ readStore }));

// The header and the theme have their own tests; here they show what the
// layout handed them.
vi.mock("@/app/_components/organisms/store-header", () => ({
  STORE_MAIN_ID: "store-main",
  StoreHeader: (props: StoreHeaderProps) => {
    storeHeader(props);

    return <header data-testid="store-header">{props.locale}</header>;
  },
}));

vi.mock("@/app/_components/organisms/store-theme", () => ({
  StoreTheme: (props: ComponentProps<"div">) => {
    storeTheme(props);

    return <div {...props} />;
  },
}));

const { default: StoreLayout, viewport } = layoutModule;

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

async function setup({ locale = "es" }: { locale?: Locale } = {}) {
  render(
    await StoreLayout({
      children: <p>Page content</p>,
      params: makeParams(locale),
    })
  );

  return {
    header: screen.getByTestId("store-header"),
    main: screen.getByTestId("store-main"),
    theme: screen.getByTestId("store-theme"),
  };
}

describe("StoreLayout", () => {
  test("puts the page under the store's header, in a column the skip link reaches", async () => {
    const { header, main, theme } = await setup();

    expect([...theme.children]).toEqual([header, main]);
    expect(main).toContainElement(screen.getByText("Page content"));
    expect(main).toHaveAttribute("id", "store-main");
    expect(main).toHaveAttribute("tabindex", "-1");
    // Lands below the sticky header when the skip link scrolls to it.
    expect(main).toHaveClass("scroll-mt-16");
    // A column that fills the page: a page's footer sits at its bottom.
    expect(main).toHaveClass("flex", "flex-1", "flex-col");
  });

  test("wraps everything in the store's theme, a full-height column, and hands it no colors: they are code", async () => {
    await setup();

    expect(storeTheme).toHaveBeenCalledExactlyOnceWith({
      children: expect.anything(),
      className: "flex min-h-dvh flex-col",
      "data-testid": "store-theme",
    });
  });

  test.each(["es", "en"] as const)(
    "hands the header the shell's %s words and the language of the URL",
    async (locale) => {
      await setup({ locale });

      expect(storeHeader).toHaveBeenCalledExactlyOnceWith({
        copy: getDictionary(locale).storefront.shell,
        locale,
      });
    }
  );

  test("reads nothing of the store: the build prerenders it without a database", async () => {
    await setup();

    expect(readStore).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak", async () => {
    await expect(
      StoreLayout({
        children: <p>Page content</p>,
        params: makeParams("fr"),
      })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(storeHeader).not.toHaveBeenCalled();
  });

  test("exports the layout and its viewport only: no metadata, viewport or params read from the store", () => {
    expect(new Set(Object.keys(layoutModule))).toEqual(
      new Set(["default", "viewport"])
    );
  });
});

describe("viewport", () => {
  test("colors the browser's bar with the theme's background", () => {
    expect(viewport).toEqual({ themeColor: "#f2f3f0" });
  });
});
