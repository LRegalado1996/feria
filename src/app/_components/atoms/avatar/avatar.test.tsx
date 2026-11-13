import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
  Avatar,
  type AvatarProps,
  AvatarFallback,
  AvatarImage,
  avatarVariants,
} from "./avatar";

function setup({
  fallbackClassName,
  image = false,
  ...props
}: AvatarProps & { fallbackClassName?: string; image?: boolean } = {}) {
  render(
    <Avatar data-testid="avatar" {...props}>
      {image ? <AvatarImage alt="Ada" src="/ada.jpg" /> : null}
      <AvatarFallback className={fallbackClassName}>AL</AvatarFallback>
    </Avatar>
  );

  return {
    avatar: screen.getByTestId("avatar"),
    fallback: screen.getByText("AL"),
  };
}

describe("Avatar", () => {
  test("shows the fallback initials, each part marked with its slot", () => {
    const { avatar, fallback } = setup();

    expect(avatar).toHaveAttribute("data-slot", "avatar");
    expect(avatar).toContainElement(fallback);
    expect(fallback).toHaveAttribute("data-slot", "avatar-fallback");
    expect(fallback).toHaveClass("rounded-full", "bg-muted");
  });

  test("keeps showing the fallback while the image has not loaded", () => {
    const { fallback } = setup({ image: true });

    expect(fallback).toHaveTextContent("AL");
    expect(screen.queryByRole("img", { name: "Ada" })).not.toBeInTheDocument();
  });

  test.each([
    [undefined, "size-10"],
    ["sm", "size-8"],
    ["default", "size-10"],
    ["lg", "size-12"],
  ] as const)("the %s size carries %s", (size, expected) => {
    const { avatar } = setup({ size });

    expect(avatar).toHaveClass(expected);
    expect(avatarVariants({ size })).toContain(expected);
  });

  test("merges a caller's class on the avatar and on the fallback", () => {
    const { avatar, fallback } = setup({
      className: "ring-2",
      fallbackClassName: "bg-primary",
    });

    expect(avatar).toHaveClass("ring-2", "rounded-full");
    expect(fallback).toHaveClass("bg-primary");
    expect(fallback).not.toHaveClass("bg-muted");
  });
});
