import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { renderWithI18n } from "@/test/i18n";

import { RowActions } from "./row-actions";

function setup({ locale = "en" }: { locale?: "en" | "es" } = {}) {
  const onDelete = vi.fn((_trigger: HTMLButtonElement | null) => undefined);
  const user = userEvent.setup();

  renderWithI18n(
    <>
      <RowActions onDelete={onDelete} rowLabel="Weekend plans" testId="row-1" />
      <RowActions onDelete={() => undefined} rowLabel="Lunch?" testId="row-2" />
    </>,
    { locale }
  );

  const trigger = screen.getByTestId("row-1");

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

  test("names the trigger, its tooltip and Delete in Spanish on a Spanish page", async () => {
    const { trigger, user } = setup({ locale: "es" });

    expect(trigger).toHaveAccessibleName("Más acciones: Weekend plans");

    await user.tab();

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Más acciones"
    );

    await user.click(trigger);

    expect(
      screen.getByRole("menuitem", { name: "Eliminar: Weekend plans" })
    ).toHaveTextContent("Eliminar");
  });
});
