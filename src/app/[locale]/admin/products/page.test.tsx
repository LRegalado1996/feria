import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";

import { AdminSectionPlaceholder } from "../admin-section-placeholder";
import ProductsPage from "./page";

// The placeholder has its own tests; here only what the page hands it counts.
vi.mock("../admin-section-placeholder", () => ({
  AdminSectionPlaceholder: () => null,
}));

describe("ProductsPage", () => {
  test("renders the admin's placeholder for the products section, with its own params", () => {
    const params = Promise.resolve({ locale: "es" });

    const page: ReactElement<{ params: unknown; section: string }> =
      ProductsPage({ params });

    expect(page.type).toBe(AdminSectionPlaceholder);
    expect(page.props).toEqual({ params, section: "products" });
    expect(page.props.params).toBe(params);
  });
});
