import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { Input, type TextInputProps } from "./input";

function setupText(props: TextInputProps = {}) {
  const user = userEvent.setup();
  render(<Input aria-label="Field" {...props} />);

  return { input: screen.getByLabelText("Field"), user };
}

/** A numeric field whose value lives in its parent, as in a form. */
function setupNumber({
  allowDecimal,
  initial = null,
}: {
  allowDecimal?: boolean;
  initial?: number | null;
} = {}) {
  const onValueChange = vi.fn((_value: number | null) => undefined);
  const onBlur = vi.fn(() => undefined);
  const user = userEvent.setup();

  function Field() {
    const [value, setValue] = useState<number | null>(initial);

    return (
      <>
        <Input
          allowDecimal={allowDecimal}
          aria-label="Amount"
          onBlur={onBlur}
          onValueChange={(next) => {
            setValue(next);
            onValueChange(next);
          }}
          type="number"
          value={value}
        />
        <button
          onClick={() => {
            setValue(42);
          }}
          type="button"
        >
          Set 42
        </button>
      </>
    );
  }

  render(<Field />);

  return {
    input: screen.getByLabelText<HTMLInputElement>("Amount"),
    onBlur,
    onValueChange,
    user,
  };
}

describe("Input (text)", () => {
  test("is a text field marked with its slot, taking the caller's attributes", async () => {
    const { input, user } = setupText({ className: "custom", type: "email" });

    await user.type(input, "ada@example.com");

    expect(input).toHaveValue("ada@example.com");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("data-slot", "input");
    expect(input).toHaveClass("custom", "min-w-0", "focus-visible:ring-[3px]");
  });

  test("shows its invalid state through aria-invalid", () => {
    const { input } = setupText({ "aria-invalid": true });

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveClass("aria-invalid:border-destructive");
  });
});

describe("Input (number)", () => {
  test("is a text field with a decimal keypad, never a spinbutton", () => {
    const { input } = setupNumber({ initial: 0 });

    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "decimal");
    expect(input).toHaveAttribute("data-slot", "input");
    expect(input).toHaveValue("0");
  });

  test("can be cleared: an empty field is null, not 0", async () => {
    const { input, onValueChange, user } = setupNumber({ initial: 0 });

    await user.clear(input);

    expect(input).toHaveValue("");
    expect(onValueChange).toHaveBeenLastCalledWith(null);
  });

  test("keeps in-progress text and reports each number it reaches", async () => {
    const { input, onValueChange, user } = setupNumber();

    await user.type(input, "-1.5");

    expect(input).toHaveValue("-1.5");
    expect(onValueChange.mock.calls.map(([value]) => value)).toEqual([
      null,
      -1,
      -1,
      -1.5,
    ]);
  });

  test("reads the locale's grouping, so en-US 1,500 is fifteen hundred", async () => {
    const { input, onValueChange, user } = setupNumber();

    await user.type(input, "1,500");

    expect(input).toHaveValue("1500");
    expect(onValueChange).toHaveBeenLastCalledWith(1500);
  });

  test("refuses letters, and a decimal point in an integer field", async () => {
    const { input, onValueChange, user } = setupNumber({ allowDecimal: false });

    await user.type(input, "4a.2");

    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveValue("42");
    expect(onValueChange).toHaveBeenLastCalledWith(42);
  });

  test("settles dangling text to the value when focus leaves", async () => {
    const { input, onBlur, user } = setupNumber();

    await user.type(input, "3.");
    await user.tab();

    expect(input).toHaveValue("3");
    expect(onBlur).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "blur", target: input })
    );
  });

  test("shows a value set from outside", async () => {
    const { input, user } = setupNumber({ initial: 7 });

    await user.click(screen.getByRole("button", { name: "Set 42" }));

    expect(input).toHaveValue("42");
  });

  test("shows NaN as an empty field", () => {
    const { input } = setupNumber({ initial: Number.NaN });

    expect(input).toHaveValue("");
  });
});
