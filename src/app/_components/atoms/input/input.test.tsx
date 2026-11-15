import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { renderWithI18n } from "@/test/i18n";

import { Input, type TextInputProps } from "./input";

const UNREADABLE_EN =
  "We couldn't read this number. Type it without a thousands separator, for example 1500 or 12.50.";

function setupText(props: TextInputProps = {}) {
  const user = userEvent.setup();
  renderWithI18n(<Input aria-label="Field" {...props} />);

  return { input: screen.getByLabelText("Field"), user };
}

/** A numeric field whose value lives in its parent, as in a form. */
function setupNumber({
  accepts = () => true,
  allowDecimal,
  initial = null,
  locale = "en",
}: {
  /** Whether the parent keeps a value the field reports, as a form may not. */
  accepts?: (value: number | null) => boolean;
  allowDecimal?: boolean;
  initial?: number | null;
  locale?: "en" | "es";
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
          aria-describedby="form-hint"
          aria-label="Amount"
          onBlur={onBlur}
          onValueChange={(next) => {
            if (accepts(next)) {
              setValue(next);
            }
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

  renderWithI18n(<Field />, { locale });

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

  test.each([
    ["es", "12,50", 12.5, "12,5"],
    ["es", "12.50", 12.5, "12,5"],
    ["en", "12,50", 12.5, "12.5"],
    ["en", "12.50", 12.5, "12.5"],
    ["es", "1.500", 1500, "1500"],
    ["en", "1,500", 1500, "1500"],
    ["en", "1.500,5", 1500.5, "1500.5"],
  ] as const)(
    "on a %s page reads %j as %d and shows it as %j once focus leaves",
    async (locale, typed, value, shown) => {
      const { input, onValueChange, user } = setupNumber({ locale });

      await user.type(input, typed);

      expect(input).toHaveValue(typed);
      expect(onValueChange).toHaveBeenLastCalledWith(value);

      await user.tab();

      expect(input).toHaveValue(shown);
      expect(input).not.toHaveAttribute("aria-invalid");
    }
  );

  test("reads a pasted figure in the other notation without changing its magnitude", async () => {
    const { input, onValueChange, user } = setupNumber({ locale: "es" });

    await user.click(input);
    await user.paste("12.50");

    expect(onValueChange).toHaveBeenLastCalledWith(12.5);
  });

  test("on a Spanish page, shows an outside value with a decimal comma and settles dangling text to it", async () => {
    const { input, onValueChange, user } = setupNumber({
      initial: 2.5,
      locale: "es",
    });

    expect(input).toHaveValue("2,5");

    await user.clear(input);
    await user.type(input, "-3,");

    expect(input).toHaveValue("-3,");
    expect(onValueChange).toHaveBeenLastCalledWith(-3);

    await user.tab();

    expect(input).toHaveValue("-3");
  });

  test("refuses an ambiguous figure with a visible reason once focus leaves, and keeps it to be corrected", async () => {
    const { input, onValueChange, user } = setupNumber();

    await user.type(input, "0,500");

    expect(onValueChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(UNREADABLE_EN)).not.toBeInTheDocument();

    await user.tab();

    const message = screen.getByText(UNREADABLE_EN);
    expect(input).toHaveValue("0,500");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute(
      "aria-describedby",
      `form-hint ${message.id}`
    );

    await user.clear(input);
    await user.type(input, "0,50");

    expect(onValueChange).toHaveBeenLastCalledWith(0.5);
    expect(screen.queryByText(UNREADABLE_EN)).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-describedby", "form-hint");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  test("says why in Spanish on a Spanish page", async () => {
    const { input, user } = setupNumber({ locale: "es" });

    await user.type(input, "1.23.4");
    await user.tab();

    expect(
      screen.getByText(
        "No pudimos leer este número. Escribilo sin separador de miles, por ejemplo 1500 o 12,50."
      )
    ).toBeVisible();
  });

  test("refuses letters as they are typed, and a decimal in a whole-number field with its reason", async () => {
    const { input, onValueChange, user } = setupNumber({ allowDecimal: false });

    await user.type(input, "4a2");

    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveValue("42");
    expect(onValueChange).toHaveBeenLastCalledWith(42);

    await user.type(input, ",5");
    await user.tab();

    expect(onValueChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue("42,5");
    expect(
      screen.getByText("This field takes whole numbers only.")
    ).toBeVisible();
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

  test("once focus leaves, shows the value the parent kept, not the one it refused", async () => {
    const { input, onValueChange, user } = setupNumber({
      accepts: (value) => value === null || value >= 0,
      initial: 3,
    });

    await user.clear(input);
    await user.type(input, "-5");
    await user.tab();

    expect(onValueChange).toHaveBeenLastCalledWith(-5);
    expect(input).toHaveValue("");
  });

  test("hides a shown refusal as soon as the figure is being typed again", async () => {
    const { input, user } = setupNumber();

    await user.type(input, "1.23.4");
    await user.tab();

    expect(screen.getByText(UNREADABLE_EN)).toBeVisible();

    await user.click(input);
    await user.type(input, "5");

    expect(input).toHaveValue("1.23.45");
    expect(screen.queryByText(UNREADABLE_EN)).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  test.each([
    [" -5", -5],
    ["\u22125", -5],
  ])("lets a pasted %j through and reads it as %d", async (pasted, value) => {
    const { input, onValueChange, user } = setupNumber();

    await user.click(input);
    await user.paste(pasted);

    expect(input).toHaveValue(pasted);
    expect(onValueChange).toHaveBeenLastCalledWith(value);
  });

  test("a value set from outside replaces a refused figure and its reason", async () => {
    const { input, user } = setupNumber();

    await user.type(input, "0,500");
    await user.tab();
    await user.click(screen.getByRole("button", { name: "Set 42" }));

    expect(input).toHaveValue("42");
    expect(screen.queryByText(UNREADABLE_EN)).not.toBeInTheDocument();
  });

  test("shows NaN as an empty field", () => {
    const { input } = setupNumber({ initial: Number.NaN });

    expect(input).toHaveValue("");
  });
});
