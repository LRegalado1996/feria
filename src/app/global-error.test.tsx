import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import GlobalError from "./global-error";

const { reporter } = vi.hoisted(() => ({
  reporter: { reportError: vi.fn() },
}));

vi.mock("@/styles/globals.css", () => ({}));

vi.mock("@/lib/errors/client", () => ({
  reportError: reporter.reportError,
}));

/**
 * The page renders its own `<html>`, so it is mounted on the document itself
 * rather than inside a `<div>`, where React would reject the nesting.
 */
function setup({ reporterFailure }: { reporterFailure?: Error } = {}) {
  if (reporterFailure) {
    reporter.reportError.mockImplementationOnce(() => {
      throw reporterFailure;
    });
  }

  const browserReport = vi.fn();
  vi.stubGlobal("reportError", browserReport);
  const error = new Error("root layout failed");
  const retry = vi.fn<() => void>();

  render(<GlobalError error={error} retry={retry} />, {
    container: document,
  });

  return { browserReport, error, retry };
}

describe("GlobalError", () => {
  test("reports the error through the client funnel", async () => {
    const { browserReport, error } = setup();

    await waitFor(() => {
      expect(reporter.reportError).toHaveBeenCalledExactlyOnceWith(error, {
        action: "App.root_failed",
      });
    });
    expect(browserReport).not.toHaveBeenCalled();
  });

  test("falls back to the browser's reportError when the reporter fails", async () => {
    const reporterFailure = new Error("chunk failed");
    const { browserReport, error } = setup({ reporterFailure });

    await waitFor(() => {
      expect(browserReport).toHaveBeenCalledTimes(2);
    });
    expect(browserReport).toHaveBeenNthCalledWith(1, error);
    expect(browserReport).toHaveBeenNthCalledWith(2, reporterFailure);
  });

  test("retries on request", async () => {
    const { retry } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "click" })
    );
  });
});
