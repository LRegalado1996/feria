import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StoreBadge, type StoreBadgeProps } from "./store-badge";

function setup(props: StoreBadgeProps = {}) {
  render(<StoreBadge {...props}>Nuevo</StoreBadge>);

  return { badge: screen.getByText("Nuevo") };
}

describe("StoreBadge", () => {
  test("is a white label in the display face, the foreground on it", () => {
    const { badge } = setup();

    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveAttribute("data-slot", "store-badge");
    expect(badge).toHaveClass(
      "font-display",
      "uppercase",
      "bg-store-background",
      "text-store-foreground"
    );
  });

  test("keeps a caller's class", () => {
    const { badge } = setup({ className: "absolute top-2.5" });

    expect(badge).toHaveClass("absolute", "top-2.5", "font-display");
  });
});
