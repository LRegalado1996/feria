import { render, screen, within } from "@testing-library/react";
import { Folder, Package, Users } from "lucide-react";
import { describe, expect, test } from "vitest";

import { AdminNav, type AdminNavItem, type AdminNavProps } from "./admin-nav";

function makeItem(overrides: Partial<AdminNavItem> = {}): AdminNavItem {
  return {
    current: false,
    href: "/en/admin/categories",
    icon: Folder,
    label: "Categories",
    ...overrides,
  };
}

function setup(props: Partial<AdminNavProps> = {}) {
  render(
    <AdminNav
      items={[
        makeItem({
          current: true,
          href: "/en/admin/orders",
          icon: Package,
          label: "Orders",
        }),
        makeItem(),
        makeItem({ href: "/en/admin/users", icon: Users, label: "Users" }),
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

  test("lists each item as a link to its address, in order, named by its label", () => {
    const { links } = setup();

    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([
      ["Orders", "/en/admin/orders"],
      ["Categories", "/en/admin/categories"],
      ["Users", "/en/admin/users"],
    ]);
    expect(links[1]).toHaveAccessibleName("Categories");
  });

  test("draws each item's own icon before its label, hidden from screen readers", () => {
    const { links } = setup();

    const icons = links.map((link) => link.firstElementChild);
    expect(icons.map((icon) => icon?.tagName.toLowerCase())).toEqual([
      "svg",
      "svg",
      "svg",
    ]);
    expect(icons.map((icon) => icon?.getAttribute("aria-hidden"))).toEqual([
      "true",
      "true",
      "true",
    ]);
    // Lucide names each drawing in its class: one icon per section.
    expect(icons.map((icon) => icon?.getAttribute("class"))).toEqual([
      expect.stringContaining("lucide-package"),
      expect.stringContaining("lucide-folder"),
      expect.stringContaining("lucide-users"),
    ]);
  });

  test("marks only the current item as the page on screen, filled and bold", () => {
    const { links } = setup();

    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([
      "page",
      null,
      null,
    ]);
    expect(links[0]).toHaveClass("bg-sidebar-accent", "font-semibold");
    expect(links[1]).not.toHaveClass("bg-sidebar-accent");
    expect(links[1]).not.toHaveClass("font-semibold");
    expect(links[1]).toHaveClass("text-muted-foreground");
  });

  test("is a 44 px row on a phone and a compact one from md up", () => {
    const { links } = setup();

    for (const link of links) {
      expect(link).toHaveClass("h-11", "md:h-9");
    }
  });

  test("shows an item's badge at the end of its link, and lets it name the link", () => {
    const { links } = setup({
      items: [
        makeItem({
          badge: <span data-testid="badge">Orders, 3 to pack</span>,
          href: "/en/admin/orders",
          icon: Package,
          label: "Orders",
        }),
        makeItem(),
      ],
    });

    // The badge says the whole name: the label is there for the eye only.
    expect(links[0]).toHaveAccessibleName("Orders, 3 to pack");
    const [icon, label, badge] = [...(links[0]?.children ?? [])];
    expect(icon?.tagName.toLowerCase()).toBe("svg");
    expect(label).toHaveAttribute("aria-hidden", "true");
    expect(label).toHaveTextContent(/^Orders$/u);
    expect(badge).toBe(screen.getByTestId("badge"));
    expect(links[0]?.children).toHaveLength(3);
    // Without a badge the label is the name, hidden from no one.
    expect(links[1]).toHaveAccessibleName("Categories");
    expect(links[1]?.children[1]).not.toHaveAttribute("aria-hidden");
    expect(links[1]?.children).toHaveLength(2);
  });
});
