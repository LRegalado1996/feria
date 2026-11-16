import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { StoreSwitcher, type StoreSwitcherProps } from "./store-switcher";

function makeStore(slug: string, name: string) {
  return { href: `/en/admin/${slug}/orders`, name, slug };
}

function setup(props: Partial<StoreSwitcherProps> = {}) {
  const user = userEvent.setup();

  render(
    <StoreSwitcher
      current={{ name: "LR Market", slug: "lr-market" }}
      label="Switch store: LR Market"
      stores={[
        makeStore("lr-market", "LR Market"),
        makeStore("sample-store", "Sample Store"),
      ]}
      title="Stores"
      {...props}
    />
  );

  const trigger = screen.getByTestId("store-switcher");

  return {
    open: async () => {
      await user.click(trigger);
      return screen.getByRole("menu");
    },
    trigger,
  };
}

describe("StoreSwitcher", () => {
  test("is a button named by its label, showing the current store", () => {
    const { trigger } = setup({ className: "custom" });

    expect(
      screen.getByRole("button", { name: "Switch store: LR Market" })
    ).toBe(trigger);
    expect(trigger).toHaveTextContent(/^LR Market$/);
    expect(trigger).toHaveAttribute("data-slot", "store-switcher");
    expect(trigger).toHaveClass("custom");
  });

  test("shows its title outside any store", () => {
    const { trigger } = setup({ current: null, label: "Switch store: Stores" });

    expect(trigger).toHaveTextContent(/^Stores$/);
    expect(trigger).toHaveAccessibleName("Switch store: Stores");
  });

  test("lists each store as a link to its address, the current one marked", async () => {
    const { open } = setup();

    const menu = await open();

    const links = within(menu).getAllByRole("menuitem");
    expect(
      links.map((link) => [
        link.tagName,
        link.textContent,
        link.getAttribute("href"),
        link.getAttribute("aria-current"),
      ])
    ).toEqual([
      ["A", "LR Market", "/en/admin/lr-market/orders", "page"],
      ["A", "Sample Store", "/en/admin/sample-store/orders", null],
    ]);
  });

  test("marks no store outside any store", async () => {
    const { open } = setup({ current: null, label: "Switch store: Stores" });

    const menu = await open();

    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((link) => link.getAttribute("aria-current"))
    ).toEqual([null, null]);
  });
});
