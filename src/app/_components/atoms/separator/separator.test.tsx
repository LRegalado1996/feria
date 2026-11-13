import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Separator, type SeparatorProps } from "./separator";

function setup(props: SeparatorProps = {}) {
  const { container } = render(<Separator {...props} />);

  return container.querySelector('[data-slot="separator"]');
}

describe("Separator", () => {
  test("is a decorative horizontal rule by default, hidden from assistive tech", () => {
    const separator = setup({ className: "my-4" });

    expect(separator).toHaveAttribute("data-orientation", "horizontal");
    expect(separator).toHaveAttribute("role", "none");
    expect(separator).toHaveClass("my-4");
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });

  test("announces itself when it carries meaning", () => {
    setup({ decorative: false, orientation: "vertical" });

    const separator = screen.getByRole("separator");
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("data-orientation", "vertical");
  });
});
