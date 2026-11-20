import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StoreSharePreview } from "./store-share-preview";

function setup(
  overrides: Partial<Parameters<typeof StoreSharePreview>[0]> = {}
) {
  render(
    <StoreSharePreview
      photoUrl="/seed/ring-2.jpg"
      price="$ 1.290"
      storeName="LR Market"
      title="Anillo de plata"
      {...overrides}
    />
  );

  return {
    card: screen.getByTestId("store-share-preview"),
    photo: screen.getByTestId("store-share-preview-photo"),
  };
}

describe("StoreSharePreview", () => {
  test("draws the photo beside the store's name, the article's name and its price, hidden from the ear", () => {
    const { card, photo } = setup();

    expect(card).toHaveAttribute("aria-hidden", "true");
    expect(photo).toHaveStyle({
      backgroundImage: 'url("/seed/ring-2.jpg")',
    });
    expect(
      [...card.querySelectorAll("p")].map((line) => line.textContent)
    ).toEqual(["LR Market", "Anillo de plata", "$ 1.290"]);
  });

  test("leaves the moss block without a photo the card cannot draw", () => {
    const { photo } = setup({ photoUrl: null });

    expect(photo.style.backgroundImage).toBe("");
    expect(photo.className).toContain("bg-store-contrast");
  });

  test("writes no price while the article has none", () => {
    const { card } = setup({ price: null });

    expect(
      [...card.querySelectorAll("p")].map((line) => line.textContent)
    ).toEqual(["LR Market", "Anillo de plata"]);
  });
});
