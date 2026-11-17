import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";

import * as layoutModule from "./layout";

const { readStore, storeTheme } = vi.hoisted(() => ({
  readStore: vi.fn(),
  storeTheme: vi.fn(),
}));

// Nothing here may read the store: the build prerenders this layout, and
// the build has no database.
vi.mock("@/server/cache/store", () => ({ readStore }));

// The theme has its own tests; here it shows what the layout handed it.
vi.mock("@/app/_components/organisms/store-theme", () => ({
  StoreTheme: (props: ComponentProps<"div">) => {
    storeTheme(props);

    return <div {...props} />;
  },
}));

const { default: StoreLayout, viewport } = layoutModule;

function setup() {
  render(
    <StoreLayout>
      <p>Page content</p>
    </StoreLayout>
  );

  return { theme: screen.getByTestId("store-theme") };
}

describe("StoreLayout", () => {
  test("puts the page, frame and all, straight on the store's canvas", () => {
    const { theme } = setup();

    expect(theme).toContainElement(screen.getByText("Page content"));
    expect(theme.firstElementChild).toBe(screen.getByText("Page content"));
  });

  test("the canvas is a full-height column, handed no colors: they are code", () => {
    setup();

    expect(storeTheme).toHaveBeenCalledExactlyOnceWith({
      children: expect.anything(),
      className: "flex min-h-dvh flex-col",
      "data-testid": "store-theme",
    });
  });

  test("reads nothing of the store: the build prerenders it without a database", () => {
    setup();

    expect(readStore).not.toHaveBeenCalled();
  });

  test("exports the layout and its viewport only: no metadata, viewport or params read from the store", () => {
    expect(new Set(Object.keys(layoutModule))).toEqual(
      new Set(["default", "viewport"])
    );
  });
});

describe("viewport", () => {
  test("colors the browser's bar with the header's moss", () => {
    expect(viewport).toEqual({ themeColor: "#262a1d" });
  });
});
