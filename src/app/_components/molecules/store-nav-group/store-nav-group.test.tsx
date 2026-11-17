import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { required } from "@/test/required";

import { StoreNavGroup, type StoreNavGroupProps } from "./store-nav-group";

function makeLink(name: string, href: string, current = false) {
  return { current, href, lang: "es", name };
}

function setup({
  current,
  variant = "bar",
}: {
  /** The page the visitor is on, among the group's links. */
  current?: string;
  variant?: StoreNavGroupProps["variant"];
} = {}) {
  const items = [
    makeLink("Cadenas", "/bijouterie/cadenas"),
    makeLink("Anillos", "/bijouterie/anillos"),
  ].map((item) => ({ ...item, current: item.href === current }));
  render(
    <div>
      <StoreNavGroup
        group={makeLink("Bijouterie", "/bijouterie", current === "/bijouterie")}
        items={items}
        toggleLabel="Bijouterie: sus categorías"
        variant={variant}
      />
      <button type="button">Fuera</button>
    </div>
  );
  const toggle = screen.getByRole("button", {
    name: "Bijouterie: sus categorías",
  });

  return {
    /** The group's categories, while they can be seen. */
    links: () =>
      screen
        .queryAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    list: () =>
      toggle
        .closest('[data-slot="store-nav-group"]')
        ?.querySelector<HTMLElement>('[data-slot="store-nav-group-list"]'),
    toggle,
    user: userEvent.setup(),
  };
}

describe("StoreNavGroup", () => {
  test("is the group's name, a link to its page, and a closed button whose list holds its categories in the HTML", () => {
    const { links, list, toggle } = setup();

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(list()).toHaveAttribute("hidden");
    // In the document for a crawler, out of the reading order until opened.
    expect(
      within(required(list()))
        .getAllByRole("link", { hidden: true })
        .map((link) => link.getAttribute("href"))
    ).toEqual(["/bijouterie/cadenas", "/bijouterie/anillos"]);
    expect(links()).toEqual([["Bijouterie", "/bijouterie"]]);
  });

  test("opens and closes its categories from its button", async () => {
    const { links, toggle, user } = setup();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(links()).toEqual([
      ["Bijouterie", "/bijouterie"],
      ["Cadenas", "/bijouterie/cadenas"],
      ["Anillos", "/bijouterie/anillos"],
    ]);

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test.each(["bar", "menu"] as const)(
    "in the %s, opens from the keyboard and Escape closes it, handing focus back to its button",
    async (variant) => {
      const { toggle, user } = setup({ variant });

      toggle.focus();
      await user.keyboard("{Enter}");
      await user.tab();

      expect(screen.getByRole("link", { name: "Cadenas" })).toHaveFocus();

      await user.keyboard("{Escape}");

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle).toHaveFocus();
    }
  );

  test("on the header's line, focus leaving the group closes it", async () => {
    const { toggle, user } = setup();

    await user.click(toggle);
    // The button, its two categories, then out of the group.
    await user.tab();
    await user.tab();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.tab();

    expect(screen.getByRole("button", { name: "Fuera" })).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("in the phone's menu, Escape pressed outside the group leaves it open", async () => {
    const { toggle, user } = setup({ variant: "menu" });

    await user.click(toggle);
    await user.tab();
    await user.tab();
    await user.tab();
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Fuera" })).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("on the header's line, a click elsewhere closes it, one inside does not", async () => {
    const { list, toggle, user } = setup();

    await user.click(toggle);
    await user.pointer({
      keys: "[MouseLeft]",
      target: list() ?? document.body,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(document.body);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("in the phone's menu, it stays open when focus or a click goes elsewhere", async () => {
    const { toggle, user } = setup({ variant: "menu" });

    await user.click(toggle);
    await user.click(document.body);
    screen.getByRole("button", { name: "Fuera" }).focus();

    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  test("following one of its categories closes it", async () => {
    const { toggle, user } = setup();

    await user.click(toggle);
    await user.click(screen.getByRole("link", { name: "Anillos" }));

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test.each([
    ["the group's page", "/bijouterie", "Bijouterie"],
    ["one of its categories", "/bijouterie/anillos", "Anillos"],
  ])("marks %s as the current page", async (_case, current, name) => {
    const { toggle, user } = setup({ current });

    await user.click(toggle);

    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent)
    ).toEqual([name]);
  });

  test.each(["bar", "menu"] as const)(
    "in the %s, its button and its links are 44 px targets",
    async (variant) => {
      const { toggle, user } = setup({ variant });

      await user.click(toggle);

      expect(toggle).toHaveClass("size-11");
      for (const link of screen.getAllByRole("link").slice(0, 3)) {
        expect(link.className).toMatch(/min-h-1[13]/u);
      }
      expect(toggle.closest('[data-slot="store-nav-group"]')).toHaveAttribute(
        "data-variant",
        variant
      );
    }
  );
});
