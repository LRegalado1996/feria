import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";

import { AdminSectionPlaceholder } from "../admin-section-placeholder";
import MetricsPage from "./page";

// The placeholder has its own tests; here only what the page hands it counts.
vi.mock("../admin-section-placeholder", () => ({
  AdminSectionPlaceholder: () => null,
}));

describe("MetricsPage", () => {
  test("renders the admin's placeholder for the metrics section, with its own params", () => {
    const params = Promise.resolve({ locale: "es" });

    const page: ReactElement<{ params: unknown; section: string }> =
      MetricsPage({ params });

    expect(page.type).toBe(AdminSectionPlaceholder);
    expect(page.props).toEqual({ params, section: "metrics" });
    expect(page.props.params).toBe(params);
  });
});
