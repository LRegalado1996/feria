import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { collectHydrationErrors } from "@/test/hydration";
import { required } from "@/test/required";

import { StoreNavGroup, type StoreNavGroupProps } from "./store-nav-group";

function makeLink(name: string, href: string, current = false) {
  return { current, href, lang: "es", name };
}

/** The group as the header hands it over, the visitor on `current`. */
function groupProps({
  current,
  variant = "bar",
}: {
  /** The page the visitor is on, among the group's links. */
  current?: string;
  variant?: StoreNavGroupProps["variant"];
} = {}): StoreNavGroupProps {
  return {
    allLabel: "Ver todo",
    group: makeLink("Bijouterie", "/bijouterie", current === "/bijouterie"),
    items: [
      makeLink("Cadenas", "/bijouterie/cadenas"),
      makeLink("Anillos", "/bijouterie/anillos"),
    ].map((item) => ({ ...item, current: item.href === current })),
    toggleLabel: "Bijouterie: sus categorías",
    variant,
  };
}

function setup(options: Parameters<typeof groupProps>[0] = {}) {
  const props = groupProps(options);
  render(
    <div>
      <StoreNavGroup {...props} />
      <button type="button">Fuera</button>
    </div>
  );
  // On the line the control is named by its words; in the menu the button
  // beside the name says whose categories it shows.
  const toggle = screen.getByRole("button", {
    name: props.variant === "bar" ? "Bijouterie" : props.toggleLabel,
  });

  return {
    /** The links that can be seen, in order. */
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
  test("on the header's line, is one closed button, its name with the chevron tight inside it, whose list holds the group's page and its categories in the HTML", () => {
    const { links, list, toggle } = setup();

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent(/^Bijouterie$/u);
    // One control: the chevron is the button's own, small, beside the word.
    const chevron = required(
      toggle.querySelector('[data-slot="store-nav-group-chevron"]')
    );
    expect(chevron).toHaveClass("size-3");
    expect(chevron).toHaveAttribute("aria-hidden", "true");
    expect(toggle).toHaveClass("gap-1.5", "min-h-11");
    expect(
      within(required(toggle.closest('[data-slot="store-nav-group"]')))
        .getAllByRole("button")
        .map((button) => button.textContent)
    ).toEqual(["Bijouterie"]);
    expect(list()).toHaveAttribute("hidden");
    // In the document for a crawler, out of the reading order until opened.
    expect(
      within(required(list()))
        .getAllByRole("link", { hidden: true })
        .map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([
      ["Ver todo", "/bijouterie"],
      ["Cadenas", "/bijouterie/cadenas"],
      ["Anillos", "/bijouterie/anillos"],
    ]);
    expect(links()).toEqual([]);
  });

  test("on the header's line, is a link to the group's page until React owns it, then the button, with no mismatch", () => {
    const { clientHtml, errors, serverHtml } = collectHydrationErrors(
      <StoreNavGroup {...groupProps()} />,
      { clientNowMs: 1000, serverNowMs: 0 }
    );
    const server = document.createElement("div");
    server.innerHTML = serverHtml;
    const client = document.createElement("div");
    client.innerHTML = clientHtml;
    const control = (root: HTMLElement) =>
      required(root.querySelector('[data-slot="store-nav-group-toggle"]'));

    expect(errors).toEqual([]);
    expect(control(server).tagName).toBe("A");
    expect(control(server)).toHaveAttribute("href", "/bijouterie");
    expect(control(server)).toHaveTextContent(/^Bijouterie$/u);
    expect(control(client).tagName).toBe("BUTTON");
    expect(control(client)).toHaveAttribute("aria-expanded", "false");
    // The same box either way: nothing moves when React takes over.
    expect(control(client).className).toBe(control(server).className);
  });

  test("in the phone's menu, is the group's name, a link to its page, and a 44 px button beside it", () => {
    const { links, list, toggle } = setup({ variant: "menu" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveClass("size-11");
    expect(links()).toEqual([["Bijouterie", "/bijouterie"]]);
    expect(
      within(required(list()))
        .getAllByRole("link", { hidden: true })
        .map((link) => link.getAttribute("href"))
    ).toEqual(["/bijouterie/cadenas", "/bijouterie/anillos"]);
  });

  test("opens and closes its list from its button", async () => {
    const { links, toggle, user } = setup();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(links()).toEqual([
      ["Ver todo", "/bijouterie"],
      ["Cadenas", "/bijouterie/cadenas"],
      ["Anillos", "/bijouterie/anillos"],
    ]);
    expect(
      required(toggle.querySelector('[data-slot="store-nav-group-chevron"]'))
    ).toHaveClass("rotate-180");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test.each([
    ["bar", "Ver todo"],
    ["menu", "Cadenas"],
  ] as const)(
    "in the %s, opens from the keyboard and Escape closes it, handing focus back to its button",
    async (variant, first) => {
      const { toggle, user } = setup({ variant });

      toggle.focus();
      await user.keyboard("{Enter}");
      await user.tab();

      expect(screen.getByRole("link", { name: first })).toHaveFocus();

      await user.keyboard("{Escape}");

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle).toHaveFocus();
    }
  );

  test("on the header's line, focus leaving the group closes it", async () => {
    const { toggle, user } = setup();

    await user.click(toggle);
    // The button, its three links, then out of the group.
    await user.tab();
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

  test("following one of its links closes it", async () => {
    const { toggle, user } = setup();

    await user.click(toggle);
    await user.click(screen.getByRole("link", { name: "Anillos" }));

    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test.each([
    ["the group's page", "bar", "/bijouterie", "Ver todo"],
    ["one of its categories", "bar", "/bijouterie/anillos", "Anillos"],
    ["the group's page", "menu", "/bijouterie", "Bijouterie"],
  ] as const)(
    "marks %s as the current page, in the %s",
    async (_case, variant, current, name) => {
      const { toggle, user } = setup({ current, variant });

      await user.click(toggle);

      expect(
        screen
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "page")
          .map((link) => link.textContent)
      ).toEqual([name]);
    }
  );

  test.each([
    ["on the group's page", "/bijouterie", "true"],
    ["on one of its categories", "/bijouterie/cadenas", "true"],
    ["elsewhere", "/burbujeros", "false"],
  ])(
    "on the header's line, underlines its control %s",
    (_case, current, marked) => {
      const { toggle } = setup({ current });

      expect(toggle).toHaveAttribute("data-current", marked);
    }
  );

  test.each(["bar", "menu"] as const)(
    "in the %s, its links are 44 px targets",
    async (variant) => {
      const { toggle, user } = setup({ variant });

      await user.click(toggle);

      for (const link of screen.getAllByRole("link")) {
        expect(link.className).toMatch(/min-h-1[13]/u);
      }
      expect(toggle.closest('[data-slot="store-nav-group"]')).toHaveAttribute(
        "data-variant",
        variant
      );
    }
  );
});
