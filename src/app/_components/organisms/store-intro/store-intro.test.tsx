import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StoreIntro, type StoreIntroProps } from "./store-intro";

const SPANISH = {
  description: "Anillos y cadenas hechos a mano.",
  locale: "es",
  tagline: "Joyas en la feria",
} as const;
const ENGLISH = {
  description: "Handmade rings and chains.",
  locale: "en",
  tagline: "Jewelry at the fair",
} as const;

function setup(props: Partial<StoreIntroProps> = {}) {
  render(
    <StoreIntro
      data-testid="intro"
      name="Sample Store"
      text={SPANISH}
      {...props}
    />
  );

  return { intro: screen.getByTestId("intro") };
}

describe("StoreIntro", () => {
  test("names the store in the single h1, on the contrast block", () => {
    setup();

    expect(
      screen.getAllByRole("heading").map((heading) => heading.tagName)
    ).toEqual(["H1"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Sample Store$/
    );
    expect(screen.getByTestId("store-header")).toHaveClass("bg-store-contrast");
    expect(screen.getByTestId("store-header")).toContainElement(
      screen.getByRole("heading", { level: 1 })
    );
  });

  test("sets the name in the accent color, which only reads on the contrast block", () => {
    setup();

    expect(screen.getByText("Sample Store")).toHaveClass("text-store-accent");
  });

  test.each([
    ["Spanish", SPANISH],
    ["English", ENGLISH],
  ])(
    "shows the %s tagline above the name and the description on a surface, each marked with its language",
    (_language, text) => {
      setup({ text });

      const tagline = screen.getByText(text.tagline);
      expect(tagline).toHaveAttribute("lang", text.locale);
      expect(screen.getByTestId("store-header")).toContainElement(tagline);
      expect(screen.getByTestId("store-description")).toHaveTextContent(
        text.description
      );
      expect(screen.getByTestId("store-description")).toHaveAttribute(
        "lang",
        text.locale
      );
      expect(screen.getByTestId("store-description")).toHaveClass(
        "bg-store-surface"
      );
    }
  );

  test("a store that has written nothing shows its name and no empty block", () => {
    const { intro } = setup({ text: null });

    expect(intro).toHaveTextContent(/^Sample Store$/);
    expect(screen.queryByTestId("store-description")).not.toBeInTheDocument();
  });

  test("lets a long name wrap instead of widening a phone", () => {
    setup({ name: "Bisutería-Internacional-Montevideo" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveClass(
      "wrap-anywhere"
    );
  });

  test("keeps a caller's class and carries its slot", () => {
    const { intro } = setup({ className: "pb-24" });

    expect(intro).toHaveClass("pb-24", "flex");
    expect(intro).toHaveAttribute("data-slot", "store-intro");
  });
});
