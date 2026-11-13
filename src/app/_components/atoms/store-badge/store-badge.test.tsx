import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { StoreBadge, type StoreBadgeProps } from "./store-badge";

function setup(props: StoreBadgeProps = {}) {
  render(<StoreBadge {...props}>New</StoreBadge>);

  return { badge: screen.getByText("New") };
}

describe("StoreBadge", () => {
  test("is a display-face label on the accent by default", () => {
    const { badge } = setup();

    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveAttribute("data-slot", "store-badge");
    expect(badge).toHaveAttribute("data-tone", "accent");
    expect(badge).toHaveClass(
      "font-display",
      "uppercase",
      "bg-store-accent",
      "text-store-foreground"
    );
  });

  test("the contrast tone inverts it", () => {
    const { badge } = setup({ tone: "contrast" });

    expect(badge).toHaveAttribute("data-tone", "contrast");
    expect(badge).toHaveClass("bg-store-contrast", "text-store-background");
    expect(badge).not.toHaveClass("bg-store-accent");
  });

  test("keeps a caller's class", () => {
    const { badge } = setup({ className: "absolute top-3" });

    expect(badge).toHaveClass("absolute", "top-3", "font-display");
  });
});
