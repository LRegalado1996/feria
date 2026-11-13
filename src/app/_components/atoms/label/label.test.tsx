import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Label, type LabelProps } from "./label";

function setup(props: Partial<LabelProps> = {}) {
  render(
    <>
      <Label htmlFor="email" {...props}>
        Email
      </Label>
      <input id="email" />
    </>
  );

  return {
    input: screen.getByRole("textbox"),
    label: screen.getByText("Email"),
  };
}

describe("Label", () => {
  test("names its control and carries its slot", () => {
    const { input, label } = setup({ className: "custom" });

    expect(input).toHaveAccessibleName("Email");
    expect(label).toHaveAttribute("data-slot", "label");
    expect(label).toHaveClass("custom");
  });

  test("marks a required field with an asterisk screen readers skip", () => {
    const { input, label } = setup({ required: true });

    const mark = label.querySelector('[data-slot="label-required"]');
    expect(mark).toHaveTextContent("*");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(input).toHaveAccessibleName("Email");
  });

  test("shows no asterisk on an optional field", () => {
    const { label } = setup();

    expect(
      label.querySelector('[data-slot="label-required"]')
    ).not.toBeInTheDocument();
  });
});
