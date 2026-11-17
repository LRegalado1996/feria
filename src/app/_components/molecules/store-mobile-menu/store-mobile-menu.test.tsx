import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { StoreMobileMenu } from "./store-mobile-menu";

function setup() {
  const user = userEvent.setup();
  render(
    <StoreMobileMenu
      className="custom"
      closeLabel="Close the menu"
      label="Menu"
    >
      <a href="#catalog">Catalog</a>
      <p>Pick a section</p>
      <a href="#home">
        <span>Home</span>
      </a>
    </StoreMobileMenu>
  );

  const trigger = () => screen.getByRole("button", { name: "Menu" });
  const panel = () => screen.queryByTestId("store-mobile-menu");

  return {
    open: async () => {
      await user.click(trigger());
      return within(screen.getByRole("dialog", { name: "Menu" }));
    },
    panel,
    trigger,
    user,
  };
}

describe("StoreMobileMenu", () => {
  test("is closed at first, behind a trigger named by its label", () => {
    const { panel, trigger } = setup();

    expect(trigger()).toHaveClass("custom");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(panel()).toBeNull();
    expect(screen.queryByText("Catalog")).toBeNull();
  });

  test("opens a panel titled by its label, with the content inside", async () => {
    const { open, trigger } = setup();
    const button = trigger();

    const dialog = await open();

    expect(dialog.getByRole("heading", { name: "Menu" })).toBeVisible();
    expect(dialog.getByRole("link", { name: "Catalog" })).toBeVisible();
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  test("closes with its named close button", async () => {
    const { open, panel, user } = setup();
    const dialog = await open();

    await user.click(dialog.getByRole("button", { name: "Close the menu" }));

    await waitFor(() => {
      expect(panel()).toBeNull();
    });
  });

  test("closes on Escape and gives focus back to the menu button", async () => {
    const { open, panel, trigger, user } = setup();
    await open();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(panel()).toBeNull();
    });
    expect(trigger()).toHaveFocus();
  });

  test("is a moss panel that covers a phone's screen and slides in from the left on a tablet", async () => {
    const { open, panel, trigger } = setup();
    // Read before it opens: an open modal hides the rest of the page.
    expect(trigger()).toHaveAttribute("data-variant", "contrast");
    await open();

    expect(panel()).toHaveClass(
      "bg-store-contrast",
      "fixed",
      "inset-y-0",
      "left-0",
      "w-full",
      "sm:max-w-sm"
    );
    expect(screen.getByTestId("dialog-overlay")).toHaveClass(
      "bg-store-foreground/50"
    );
  });

  test.each([
    ["the link itself", "Catalog"],
    ["something inside a link", "Home"],
  ])("closes when %s is followed", async (_case, text) => {
    const { open, panel, user } = setup();
    const dialog = await open();

    await user.click(dialog.getByText(text));

    await waitFor(() => {
      expect(panel()).toBeNull();
    });
  });

  test("stays open when something that is not a link is clicked", async () => {
    const { open, panel, user } = setup();
    const dialog = await open();

    await user.click(dialog.getByText("Pick a section"));
    await user.click(dialog.getByRole("heading", { name: "Menu" }));

    expect(panel()).toBeVisible();
  });
});
