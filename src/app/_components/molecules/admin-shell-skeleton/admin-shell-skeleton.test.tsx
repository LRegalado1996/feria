import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { AdminShellSkeleton } from "./admin-shell-skeleton";

describe("AdminShellSkeleton", () => {
  test.each([
    ["en", "Loading"],
    ["es", "Cargando"],
  ] as const satisfies [Locale, string][])(
    "in %s, is a busy region that announces %j and shows nothing else",
    (locale, loading) => {
      renderWithI18n(<AdminShellSkeleton />, { locale });

      const skeleton = screen.getByTestId("admin-shell-skeleton");
      expect(skeleton).toHaveAttribute("aria-busy", "true");
      expect(skeleton).toHaveAttribute("data-slot", "admin-shell-skeleton");
      expect(screen.getByRole("status")).toHaveTextContent(
        new RegExp(`^${loading}$`, "u")
      );
      expect(skeleton).toHaveTextContent(new RegExp(`^${loading}$`, "u"));
    }
  );

  test("mirrors the shell: the logo and a row per section beside the top bar, from md up", () => {
    renderWithI18n(<AdminShellSkeleton />);

    const skeleton = screen.getByTestId("admin-shell-skeleton");
    expect(skeleton).toHaveClass(
      "md:grid",
      "md:grid-cols-[16rem_minmax(0,1fr)]"
    );
    // The logo is the brand, no secret, and says nothing while it waits.
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(skeleton.querySelector('[data-slot="store-logo"]')).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    const sidebar = skeleton.querySelector('[data-slot="store-logo"]')
      ?.parentElement?.parentElement;
    expect(sidebar).toHaveClass("hidden", "md:flex");
    expect(sidebar?.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(8);
  });
});
