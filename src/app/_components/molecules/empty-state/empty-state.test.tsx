import { render, screen } from "@testing-library/react";
import { MessageSquare } from "lucide-react";
import { describe, expect, test } from "vitest";

import { EmptyState, type EmptyStateProps } from "./empty-state";

function setup(props: Partial<EmptyStateProps> = {}) {
  render(<EmptyState message="No posts yet." {...props} />);

  const root = screen.getByTestId("empty-state");
  return { icon: root.querySelector("svg"), root };
}

describe("EmptyState", () => {
  test("says the list is empty, with a decorative icon hidden from assistive tech", () => {
    const { icon, root } = setup({ className: "custom" });

    expect(root).toHaveAttribute("data-slot", "empty-state");
    expect(root).toHaveClass("custom");
    expect(root).toHaveTextContent("No posts yet.");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveClass("lucide-inbox");
  });

  test("draws the icon it is given instead of the default", () => {
    const { icon } = setup({ icon: MessageSquare });

    expect(icon).toHaveClass("lucide-message-square");
  });
});
