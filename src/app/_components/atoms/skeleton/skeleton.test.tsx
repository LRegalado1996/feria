import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Skeleton, type SkeletonProps } from "./skeleton";

function setup(props: SkeletonProps = {}) {
  render(<Skeleton data-testid="skeleton" {...props} />);

  return screen.getByTestId("skeleton");
}

describe("Skeleton", () => {
  test("is a pulsing block marked with its slot", () => {
    const skeleton = setup({ className: "h-4 w-20" });

    expect(skeleton.tagName).toBe("DIV");
    expect(skeleton).toHaveAttribute("data-slot", "skeleton");
    expect(skeleton).toHaveClass("animate-pulse", "h-4", "w-20");
  });

  test("renders a span where only phrasing content is valid", () => {
    const skeleton = setup({ as: "span" });

    expect(skeleton.tagName).toBe("SPAN");
    expect(skeleton).toHaveAttribute("data-slot", "skeleton");
  });
});
