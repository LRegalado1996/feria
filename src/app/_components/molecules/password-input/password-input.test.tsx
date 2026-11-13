import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { PasswordInput } from "./password-input";

function setup() {
  const onSubmit = vi.fn((event: Event) => {
    event.preventDefault();
  });
  const user = userEvent.setup();

  render(
    <form
      onSubmit={(event) => {
        onSubmit(event.nativeEvent);
      }}
    >
      <PasswordInput aria-label="Password" className="custom" />
      <button type="submit">Sign in</button>
    </form>
  );

  return {
    field: screen.getByLabelText("Password"),
    onSubmit,
    user,
  };
}

describe("PasswordInput", () => {
  test("hides what is typed by default", async () => {
    const { field, user } = setup();

    await user.type(field, "secret-123");

    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveValue("secret-123");
    expect(field).toHaveClass("custom", "pr-10");
    expect(field.parentElement).toHaveAttribute("data-slot", "password-input");
  });

  test("reveals and hides it again, saying which with aria-pressed", async () => {
    const { field, user } = setup();

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(field).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" })
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Hide password" }));

    expect(field).toHaveAttribute("type", "password");
    expect(
      screen.getByRole("button", { name: "Show password" })
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("never submits the form, and stays out of the tab order", async () => {
    const { field, onSubmit, user } = setup();

    await user.click(screen.getByRole("button", { name: "Show password" }));
    await user.click(field);
    await user.tab();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveFocus();
  });
});
