import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AdminNav, type AdminNavItem, type AdminNavProps } from "./admin-nav";

function makeItem(overrides: Partial<AdminNavItem> = {}): AdminNavItem {
  return {
    current: false,
    href: "/en/admin/lr-market/products",
    label: "Articles",
    ...overrides,
  };
}

function setup(props: Partial<AdminNavProps> = {}) {
  render(
    <AdminNav
      items={[
        makeItem(),
        makeItem({
          current: true,
          href: "/en/admin/lr-market/orders",
          label: "Orders",
        }),
        makeItem({ href: "/en/admin/lr-market/users", label: "Users" }),
      ]}
      label="Admin sections"
      {...props}
    />
  );

  const nav = screen.getByRole("navigation", { name: "Admin sections" });

  return { links: within(nav).getAllByRole("link"), nav };
}

describe("AdminNav", () => {
  test("is a navigation landmark named by its label, with its slot and class", () => {
    const { nav } = setup({ className: "custom" });

    expect(nav).toHaveAttribute("data-slot", "admin-nav");
    expect(nav).toHaveClass("min-w-0", "custom");
  });

  test("lists each item as a link to its address, in order", () => {
    const { links } = setup();

    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([
      ["Articles", "/en/admin/lr-market/products"],
      ["Orders", "/en/admin/lr-market/orders"],
      ["Users", "/en/admin/lr-market/users"],
    ]);
  });

  test("marks only the current item as the page on screen", () => {
    const { links } = setup();

    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([
      null,
      "page",
      null,
    ]);
    expect(screen.getByRole("link", { name: "Orders" })).toHaveClass(
      "font-semibold"
    );
    expect(screen.getByRole("link", { name: "Users" })).not.toHaveClass(
      "font-semibold"
    );
  });

  test("shows a title above the links when it is given one", () => {
    const { nav } = setup({ title: "LR Market" });

    expect(nav.firstElementChild).toHaveTextContent(/^LR Market$/);
    expect(nav.firstElementChild?.tagName).toBe("P");
  });

  test("shows no title without one: the list comes first", () => {
    const { nav } = setup();

    expect(nav.firstElementChild?.tagName).toBe("UL");
  });

  test("shows an item's badge inside its link, after the label, and nothing for the others", () => {
    const { links } = setup({
      items: [
        makeItem(),
        makeItem({
          badge: <span data-testid="badge">3</span>,
          href: "/en/admin/lr-market/orders",
          label: "Orders",
        }),
      ],
    });

    expect(links.map((link) => link.textContent)).toEqual([
      "Articles",
      "Orders3",
    ]);
    expect(links[1]?.lastElementChild).toBe(screen.getByTestId("badge"));
    expect(links[0]?.children).toHaveLength(0);
  });
});
