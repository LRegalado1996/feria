import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AdminNav, type AdminNavItem, type AdminNavProps } from "./admin-nav";

function makeItem(overrides: Partial<AdminNavItem> = {}): AdminNavItem {
  return {
    current: false,
    href: "/en/admin/products",
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
          href: "/en/admin/orders",
          label: "Orders",
        }),
        makeItem({ href: "/en/admin/users", label: "Users" }),
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
      ["Articles", "/en/admin/products"],
      ["Orders", "/en/admin/orders"],
      ["Users", "/en/admin/users"],
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

  test("shows an item's badge inside its link, after the label, and lets it name the link", () => {
    const { links } = setup({
      items: [
        makeItem(),
        makeItem({
          badge: <span data-testid="badge">Orders, 3 waiting</span>,
          href: "/en/admin/orders",
          label: "Orders",
        }),
      ],
    });

    expect(links.map((link) => link.textContent)).toEqual([
      "Articles",
      "OrdersOrders, 3 waiting",
    ]);
    // The badge says the whole name: the label is there for the eye only.
    expect(links[1]).toHaveAccessibleName("Orders, 3 waiting");
    const [label, badge] = [...(links[1]?.firstElementChild?.children ?? [])];
    expect(label).toHaveAttribute("aria-hidden", "true");
    expect(label).toHaveTextContent(/^Orders$/u);
    expect(badge).toBe(screen.getByTestId("badge"));
    expect(links[1]?.children).toHaveLength(1);
    // Without a badge the label is the name, hidden from no one.
    expect(links[0]).toHaveAccessibleName("Articles");
    expect(links[0]?.firstElementChild?.textContent).toBe("Articles");
    expect(links[0]?.firstElementChild?.children).toHaveLength(0);
  });
});
