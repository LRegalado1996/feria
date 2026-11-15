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
});
