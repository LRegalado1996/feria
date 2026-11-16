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

const BROWSE = { href: "/products", label: "Ver el catálogo" };

function setup(props: Partial<StoreIntroProps> = {}) {
  render(
    <StoreIntro
      browse={BROWSE}
      data-testid="intro"
      name="Sample Store"
      text={SPANISH}
      {...props}
    />
  );

  return { intro: screen.getByTestId("intro") };
}

describe("StoreIntro", () => {
  test("names the store in the single h1, on the white page", () => {
    setup();

    expect(
      screen.getAllByRole("heading").map((heading) => heading.tagName)
    ).toEqual(["H1"]);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Sample Store$/
    );
    expect(screen.getByTestId("store-intro-header")).toHaveClass(
      "bg-store-background",
      "text-store-foreground"
    );
    expect(screen.getByTestId("store-intro-header")).toContainElement(
      screen.getByRole("heading", { level: 1 })
    );
  });

  test("sets the name in the foreground, never the accent, which does not read on white", () => {
    setup();

    expect(screen.getByText("Sample Store")).not.toHaveClass(
      "text-store-accent"
    );
  });

  test("sets the name in the hero size of the wide display face", () => {
    setup();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveAttribute("data-size", "hero");
    expect(heading).toHaveClass("font-display", "font-extrabold", "uppercase");
  });

  test.each([
    ["Spanish", SPANISH],
    ["English", ENGLISH],
  ])(
    "shows the %s tagline above the name and the description under it, each marked with its language",
    (_language, text) => {
      setup({ text });

      const tagline = screen.getByText(text.tagline);
      expect(tagline).toHaveAttribute("lang", text.locale);
      expect(tagline.compareDocumentPosition(screen.getByRole("heading"))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
      const description = screen.getByTestId("store-description");
      expect(description).toHaveTextContent(text.description);
      expect(description).toHaveAttribute("lang", text.locale);
      expect(
        screen.getByRole("heading").compareDocumentPosition(description)
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  );

  test("leads into the catalog with a lime pill", () => {
    setup();

    const browse = screen.getByRole("link", { name: "Ver el catálogo" });
    expect(browse).toHaveAttribute("href", "/products");
    expect(browse).toHaveAttribute("data-slot", "store-button");
    expect(browse).toHaveAttribute("data-variant", "primary");
  });

  test("a store that has written nothing shows its name, the way in, and no empty block", () => {
    const { intro } = setup({ text: null });

    expect(intro).toHaveTextContent(/^Sample StoreVer el catálogo$/);
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
