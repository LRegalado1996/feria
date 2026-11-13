import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

function setup({ value = "light" }: { value?: string } = {}) {
  const onDelete = vi.fn(() => undefined);
  const onValueChange = vi.fn((_value: string) => undefined);
  const user = userEvent.setup();

  render(
    <DropdownMenu>
      <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent className="custom-content">
        <DropdownMenuItem>Edit</DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete} variant="destructive">
          Delete
        </DropdownMenuItem>
        <DropdownMenuRadioGroup onValueChange={onValueChange} value={value}>
          <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const open = async () => {
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    return screen.getByRole("menu");
  };

  return { onDelete, onValueChange, open, user };
}

describe("DropdownMenu", () => {
  test("stays closed until the trigger is pressed", () => {
    setup();

    const trigger = screen.getByRole("button", { name: "Open menu" });
    expect(trigger).toHaveAttribute("data-slot", "dropdown-menu-trigger");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("opens a menu marked with its slot and the caller's class", async () => {
    const { open } = setup();

    const menu = await open();

    expect(menu).toHaveAttribute("data-slot", "dropdown-menu-content");
    expect(menu).toHaveClass("custom-content");
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["Edit", "Delete"]);
  });

  test("marks a destructive item and runs its action", async () => {
    const { onDelete, open, user } = setup();
    await open();

    const item = screen.getByRole("menuitem", { name: "Delete" });
    expect(item).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByRole("menuitem", { name: "Edit" })).toHaveAttribute(
      "data-variant",
      "default"
    );

    await user.click(item);

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ type: "menu.itemSelect", target: item })
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("checks the current radio item and reports a new choice", async () => {
    const { onValueChange, open, user } = setup({ value: "light" });
    await open();

    expect(
      screen.getByRole("menuitemradio", { name: "Light" })
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemradio", { name: "Dark" })).toHaveAttribute(
      "aria-checked",
      "false"
    );

    await user.click(screen.getByRole("menuitemradio", { name: "Dark" }));

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("dark");
  });
});
