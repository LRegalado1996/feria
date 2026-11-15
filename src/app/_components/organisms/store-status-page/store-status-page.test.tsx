import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { StoreStatusPage } from "./store-status-page";

function setup({
  action,
  withRetry = false,
}: { action?: ReactNode; withRetry?: boolean } = {}) {
  const onRetry = vi.fn<() => void>();
  render(
    <StoreStatusPage
      action={action}
      body="The link may be old."
      className="custom"
      retry={withRetry ? { label: "Try again", onRetry } : undefined}
      title="We could not find this page"
    />
  );

  return { onRetry, page: screen.getByTestId("store-status-page") };
}

describe("StoreStatusPage", () => {
  test("says what happened in a heading and a body", () => {
    const { page } = setup();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "We could not find this page",
      })
    ).toBeVisible();
    expect(screen.getByText("The link may be old.")).toBeVisible();
    expect(page).toHaveClass("custom");
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("shows the action it is given", () => {
    setup({ action: <Link href="/lr-market">Back home</Link> });

    expect(screen.getByRole("link", { name: "Back home" })).toHaveAttribute(
      "href",
      "/lr-market"
    );
  });

  test("tries again with its retry button", async () => {
    const { onRetry } = setup({ withRetry: true });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry.mock.calls).toEqual([[]]);
  });
});
