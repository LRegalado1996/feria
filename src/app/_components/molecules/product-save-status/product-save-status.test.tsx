import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import {
  type ProductSaveState,
  ProductSaveStatus,
} from "./product-save-status";

function setup({
  locale = "en",
  state = "saved",
}: { locale?: Locale; state?: ProductSaveState } = {}) {
  const onRetry = vi.fn<() => void>();
  const user = userEvent.setup();
  renderWithI18n(<ProductSaveStatus onRetry={onRetry} state={state} />, {
    locale,
  });

  return { onRetry, user };
}

describe("ProductSaveStatus", () => {
  test.each([
    ["saving", "Saving…"],
    ["saved", "Saved"],
    ["failed", "Couldn't save."],
    ["invalid", "Check the marked fields: it can't be saved like this."],
    ["notYet", "It saves itself once the first photo is uploaded."],
    ["unsaved", "Unsaved changes"],
    ["clean", "No changes"],
    ["idle", ""],
  ] as const)("says %s in its polite live region", (state, said) => {
    setup({ state });

    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent(said === "" ? /^$/u : said);
    expect(screen.getByTestId("product-save-status")).toHaveAttribute(
      "data-state",
      state
    );
  });

  test("offers a retry once a save failed, and sends it", async () => {
    const { onRetry, user } = setup({ state: "failed" });

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(onRetry).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "click" })
    );
  });

  test.each(["saving", "saved", "invalid", "unsaved"] as const)(
    "offers no retry while %s",
    (state) => {
      setup({ state });

      expect(screen.queryByRole("button")).toBeNull();
    }
  );

  test.each([
    ["failed", true],
    ["invalid", true],
    ["saved", false],
  ] as const)("draws %s as a problem: %s", (state, alarming) => {
    setup({ state });

    expect(
      screen
        .getByTestId("product-save-status")
        .className.includes("text-destructive")
    ).toBe(alarming);
  });

  test("in Spanish, says it in Spanish", () => {
    setup({ locale: "es", state: "saving" });

    expect(screen.getByRole("status")).toHaveTextContent("Guardando…");
  });
});
