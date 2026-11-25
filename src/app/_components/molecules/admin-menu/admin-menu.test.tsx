import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { browserClick } from "@/test/browser-click";
import { renderWithI18n } from "@/test/i18n";
import { stubReducedMotion } from "@/test/reduced-motion";

import {
  ADMIN_MENU_WIDE_QUERY,
  AdminMenu,
  AdminMenuButton,
} from "./admin-menu";

/** The shell's menu around a page whose top bar holds the button. */
function setup({ locale = "en" }: { locale?: Locale } = {}) {
  // The stub answers any media query; the menu asks for the window's width.
  const media = stubReducedMotion(false);
  const user = userEvent.setup();
  // What a link's own handler saw: next/link's starts the navigation there.
  const followed = vi.fn<(href: string | null) => void>();

  renderWithI18n(
    <AdminMenu
      panel={
        <nav aria-label="Admin sections">
          <Link
            href="/en/admin/orders"
            onClick={(event) => {
              followed(event.currentTarget.getAttribute("href"));
            }}
          >
            Orders
          </Link>
          <Link href="/en/admin/categories">Categories</Link>
          <button type="button">Theme</button>
        </nav>
      }
    >
      <header>
        <AdminMenuButton className="custom" />
        <h1>Orders</h1>
      </header>
      <p>Page content</p>
    </AdminMenu>,
    { locale }
  );

  // `hidden`: while the panel is open the page behind it, the button
  // included, is hidden from assistive technology.
  const button = () =>
    screen.getByRole("button", {
      hidden: true,
      name: locale === "en" ? "Menu" : "Menú",
    });

  return {
    button,
    followed,
    media,
    open: async () => {
      await user.click(button());
      return await screen.findByRole("dialog");
    },
    user,
  };
}

describe("AdminMenu", () => {
  test("is closed at first: the button says so and the panel is not there", () => {
    const { button } = setup();

    expect(button()).toHaveAttribute("aria-expanded", "false");
    expect(button()).toHaveAttribute("aria-haspopup", "dialog");
    expect(button()).toHaveAttribute("data-slot", "admin-menu-button");
    expect(button()).toHaveClass("custom");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  test("opens as a modal panel named Menu, holding the sections, with focus on its close button", async () => {
    const { button, open } = setup();

    const panel = await open();

    expect(panel).toHaveAccessibleName("Menu");
    expect(panel).toHaveAttribute("data-testid", "admin-menu");
    expect(
      within(panel).getByRole("navigation", { name: "Admin sections" })
    ).toBeInTheDocument();
    expect(button()).toHaveAttribute("aria-expanded", "true");
    expect(
      within(panel).getByRole("button", { name: "Close the menu" })
    ).toHaveFocus();
    // Modal: the page behind is out of reach until it closes.
    expect(
      screen.getByText("Page content").closest("[aria-hidden='true']")
    ).not.toBeNull();
  });

  test("keeps focus inside while open: Tab from the last control comes back to the first", async () => {
    const { open, user } = setup();
    const panel = await open();
    const close = within(panel).getByRole("button", { name: "Close the menu" });
    const theme = within(panel).getByRole("button", { name: "Theme" });

    await user.tab();
    expect(within(panel).getByRole("link", { name: "Orders" })).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(theme).toHaveFocus();

    await user.tab();

    expect(close).toHaveFocus();
  });

  test("closes on Escape and gives focus back to the button that opened it", async () => {
    const { button, open, user } = setup();
    await open();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(button()).toHaveFocus();
    expect(button()).toHaveAttribute("aria-expanded", "false");
  });

  test("closes on its close button, focus back on the menu button", async () => {
    const { button, open, user } = setup();
    const panel = await open();

    await user.click(
      within(panel).getByRole("button", { name: "Close the menu" })
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(button()).toHaveFocus();
  });

  test("closes on the dimmed area around it", async () => {
    const { button, open, user } = setup();
    await open();

    await user.click(screen.getByTestId("dialog-overlay"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(button()).toHaveFocus();
  });

  test("closes once a section is chosen, and stays open for a control that is no link", async () => {
    const { open, user } = setup();
    const panel = await open();

    await user.click(within(panel).getByRole("button", { name: "Theme" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(within(panel).getByRole("link", { name: "Categories" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("closes only after the chosen section's own handler has run, so it navigates in place", async () => {
    const { followed, open, user } = setup();
    const panel = await open();

    await browserClick(
      user,
      within(panel).getByRole("link", { name: "Orders" })
    );

    expect(followed).toHaveBeenCalledExactlyOnceWith("/en/admin/orders");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("stays open for a section opened in another tab", async () => {
    const { open, user } = setup();
    const panel = await open();

    await user.keyboard("{Control>}");
    await user.click(within(panel).getByRole("link", { name: "Categories" }));
    await user.keyboard("{/Control}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("closes when the window widens to the sidebar's layout, and stops listening once closed", async () => {
    const { media, open } = setup();
    await open();
    expect(media.queries).toContain(ADMIN_MENU_WIDE_QUERY);
    expect(media.listenerCount()).toBe(1);

    // Still a phone's width: nothing changes.
    act(() => {
      media.set(false);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => {
      media.set(true);
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(media.listenerCount()).toBe(0);
  });

  test("speaks Spanish", async () => {
    const { open } = setup({ locale: "es" });

    const panel = await open();

    expect(panel).toHaveAccessibleName("Menú");
    expect(
      within(panel).getByRole("button", { name: "Cerrar el menú" })
    ).toBeInTheDocument();
  });
});

describe("AdminMenuButton", () => {
  test("renders nothing outside the shell's menu: there is no panel to open", () => {
    renderWithI18n(
      <header>
        <AdminMenuButton />
        <h1>Orders</h1>
      </header>
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
  });
});
