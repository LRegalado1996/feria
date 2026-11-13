import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import ErrorPage from "./error";

const { reportError } = vi.hoisted(() => ({
  reportError: vi.fn((): string | null => "event-42"),
}));

vi.mock("@/lib/errors/client", () => ({ reportError }));

function setup({ eventId = "event-42" }: { eventId?: string | null } = {}) {
  reportError.mockReturnValue(eventId);
  const error = new Error("render failed");
  const retry = vi.fn<() => void>();

  render(<ErrorPage error={error} retry={retry} />);

  return { error, retry };
}

describe("ErrorPage", () => {
  test("reports the error once and shows its support code", async () => {
    const { error } = setup();

    expect(await screen.findByText("Support code:")).toHaveTextContent(
      "Support code: event-42"
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(error, {
      action: "App.render_failed",
    });
  });

  test("shows no support code when nothing was sent", () => {
    const { error } = setup({ eventId: null });

    expect(reportError).toHaveBeenCalledExactlyOnceWith(error, {
      action: "App.render_failed",
    });
    expect(screen.queryByText(/Support code/)).not.toBeInTheDocument();
  });

  test("retries the segment on request", async () => {
    const { retry } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "click" })
    );
  });
});
