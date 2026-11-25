import { screen, within } from "@testing-library/react";
import Link from "next/link";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { AdminFrame } from "./admin-frame";

/** How many frames the document holds, as after navigating in the admin. */
function setup({
  frames = 1,
  locale = "en",
}: { frames?: number; locale?: Locale } = {}) {
  renderWithI18n(
    <>
      {Array.from({ length: frames }, (_, index) => (
        <AdminFrame
          className="custom"
          data-testid={`frame-${index}`}
          key={index}
          sidebar={
            <nav aria-label="Admin sections">
              <Link href="/en/admin/orders">Orders {index}</Link>
            </nav>
          }
        >
          <p>Screen {index}</p>
        </AdminFrame>
      ))}
    </>,
    { locale }
  );

  // Each frame's skip link, by its text, and the main landmark it targets.
  const frame = (index: number) => {
    const scope = within(screen.getByTestId(`frame-${index}`));
    const skip = scope.getByRole("link", {
      name: locale === "en" ? "Skip to content" : "Saltar al contenido",
    });

    return { main: scope.getByRole("main"), scope, skip };
  };

  return { frame };
}

describe("AdminFrame", () => {
  test("renders the screen in the main landmark its skip link targets", () => {
    const { frame } = setup();

    const { main, skip } = frame(0);
    expect(within(main).getByText("Screen 0")).toBeInTheDocument();
    expect(main.id).not.toBe("");
    expect(skip).toHaveAttribute("href", `#${main.id}`);
    // Focusable by the skip link without being a stop of the Tab order.
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  test("gives each frame's landmark an id of its own, which only its skip link targets", () => {
    // Next keeps the screens left behind mounted, hidden: three frames.
    const { frame } = setup({ frames: 3 });

    const frames = [frame(0), frame(1), frame(2)];
    const ids = frames.map(({ main }) => main.id);
    expect(new Set(ids).size).toBe(3);

    for (const { main, skip } of frames) {
      expect(skip).toHaveAttribute("href", `#${main.id}`);
      expect(document.querySelectorAll(`[id="${main.id}"]`)).toHaveLength(1);
    }
  });

  test("sets the sidebar in a banner beside the screen from md up, hidden on a phone", () => {
    const { frame } = setup();

    const { scope } = frame(0);
    const banner = scope.getByRole("banner");
    expect(
      within(banner).getByRole("navigation", { name: "Admin sections" })
    ).toHaveTextContent("Orders 0");
    expect(banner).toHaveClass("hidden", "md:block", "sticky", "h-dvh");
    expect(screen.getByTestId("frame-0")).toHaveClass(
      "md:grid",
      "md:grid-cols-[16rem_minmax(0,1fr)]",
      "bg-sidebar",
      "custom"
    );
    expect(screen.getByTestId("frame-0")).toHaveAttribute(
      "data-slot",
      "admin-frame"
    );
  });

  test("puts the skip link first, before the sidebar's links", () => {
    const { frame } = setup();

    const { scope, skip } = frame(0);
    expect(scope.getAllByRole("link")).toEqual([
      skip,
      scope.getByRole("link", { name: "Orders 0" }),
    ]);
    expect(skip).toHaveClass("sr-only", "focus:not-sr-only");
  });

  test("speaks Spanish in the skip link", () => {
    const { frame } = setup({ locale: "es" });

    const { main, skip } = frame(0);
    expect(skip).toHaveAttribute("href", `#${main.id}`);
  });
});
