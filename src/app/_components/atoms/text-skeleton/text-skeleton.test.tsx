import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { TextSkeleton, type TextSkeletonProps } from "./text-skeleton";

function setup(props: TextSkeletonProps = {}) {
  const { container } = render(
    <h2>
      <TextSkeleton {...props} />
    </h2>
  );

  return container.querySelector('[data-slot="skeleton"]');
}

describe("TextSkeleton", () => {
  test("is an em-sized span, valid and line-box sized inside a heading", () => {
    const bar = setup();

    expect(bar?.tagName).toBe("SPAN");
    expect(bar?.parentElement?.tagName).toBe("H2");
    expect(bar).toHaveClass(
      "inline-block",
      "h-[0.8em]",
      "align-middle",
      "w-24"
    );
  });

  test("takes the caller's width instead of the default", () => {
    const bar = setup({ className: "w-40" });

    expect(bar).toHaveClass("w-40");
    expect(bar).not.toHaveClass("w-24");
  });
});
