import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Button, type ButtonProps, buttonVariants } from "./button";

function setup(props: ButtonProps = {}) {
  const onClick = vi.fn<NonNullable<ButtonProps["onClick"]>>();
  const user = userEvent.setup();
  render(
    <Button onClick={onClick} {...props}>
      {props.children ?? "Save"}
    </Button>
  );

  return { button: screen.queryByRole("button"), onClick, user };
}

describe("Button", () => {
  test("is a button marked with its slot, default variant and default size", () => {
    const { button } = setup();

    expect(button).toHaveAccessibleName("Save");
    expect(button).toHaveAttribute("data-slot", "button");
    expect(button).toHaveAttribute("data-variant", "default");
    expect(button).toHaveAttribute("data-size", "default");
    // A 44 px target on a phone, the compact height from `md` up.
    expect(button).toHaveClass("bg-primary", "h-11", "md:h-9");
  });

  test.each([
    ["destructive", "bg-destructive"],
    ["outline", "border"],
    ["secondary", "bg-secondary"],
    ["ghost", "hover:bg-accent"],
    ["link", "underline-offset-4"],
  ] as const)("the %s variant carries %s", (variant, expected) => {
    const { button } = setup({ variant });

    expect(button).toHaveAttribute("data-variant", variant);
    expect(button).toHaveClass(expected);
    expect(button).not.toHaveClass("bg-primary");
  });

  test.each([
    ["sm", ["h-11", "md:h-8"]],
    ["lg", ["h-11", "md:h-10"]],
    ["icon", ["size-11", "md:size-9"]],
    ["icon-sm", ["size-11", "md:size-8"]],
    ["icon-lg", ["size-11", "md:size-10"]],
  ] as const)(
    "the %s size is a 44 px target on a phone, %s from md up",
    (size, expected) => {
      const { button } = setup({ size });

      expect(button).toHaveAttribute("data-size", size);
      expect(button).toHaveClass(...expected);
      expect(button).not.toHaveClass("md:h-9");
    }
  );

  test.each([
    ["xs", "h-6"],
    ["icon-xs", "size-6"],
  ] as const)(
    "the %s size stays small at every width: %s",
    (size, expected) => {
      const { button } = setup({ size });

      expect(button).toHaveAttribute("data-size", size);
      expect(button).toHaveClass(expected);
      expect(button?.className).not.toMatch(/\b(?:h|size)-11\b/u);
    }
  );

  test("hands its action the click", async () => {
    const { button, onClick, user } = setup();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "click", target: button })
    );
  });

  test("ignores clicks while disabled", async () => {
    const { button, onClick, user } = setup({ disabled: true });

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  test("renders its child instead of a button with asChild", () => {
    const { button } = setup({
      asChild: true,
      children: <a href="https://example.com/">Open</a>,
    });

    const link = screen.getByRole("link", { name: "Open" });
    expect(link).toHaveAttribute("href", "https://example.com/");
    expect(link).toHaveAttribute("data-slot", "button");
    expect(link).toHaveClass("bg-primary");
    expect(button).toBeNull();
  });

  test("merges a caller's class over the variant's", () => {
    const { button } = setup({ className: "w-full px-8" });

    expect(button).toHaveClass("w-full", "px-8");
    expect(button).not.toHaveClass("px-4");
  });

  test("exposes the variants for links styled as buttons", () => {
    const classes = buttonVariants({ variant: "outline", size: "sm" });

    expect(classes).toContain("border");
    expect(classes).toContain("md:h-8");
    expect(classes).not.toContain("md:h-9");
  });
});
