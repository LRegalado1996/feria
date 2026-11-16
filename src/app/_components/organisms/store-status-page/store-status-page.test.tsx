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

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "We could not find this page",
    });
    expect(heading).toBeVisible();
    // The page's title in the wide display face; the body in the body face.
    expect(heading).toHaveClass(
      "font-display",
      "font-extrabold",
      "uppercase",
      "store-display-page"
    );
    expect(screen.getByText("The link may be old.")).not.toHaveClass(
      "font-display"
    );
    expect(screen.getByText("The link may be old.")).toBeVisible();
    expect(page).toHaveClass("custom");
    expect(screen.queryByRole("button")).toBeNull();
    // A miss is not announced as it renders.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("shows the action it is given", () => {
    setup({ action: <Link href="/">Back home</Link> });

    expect(screen.getByRole("link", { name: "Back home" })).toHaveAttribute(
      "href",
      "/"
    );
  });

  test("tries again with its retry button", async () => {
    const { onRetry } = setup({ withRetry: true });

    // A failure is announced: the body is the alert.
    expect(screen.getByRole("alert")).toHaveTextContent(
      /^The link may be old\.$/u
    );

    const retry = screen.getByRole("button", { name: "Try again" });
    // The one way out: the store's primary pill.
    expect(retry).toHaveAttribute("data-slot", "store-button");
    expect(retry).toHaveAttribute("data-variant", "primary");
    expect(retry).toHaveAttribute("type", "button");

    await userEvent.setup().click(retry);

    expect(onRetry.mock.calls).toEqual([[]]);
  });
});
