import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";

import { AdminSectionPlaceholder } from "../admin-section-placeholder";
import SettingsPage from "./page";

// The placeholder has its own tests; here only what the page hands it counts.
vi.mock("../admin-section-placeholder", () => ({
  AdminSectionPlaceholder: () => null,
}));

describe("SettingsPage", () => {
  test("renders the admin's placeholder for the settings section, with its own params", () => {
    const params = Promise.resolve({ locale: "es" });

    const page: ReactElement<{ params: unknown; section: string }> =
      SettingsPage({ params });

    expect(page.type).toBe(AdminSectionPlaceholder);
    expect(page.props).toEqual({ params, section: "settings" });
    expect(page.props.params).toBe(params);
  });
});
