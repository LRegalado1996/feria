import { screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { renderWithI18n } from "@/test/i18n";

import { StoreCatalogSkeleton } from "./store-catalog-skeleton";

describe("StoreCatalogSkeleton", () => {
  test.each([
    ["es", "Cargando"],
    ["en", "Loading"],
  ] as const)("in %s, is busy and says %j", (locale, text) => {
    renderWithI18n(<StoreCatalogSkeleton />, { locale });

    const skeleton = screen.getByTestId("store-catalog-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveTextContent(new RegExp(`^${text}$`, "u"));
    expect(skeleton).toHaveAttribute("data-slot", "store-catalog-skeleton");
  });
});
