import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { StoreNavGroup } from "@/app/_components/molecules/store-nav-group";
import { browserClick } from "@/test/browser-click";

import { StoreMobileMenu } from "./store-mobile-menu";

function setup() {
  const user = userEvent.setup();
  // What a link's own handler saw: next/link's starts the navigation there.
  const followed = vi.fn<(href: string | null) => void>();
  render(
    <StoreMobileMenu
      className="custom"
      closeLabel="Close the menu"
      label="Menu"
    >
      <a
        href="#catalog"
        onClick={(event) => {
          followed(event.currentTarget.getAttribute("href"));
        }}
      >
        Catalog
      </a>
      <p>Pick a section</p>
      <a href="#home">
        <span>Home</span>
      </a>
      {/* The header puts each group in the menu like this. */}
      <StoreNavGroup
        allLabel="See all"
        group={{
          current: false,
          href: "/bijouterie",
          lang: "es",
          name: "Bijouterie",
        }}
        items={[
          {
            current: false,
            href: "/bijouterie/anillos",
            lang: "es",
            name: "Anillos",
          },
        ]}
        toggleLabel="Bijouterie's categories"
        variant="menu"
      />
    </StoreMobileMenu>
  );

  const trigger = () => screen.getByRole("button", { name: "Menu" });
  const panel = () => screen.queryByTestId("store-mobile-menu");

  return {
    followed,
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

  test("on Escape inside a group's open categories, closes them and stays open; a second Escape closes the menu", async () => {
    const { open, panel, trigger, user } = setup();
    const dialog = await open();
    const toggle = dialog.getByRole("button", {
      name: "Bijouterie's categories",
    });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Into the list: Escape is pressed from one of its categories.
    await user.tab();
    expect(dialog.getByRole("link", { name: "Anillos" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    expect(panel()).not.toBeNull();

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

  test("closes only after the followed link's own handler has run, so it navigates in place", async () => {
    const { followed, open, panel, user } = setup();
    const dialog = await open();

    await browserClick(user, dialog.getByRole("link", { name: "Catalog" }));

    expect(followed).toHaveBeenCalledExactlyOnceWith("#catalog");
    await waitFor(() => {
      expect(panel()).toBeNull();
    });
  });

  test("stays open for a link opened in another tab", async () => {
    const { open, panel, user } = setup();
    const dialog = await open();

    await user.keyboard("{Control>}");
    await user.click(dialog.getByRole("link", { name: "Catalog" }));
    await user.keyboard("{/Control}");

    expect(panel()).toBeVisible();
  });

  test("stays open when something that is not a link is clicked", async () => {
    const { open, panel, user } = setup();
    const dialog = await open();

    await user.click(dialog.getByText("Pick a section"));
    await user.click(dialog.getByRole("heading", { name: "Menu" }));

    expect(panel()).toBeVisible();
  });
});
