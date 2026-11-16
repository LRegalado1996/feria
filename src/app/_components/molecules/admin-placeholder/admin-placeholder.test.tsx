import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { AdminPlaceholder } from "./admin-placeholder";

describe("AdminPlaceholder", () => {
  test("names the section in the page's one heading, then its status and what to expect", () => {
    render(
      <AdminPlaceholder
        body="This section is still being built."
        status="Coming soon"
        title="Orders"
      />
    );

    const section = screen.getByTestId("admin-placeholder");
    expect(section).toHaveAttribute("data-slot", "admin-placeholder");
    expect(
      screen
        .getAllByRole("heading")
        .map((heading) => [heading.tagName, heading.textContent])
    ).toEqual([["H1", "Orders"]]);
    expect(section).toHaveTextContent(
      /^OrdersComing soonThis section is still being built\.$/
    );
  });
});
