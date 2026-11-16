import type { ReactElement } from "react";
import { describe, expect, test, vi } from "vitest";

import { AdminSectionPlaceholder } from "../admin-section-placeholder";
import UsersPage from "./page";

// The placeholder has its own tests; here only what the page hands it counts.
vi.mock("../admin-section-placeholder", () => ({
  AdminSectionPlaceholder: () => null,
}));

describe("UsersPage", () => {
  test("renders the admin's placeholder for the users section, with its own params", () => {
    const params = Promise.resolve({ locale: "es" });

    const page: ReactElement<{ params: unknown; section: string }> = UsersPage({
      params,
    });

    expect(page.type).toBe(AdminSectionPlaceholder);
    expect(page.props).toEqual({ params, section: "users" });
    expect(page.props.params).toBe(params);
  });
});
