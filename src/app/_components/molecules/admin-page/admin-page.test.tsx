import { screen, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, test } from "vitest";

import { AdminMenu } from "@/app/_components/molecules/admin-menu";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { AdminPage, type AdminPageProps } from "./admin-page";

function setup({
  inMenu = true,
  locale = "en",
  ...props
}: Partial<AdminPageProps> & { inMenu?: boolean; locale?: Locale } = {}) {
  const page = (
    <AdminPage title="Categories" {...props}>
      <p>Section content</p>
    </AdminPage>
  );
  renderWithI18n(
    inMenu ? (
      <AdminMenu panel={<nav aria-label="Sections" />}>{page}</AdminMenu>
    ) : (
      page
    ),
    { locale }
  );

  const topBar = screen.getByTestId("admin-top-bar");

  return {
    body: screen.getByText("Section content").parentElement,
    root: topBar.parentElement,
    topBar,
  };
}

describe("AdminPage", () => {
  test("heads the screen with its one heading in a sticky top bar, over the content", () => {
    const { body, root, topBar } = setup();

    expect(root).toHaveAttribute("data-slot", "admin-page");
    expect(topBar).toHaveAttribute("data-slot", "admin-top-bar");
    expect(topBar).toHaveClass("sticky", "top-0");
    expect(
      screen
        .getAllByRole("heading")
        .map((heading) => [heading.tagName, heading.textContent])
    ).toEqual([["H1", "Categories"]]);
    expect(topBar).toContainElement(screen.getByRole("heading"));
    expect(body).toHaveAttribute("data-slot", "admin-page-body");
    expect(body).not.toContainElement(screen.getByRole("heading"));
  });

  test.each([
    ["en", "Menu"],
    ["es", "Menú"],
  ] as const)(
    "in %s, puts the menu button before the title, for a phone only",
    (locale, name) => {
      const { topBar } = setup({ locale });

      const button = within(topBar).getByRole("button", { name });
      expect(button).toHaveClass("md:hidden");
      expect(button.compareDocumentPosition(screen.getByRole("heading"))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    }
  );

  test("has no menu button outside the shell", () => {
    const { topBar } = setup({ inMenu: false });

    expect(within(topBar).queryByRole("button")).not.toBeInTheDocument();
  });

  test("keeps the screen's controls in the top bar, after the title", () => {
    const { topBar } = setup({
      actions: <button type="button">Sound</button>,
      inMenu: false,
      notice: <p>Tap the screen to turn the sound on</p>,
    });

    const sound = within(topBar).getByRole("button", { name: "Sound" });
    expect(screen.getByRole("heading").compareDocumentPosition(sound)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(
      within(topBar).getByText("Tap the screen to turn the sound on")
        .parentElement
    ).toHaveAttribute("data-slot", "admin-top-bar-notice");
  });

  test("shows no notice line without one", () => {
    const { topBar } = setup({ inMenu: false });

    expect(
      topBar.querySelector('[data-slot="admin-top-bar-notice"]')
    ).toBeNull();
  });

  test("puts the main action in the top bar from md up and under the thumb on a phone, leaving room for it", () => {
    const { body, topBar } = setup({
      inMenu: false,
      primaryAction: <button type="button">New category</button>,
    });

    const action = within(topBar).getByRole("button", {
      name: "New category",
    }).parentElement;
    expect(action).toHaveAttribute("data-slot", "admin-primary-action");
    // Fixed along the bottom on a phone, in the bar's row from md up.
    expect(action).toHaveClass(
      "fixed",
      "inset-x-0",
      "bottom-0",
      "md:static",
      "md:p-0"
    );
    // The page ends above the bar on a phone.
    expect(body).toHaveClass("pb-40", "md:pb-12");
  });

  test("leaves the page's end alone without a main action", () => {
    const { body, topBar } = setup({ inMenu: false });

    expect(
      topBar.querySelector('[data-slot="admin-primary-action"]')
    ).toBeNull();
    expect(body).toHaveClass("pb-12");
    expect(body).not.toHaveClass("pb-40");
  });

  test("makes the heading a focus target only when the screen asks for one", () => {
    const titleRef = createRef<HTMLHeadingElement>();
    setup({ inMenu: false, titleRef });

    const heading = screen.getByRole("heading");
    expect(titleRef.current).toBe(heading);
    expect(heading).toHaveAttribute("tabindex", "-1");
    titleRef.current?.focus();
    expect(heading).toHaveFocus();
  });

  test("leaves the heading out of focus without a ref", () => {
    setup({ inMenu: false });

    expect(screen.getByRole("heading")).not.toHaveAttribute("tabindex");
  });
});
