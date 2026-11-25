import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import {
  StoreButton,
  type StoreButtonProps,
  storeButtonVariants,
} from "./store-button";

function setup(props: StoreButtonProps = {}) {
  const onClick = vi.fn<NonNullable<StoreButtonProps["onClick"]>>();
  const user = userEvent.setup();
  render(
    <StoreButton onClick={onClick} {...props}>
      {props.children ?? "Agregar"}
    </StoreButton>
  );

  return { button: screen.queryByRole("button"), onClick, user };
}

describe("StoreButton", () => {
  test("is a pill in the display face, 44 px tall, the accent on the ink by default", () => {
    const { button } = setup();

    expect(button).toHaveAccessibleName("Agregar");
    expect(button).toHaveAttribute("data-slot", "store-button");
    expect(button).toHaveAttribute("data-variant", "primary");
    expect(button).toHaveAttribute("data-size", "md");
    expect(button).toHaveClass(
      "rounded-full",
      "min-h-11",
      // The hand on hover, like a link's (FER-050).
      "cursor-pointer",
      "font-display",
      "uppercase",
      "bg-store-foreground",
      "text-store-accent",
      "hover:bg-store-contrast"
    );
    expect(button).not.toHaveClass("bg-store-accent");
  });

  test("the accent variant, for a round arrow over a photo, is the ink on the accent", () => {
    const { button } = setup({ variant: "accent" });

    expect(button).toHaveAttribute("data-variant", "accent");
    expect(button).toHaveClass(
      "bg-store-accent",
      "text-store-foreground",
      "focus-visible:outline-store-foreground"
    );
    expect(button).not.toHaveClass("bg-store-foreground");
  });

  test.each([
    [
      "outline",
      "border-store-foreground",
      "focus-visible:outline-store-foreground",
    ],
    [
      "ghost",
      "hover:bg-store-surface",
      "focus-visible:outline-store-foreground",
    ],
    ["contrast", "text-store-accent", "focus-visible:outline-store-accent"],
  ] as const)(
    "the %s variant carries %s and its focus ring %s",
    (variant, look, ring) => {
      const { button } = setup({ variant });

      expect(button).toHaveAttribute("data-variant", variant);
      expect(button).toHaveClass(look, ring);
      expect(button).not.toHaveClass("bg-store-accent");
    }
  );

  test.each([
    ["lg", "min-h-13"],
    ["icon", "size-11"],
    ["icon-lg", "size-13"],
    ["icon-sm", "size-9"],
  ] as const)("the %s size carries %s", (size, expected) => {
    const { button } = setup({ size });

    expect(button).toHaveAttribute("data-size", size);
    expect(button).toHaveClass(expected);
    expect(button).not.toHaveClass("min-h-11");
  });

  test("the small circle is 36 px to the eye with a 44 px target: a frame 4 px past each side", () => {
    const { button } = setup({ size: "icon-sm" });

    expect(button).toHaveClass(
      "relative",
      "size-9",
      "before:absolute",
      "before:-inset-1"
    );
  });

  test("hands its action the click", async () => {
    const { button, onClick, user } = setup();

    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(onClick).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ target: button, type: "click" })
    );
  });

  test("ignores clicks while disabled", async () => {
    const { button, onClick, user } = setup({ disabled: true });

    await user.click(screen.getByRole("button", { name: "Agregar" }));

    expect(button).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  test("with asChild styles the link it wraps instead of rendering a button", () => {
    setup({
      asChild: true,
      children: <a href="#catalogo">Ver el catálogo</a>,
      variant: "outline",
    });

    const link = screen.getByRole("link", { name: "Ver el catálogo" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#catalogo");
    expect(link).toHaveAttribute("data-slot", "store-button");
    expect(link).toHaveClass("rounded-full", "border-store-foreground");
  });

  test("merges a caller's class over its own", () => {
    const { button } = setup({ className: "w-full px-9" });

    expect(button).toHaveClass("w-full", "px-9");
    expect(button).not.toHaveClass("px-5");
  });

  test("exposes its variants", () => {
    expect(storeButtonVariants({ variant: "contrast" })).toContain(
      "text-store-accent"
    );
    expect(storeButtonVariants({ size: "icon" })).toContain("size-11");
  });
});
