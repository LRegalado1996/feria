import { render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { describe, expect, test } from "vitest";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  type FieldErrorProps,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  type FieldProps,
  FieldSeparator,
  FieldSet,
  FieldTitle,
  fieldVariants,
} from "./field";

type Part = ComponentType<{
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}>;

describe("layout parts", () => {
  test.each([
    ["FieldSet", FieldSet, "field-set", "flex-col"],
    ["FieldGroup", FieldGroup, "field-group", "gap-7"],
    ["FieldContent", FieldContent, "field-content", "flex-1"],
    ["FieldTitle", FieldTitle, "field-label", "font-medium"],
    [
      "FieldDescription",
      FieldDescription,
      "field-description",
      "text-muted-foreground",
    ],
    ["FieldLabel", FieldLabel as Part, "field-label", "leading-snug"],
  ] as const)(
    "%s renders its children, marked %s, with its own and the caller's classes",
    (_name, Component: Part, slot, ownClass) => {
      render(
        <Component className="custom" data-testid="part">
          Inside
        </Component>
      );

      const part = screen.getByTestId("part");
      expect(part).toHaveTextContent("Inside");
      expect(part).toHaveAttribute("data-slot", slot);
      expect(part).toHaveClass(ownClass, "custom");
    }
  );
});

function setupField(props: FieldProps = {}) {
  render(
    <Field data-testid="field" {...props}>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <input id="email" />
    </Field>
  );

  return screen.getByTestId("field");
}

describe("Field", () => {
  test("groups a label with the control it names", () => {
    const field = setupField();

    expect(field).toHaveAttribute("role", "group");
    expect(field).toHaveAttribute("data-slot", "field");
    expect(within(field).getByRole("textbox")).toHaveAccessibleName("Email");
  });

  test.each([
    [undefined, "vertical", "flex-col"],
    ["vertical", "vertical", "flex-col"],
    ["horizontal", "horizontal", "flex-row"],
    ["responsive", "responsive", "@md/field-group:flex-row"],
  ] as const)(
    "orientation %s lays out %s with %s",
    (orientation, expected, layoutClass) => {
      const field = setupField({ orientation });

      expect(field).toHaveAttribute("data-orientation", expected);
      expect(field).toHaveClass(layoutClass);
      expect(fieldVariants({ orientation })).toContain(layoutClass);
    }
  );

  test("puts the caller's class after the variant's", () => {
    const field = setupField({ className: "custom-field" });

    expect(field).toHaveClass("custom-field", "flex-col");
  });
});

describe("FieldLegend", () => {
  test.each([
    [undefined, "legend"],
    ["legend", "legend"],
    ["label", "label"],
  ] as const)("variant %s names its fieldset as a %s", (variant, expected) => {
    render(
      <FieldSet>
        <FieldLegend variant={variant}>Contact</FieldLegend>
      </FieldSet>
    );

    expect(screen.getByRole("group")).toHaveAccessibleName("Contact");
    expect(screen.getByText("Contact")).toHaveAttribute(
      "data-slot",
      "field-legend"
    );
    expect(screen.getByText("Contact")).toHaveAttribute(
      "data-variant",
      expected
    );
  });
});

describe("FieldSeparator", () => {
  test("draws the line with a label over it when given one", () => {
    render(
      <FieldSeparator className="custom-sep" data-testid="separator">
        or
      </FieldSeparator>
    );

    const separator = screen.getByTestId("separator");
    expect(separator).toHaveAttribute("data-slot", "field-separator");
    expect(separator).toHaveAttribute("data-content", "true");
    expect(separator).toHaveClass("custom-sep");
    expect(
      separator.querySelector('[data-slot="field-separator-content"]')
    ).toHaveTextContent("or");
    expect(
      separator.querySelector('[data-slot="separator"]')
    ).toBeInTheDocument();
  });

  test("draws only the line without a label", () => {
    render(<FieldSeparator data-testid="separator" />);

    const separator = screen.getByTestId("separator");
    expect(separator).toHaveAttribute("data-content", "false");
    expect(separator).toHaveTextContent("");
    expect(
      separator.querySelector('[data-slot="field-separator-content"]')
    ).not.toBeInTheDocument();
    expect(
      separator.querySelector('[data-slot="separator"]')
    ).toBeInTheDocument();
  });
});

function setupError(props: FieldErrorProps) {
  const { container } = render(<FieldError {...props} />);

  return { alert: screen.queryByRole("alert"), container };
}

describe("FieldError", () => {
  test("announces its children as an alert in the destructive color", () => {
    const { alert } = setupError({
      children: "Enter an email",
      className: "custom-error",
      errors: [{ message: "Ignored" }],
    });

    expect(alert).toHaveTextContent("Enter an email");
    expect(alert).not.toHaveTextContent("Ignored");
    expect(alert).toHaveAttribute("data-slot", "field-error");
    expect(alert).toHaveClass("text-destructive", "custom-error");
  });

  test("shows a single error as plain text", () => {
    const { alert } = setupError({ errors: [{ message: "Too short" }] });

    expect(alert).toHaveTextContent("Too short");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  test("collapses repeated messages into one, as plain text", () => {
    const { alert } = setupError({
      errors: [{ message: "Too short" }, { message: "Too short" }],
    });

    expect(alert).toHaveTextContent(/^Too short$/u);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  test("lists distinct messages, skipping entries without one", () => {
    setupError({
      errors: [{ message: "Too short" }, undefined, { message: "No digits" }],
    });

    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent)
    ).toEqual(["Too short", "No digits"]);
  });

  test.each([
    ["no errors", undefined],
    ["an empty list", []],
  ])("renders nothing for %s", (_label, errors) => {
    const { alert, container } = setupError({ errors });

    expect(alert).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
