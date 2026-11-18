import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { PublishGap } from "@/lib/catalog/publish-gaps";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { ProductPublishGaps } from "./product-publish-gaps";

function setup({
  gaps = ["image", "price", "englishTitle"],
  locale = "en",
}: { gaps?: PublishGap[]; locale?: Locale } = {}) {
  const onJump = vi.fn<(gap: PublishGap) => void>();
  const user = userEvent.setup();
  renderWithI18n(<ProductPublishGaps gaps={gaps} onJump={onJump} />, {
    locale,
  });

  return { onJump, user };
}

describe("ProductPublishGaps", () => {
  test("lists what is missing under its heading, each a button to its field", () => {
    setup();

    const missing = within(
      screen.getByRole("region", { name: "To publish it still needs:" })
    );
    expect(
      missing
        .getAllByRole("button")
        .map((button) => [
          button.getAttribute("aria-label"),
          button.textContent,
        ])
    ).toEqual([
      ["Complete: A photo", "A photo"],
      ["Complete: The price", "The price"],
      ["Complete: The English title", "The English title"],
    ]);
  });

  test.each([
    ["image", "Complete: A photo"],
    ["category", "Complete: The category"],
    ["price", "Complete: The price"],
    ["spanishTitle", "Complete: The title"],
    ["englishTitle", "Complete: The English title"],
  ] as const)("leads to the %s", async (gap, name) => {
    const { onJump, user } = setup({ gaps: [gap] });

    await user.click(screen.getByRole("button", { name }));

    expect(onJump).toHaveBeenCalledExactlyOnceWith(gap);
  });

  test("says the article is ready once nothing is missing", () => {
    setup({ gaps: [] });

    expect(screen.getByTestId("product-publish-ready")).toHaveTextContent(
      "It has everything it needs to be published."
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("in Spanish, says it in Spanish", () => {
    setup({ gaps: ["spanishTitle"], locale: "es" });

    expect(
      screen.getByRole("region", { name: "Para publicar falta:" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Completar: El título" })
    ).toBeVisible();
  });
});
