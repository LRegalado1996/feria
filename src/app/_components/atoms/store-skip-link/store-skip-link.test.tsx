import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MouseEvent } from "react";
import { describe, expect, test, vi } from "vitest";

import {
  StoreSkipLink,
  StoreSkipScope,
  StoreSkipTarget,
} from "./store-skip-link";

/**
 * Scopes as store pages are: one frame each, the pages left behind kept in
 * the document, hidden, beside the one on screen, the last. Every click a
 * link receives is kept, to be read once React's handler is done with it: a
 * listener on the link itself runs before React's, which listens at the
 * root.
 */
function setup({ pages = 2 }: { pages?: number } = {}) {
  const onClick = vi.fn<(event: MouseEvent<HTMLAnchorElement>) => void>();
  const user = userEvent.setup();
  render(
    <>
      {Array.from({ length: pages }, (_, index) => (
        <div
          data-testid={`page-${index}`}
          hidden={index < pages - 1}
          key={index}
        >
          <StoreSkipScope>
            <StoreSkipLink onClick={onClick}>Saltar al contenido</StoreSkipLink>
            <StoreSkipTarget
              className="custom"
              data-testid={`content-${index}`}
            />
          </StoreSkipScope>
        </div>
      ))}
    </>
  );

  /** A page's skip link and the content it leads to. */
  const page = (index: number) => ({
    content: screen.getByTestId(`content-${index}`),
    link: within(screen.getByTestId(`page-${index}`)).getByRole("link", {
      hidden: true,
      name: "Saltar al contenido",
    }),
  });
  const shown = page(pages - 1);
  const clicks: Event[] = [];
  shown.link.addEventListener("click", (event) => {
    clicks.push(event);
  });

  return {
    /** Whether the browser's own jump was cancelled, click by click. */
    cancelled: () => clicks.map((event) => event.defaultPrevented),
    clicks,
    onClick,
    page,
    shown,
    user,
  };
}

describe("StoreSkipLink", () => {
  test("is a link to its scope's content, hidden until it has focus", () => {
    const { shown } = setup({ pages: 1 });

    expect(shown.content.id).not.toBe("");
    expect(shown.link).toHaveAttribute("href", `#${shown.content.id}`);
    expect(shown.link).toHaveAttribute("data-slot", "store-skip-link");
    expect(shown.link).toHaveClass("sr-only", "focus:not-sr-only");
  });

  test("gives every page's content an id of its own, which only that page's link leads to", () => {
    const { page } = setup({ pages: 3 });

    const pages = [page(0), page(1), page(2)];
    expect(new Set(pages.map(({ content }) => content.id)).size).toBe(3);

    for (const { content, link } of pages) {
      expect(link).toHaveAttribute("href", `#${content.id}`);
      expect(document.querySelectorAll(`[id="${content.id}"]`)).toHaveLength(1);
    }
  });

  test("moves focus to its own page's content, keeping the address free of the jump's #", async () => {
    const { cancelled, clicks, onClick, shown, user } = setup();

    await user.click(shown.link);

    expect(shown.content).toHaveFocus();
    expect(cancelled()).toEqual([true]);
    expect(onClick).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ nativeEvent: clicks[0] })
    );
  });

  test("leaves the jump to the browser when its scope holds no content", async () => {
    const user = userEvent.setup();
    render(
      <StoreSkipScope>
        <StoreSkipLink>Saltar al contenido</StoreSkipLink>
      </StoreSkipScope>
    );
    const link = screen.getByRole("link", { name: "Saltar al contenido" });
    const clicks: Event[] = [];
    link.addEventListener("click", (event) => {
      clicks.push(event);
    });

    await user.click(link);

    expect(clicks.map((event) => event.defaultPrevented)).toEqual([false]);
  });
});

describe("StoreSkipTarget", () => {
  test("is focusable by the link, never a stop of the Tab order, and takes a className", () => {
    const { shown } = setup({ pages: 1 });

    expect(shown.content).toHaveAttribute("tabindex", "-1");
    expect(shown.content).toHaveAttribute("data-slot", "store-skip-target");
    expect(shown.content).toHaveClass("custom");
  });

  test("as a child, gives the id to that element, which keeps its own slot", () => {
    render(
      <StoreSkipScope>
        <StoreSkipLink>Saltar al contenido</StoreSkipLink>
        <StoreSkipTarget asChild>
          <main data-slot="design-page">Gallery</main>
        </StoreSkipTarget>
      </StoreSkipScope>
    );

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("data-slot", "design-page");
    expect(main).toHaveAttribute("tabindex", "-1");
    expect(
      screen.getByRole("link", { name: "Saltar al contenido" })
    ).toHaveAttribute("href", `#${main.id}`);
  });

  test.each([
    ["StoreSkipLink", <StoreSkipLink key="link">Saltar</StoreSkipLink>],
    ["StoreSkipTarget", <StoreSkipTarget key="target" />],
  ])("%s outside a scope says so instead of leading nowhere", (name, ui) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => render(ui)).toThrow(`${name} renders inside a StoreSkipScope`);
  });
});
