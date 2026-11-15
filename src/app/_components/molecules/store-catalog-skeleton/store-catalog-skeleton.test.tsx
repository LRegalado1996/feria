import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { StoreCatalogSkeleton } from "./store-catalog-skeleton";

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

describe("StoreCatalogSkeleton", () => {
  test.each([
    [undefined, "Cargando"],
    ["es", "Cargando"],
    ["en", "Loading"],
  ] as const)("in %s, is busy and says %j", (locale, text) => {
    render(<StoreCatalogSkeleton locale={locale} />);

    const skeleton = screen.getByTestId("store-catalog-skeleton");
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    expect(skeleton).toHaveTextContent(new RegExp(`^${text}$`, "u"));
    expect(skeleton).toHaveAttribute("data-slot", "store-catalog-skeleton");
  });
});
