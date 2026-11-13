import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { RowActions } from "./row-actions";

function setup() {
  const onDelete = vi.fn((_trigger: HTMLButtonElement | null) => undefined);
  const user = userEvent.setup();

  render(
    <>
      <RowActions onDelete={onDelete} rowLabel="Weekend plans" testId="row-1" />
      <RowActions onDelete={() => undefined} rowLabel="Lunch?" testId="row-2" />
    </>
  );

  const trigger = screen.getByRole("button", {
    name: "More actions: Weekend plans",
  });

  return { onDelete, trigger, user };
}

describe("RowActions", () => {
  test("names each row's icon-only trigger after its row", () => {
    const { trigger } = setup();

    expect(trigger).toHaveAttribute("data-slot", "row-actions");
    expect(trigger).toHaveAttribute("data-testid", "row-1");
    expect(
      screen.getByRole("button", { name: "More actions: Lunch?" })
    ).toBeInTheDocument();
  });

  test("repeats the action in a tooltip on focus", async () => {
    const { trigger, user } = setup();

    await user.tab();

    expect(trigger).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "More actions"
    );
  });

  test("offers Delete, named after the row, and hands back its trigger", async () => {
    const { onDelete, trigger, user } = setup();
    await user.click(trigger);

    const item = screen.getByRole("menuitem", {
      name: "Delete: Weekend plans",
    });
    expect(item).toHaveAttribute("data-testid", "row-1-delete");
    expect(item).toHaveAttribute("data-variant", "destructive");

    await user.click(item);

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(trigger);
  });
});
