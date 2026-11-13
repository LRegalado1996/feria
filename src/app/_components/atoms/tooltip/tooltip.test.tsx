import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

function setup() {
  const user = userEvent.setup();

  render(
    <Tooltip>
      <TooltipTrigger asChild>
        <button aria-label="More actions: Weekend plans" type="button">
          …
        </button>
      </TooltipTrigger>
      <TooltipContent className="custom">More actions</TooltipContent>
    </Tooltip>
  );

  return { trigger: screen.getByRole("button"), user };
}

describe("Tooltip", () => {
  test("stays hidden until the trigger is hovered or focused", () => {
    const { trigger } = setup();

    expect(trigger).toHaveAttribute("data-slot", "tooltip-trigger");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("repeats the label on keyboard focus, keeping the trigger's own name", async () => {
    const { trigger, user } = setup();

    await user.tab();

    expect(trigger).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "More actions"
    );
    expect(trigger).toHaveAccessibleName("More actions: Weekend plans");
    expect(document.querySelector('[data-slot="tooltip-content"]')).toHaveClass(
      "custom"
    );
  });

  test("shows on hover", async () => {
    const { trigger, user } = setup();

    await user.hover(trigger);

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "More actions"
    );
  });
});
