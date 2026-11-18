import { screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { Pagination } from "./pagination";

/** The pages of a list at `?page=`, as the caller builds them. */
function hrefFor(page: number) {
  return `/en/admin/products?page=${page}`;
}

function setup({
  locale = "en",
  page = 1,
  pageCount = 3,
}: { locale?: Locale; page?: number; pageCount?: number } = {}) {
  const view = renderWithI18n(
    <Pagination
      className="custom"
      hrefFor={hrefFor}
      page={page}
      pageCount={pageCount}
    />,
    { locale }
  );
  const nav = () => screen.getByTestId("pagination");

  return {
    container: view.container,
    nav,
    /** Each page link's name, address and whether it is the current one. */
    pages: () =>
      within(nav())
        .getAllByRole("link", { name: /^(Page|Página) \d+$/u })
        .map((link) => [
          link.textContent,
          link.getAttribute("href"),
          link.getAttribute("aria-current"),
        ]),
    step: (direction: "next" | "previous") =>
      screen.getByTestId(`pagination-${direction}`),
  };
}

describe("Pagination", () => {
  test("is a named navigation of links to every page, the current one marked", () => {
    const { nav, pages } = setup({ page: 2 });

    expect(nav()).toHaveAttribute("aria-label", "Pages");
    expect(nav()).toHaveAttribute("data-slot", "pagination");
    expect(nav()).toHaveClass("custom");
    expect(pages()).toEqual([
      ["1", "/en/admin/products?page=1", null],
      ["2", "/en/admin/products?page=2", "page"],
      ["3", "/en/admin/products?page=3", null],
    ]);
  });

  test("steps to the pages either side, each named for the ear", () => {
    const { step } = setup({ page: 2 });

    expect(step("previous")).toHaveAttribute(
      "href",
      "/en/admin/products?page=1"
    );
    expect(step("previous")).toHaveAttribute("rel", "prev");
    expect(step("previous")).toHaveAccessibleName("Previous page");
    expect(step("next")).toHaveAttribute("href", "/en/admin/products?page=3");
    expect(step("next")).toHaveAttribute("rel", "next");
    expect(step("next")).toHaveAccessibleName("Next page");
  });

  test.each([
    ["the first page has no step back", 1, "previous"],
    ["the last page has no step on", 3, "next"],
  ] as const)("%s: a dimmed icon the ear skips", (_case, page, direction) => {
    const { step } = setup({ page });

    expect(step(direction).tagName).toBe("SPAN");
    expect(step(direction)).toHaveAttribute("aria-hidden", "true");
    expect(step(direction)).not.toHaveAttribute("href");
  });

  test("leaves out the pages far from the current one, a gap said for the ear", () => {
    const { nav, pages } = setup({ page: 5, pageCount: 10 });

    expect(pages().map(([page]) => page)).toEqual(["1", "4", "5", "6", "10"]);
    expect(within(nav()).getAllByText("More pages")).toHaveLength(2);
  });

  test("says the page and how many there are, for a phone", () => {
    setup({ page: 2, pageCount: 6 });

    expect(screen.getByTestId("pagination-position")).toHaveTextContent(
      "Page 2 of 6"
    );
  });

  test("shows nothing for a list of one page", () => {
    const { container } = setup({ page: 1, pageCount: 1 });

    expect(container).toBeEmptyDOMElement();
  });

  test("past the last page (an old link), steps back to the last one and none is current", () => {
    const { pages, step } = setup({ page: 9, pageCount: 3 });

    expect(step("previous")).toHaveAttribute(
      "href",
      "/en/admin/products?page=3"
    );
    expect(step("next")).not.toHaveAttribute("href");
    expect(pages().map((page) => page[2])).toEqual([null, null, null]);
  });

  test("past a list with no pages, steps back to the first", () => {
    const { step } = setup({ page: 4, pageCount: 0 });

    expect(step("previous")).toHaveAttribute(
      "href",
      "/en/admin/products?page=1"
    );
    expect(screen.getByTestId("pagination-position")).toHaveTextContent(
      "Page 4 of 1"
    );
  });

  test("in Spanish, says it in Spanish", () => {
    const { nav, step } = setup({ locale: "es", page: 2, pageCount: 6 });

    expect(nav()).toHaveAttribute("aria-label", "Páginas");
    expect(step("previous")).toHaveAccessibleName("Página anterior");
    expect(step("next")).toHaveAccessibleName("Página siguiente");
    expect(screen.getByTestId("pagination-position")).toHaveTextContent(
      "Página 2 de 6"
    );
    expect(
      within(nav()).getByRole("link", { name: "Página 2" })
    ).toHaveAttribute("aria-current", "page");
  });
});
