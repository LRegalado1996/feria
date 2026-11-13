import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { Textarea, type TextareaProps } from "./textarea";

function setup(props: TextareaProps = {}) {
  const user = userEvent.setup();
  render(<Textarea aria-label="Message" {...props} />);

  return { textarea: screen.getByRole("textbox", { name: "Message" }), user };
}

describe("Textarea", () => {
  test("takes what the user types", async () => {
    const { textarea, user } = setup();

    await user.type(textarea, "Hello there");

    expect(textarea).toHaveValue("Hello there");
    expect(textarea).toHaveAttribute("data-slot", "textarea");
  });

  test("wraps a long unbroken token instead of widening its container", () => {
    const { textarea } = setup();

    expect(textarea).toHaveClass(
      "min-w-0",
      "wrap-anywhere",
      "field-sizing-content"
    );
  });

  test("shows a visible focus ring and an invalid state", () => {
    const { textarea } = setup({ "aria-invalid": true, className: "custom" });

    expect(textarea).toHaveClass(
      "focus-visible:ring-[3px]",
      "aria-invalid:border-destructive",
      "custom"
    );
  });

  test("refuses input while disabled", async () => {
    const { textarea, user } = setup({ disabled: true });

    await user.type(textarea, "ignored");

    expect(textarea).toHaveValue("");
  });
});
