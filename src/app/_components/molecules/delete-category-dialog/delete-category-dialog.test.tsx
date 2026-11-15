import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import {
  DeleteCategoryDialog,
  type DeleteCategoryDialogProps,
} from "./delete-category-dialog";

function makeCategory(
  overrides: Partial<DeleteCategoryDialogProps["category"]> = {}
) {
  return {
    countLabel: "3 articles",
    id: 5,
    name: "Collares",
    productCount: 3,
    ...overrides,
  };
}

const OTHERS = [
  { id: 6, name: "Aros" },
  { id: 7, name: "Pulseras" },
];

function setup({
  locale = "en",
  ...props
}: Partial<DeleteCategoryDialogProps> & { locale?: Locale } = {}) {
  const onConfirm = vi.fn<(moveToId: number | null) => void>();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const user = userEvent.setup();

  renderWithI18n(
    <DeleteCategoryDialog
      category={makeCategory()}
      error={null}
      isPending={false}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      open
      others={OTHERS}
      {...props}
    />,
    { locale }
  );

  const dialog = () => screen.getByTestId("delete-category-dialog");
  const confirmButton = (name = "Delete category") =>
    within(dialog()).getByRole("button", { name });

  return {
    confirm: async () => {
      await user.click(confirmButton());
    },
    confirmButton,
    dialog,
    onConfirm,
    onOpenChange,
    user,
  };
}

describe("DeleteCategoryDialog", () => {
  test("a category with no articles asks only to confirm, and moves nothing", async () => {
    const { confirm, dialog, onConfirm } = setup({
      category: makeCategory({ countLabel: "0 articles", productCount: 0 }),
    });

    expect(
      within(dialog()).getByRole("heading", { name: "Delete the category?" })
    ).toBeVisible();
    expect(dialog()).toHaveAccessibleDescription(
      "“Collares” will be deleted. This cannot be undone."
    );
    expect(within(dialog()).queryByRole("combobox")).toBeNull();

    await confirm();

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(null);
  });

  test("a category with articles offers the store's other categories to move them to", () => {
    const { dialog } = setup();

    expect(dialog()).toHaveAccessibleDescription(
      "“Collares” has 3 articles. Choose where they move before deleting it."
    );
    const select = within(dialog()).getByRole("combobox", {
      name: "Move its articles to",
    });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => [option.getAttribute("value"), option.textContent])
    ).toEqual([
      ["", "Choose a category"],
      ["6", "Aros"],
      ["7", "Pulseras"],
    ]);
  });

  test("refuses to confirm before a destination is chosen, and clears the message on choosing", async () => {
    const { confirm, dialog, onConfirm, user } = setup();

    await confirm();

    const select = within(dialog()).getByRole("combobox");
    const message = within(dialog()).getByRole("alert");
    expect(message).toHaveTextContent(
      /^Choose which category its articles move to\.$/u
    );
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription(
      "Choose which category its articles move to."
    );
    expect(onConfirm).not.toHaveBeenCalled();

    await user.selectOptions(select, "7");

    expect(within(dialog()).queryByRole("alert")).toBeNull();
    expect(select).not.toHaveAttribute("aria-invalid");
  });

  test("confirms with the chosen destination's id", async () => {
    const { confirm, dialog, onConfirm, user } = setup();

    await user.selectOptions(within(dialog()).getByRole("combobox"), "6");
    await confirm();

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(6);
  });

  test("the only category, with articles, says so and cannot be confirmed", () => {
    const { confirmButton, dialog } = setup({ others: [] });

    expect(within(dialog()).getByRole("alert")).toHaveTextContent(
      "It is the only category and it has articles. Add another one to move them to before deleting it."
    );
    expect(within(dialog()).queryByRole("combobox")).toBeNull();
    expect(confirmButton()).toBeDisabled();
  });

  test("shows a failed deletion's error and stays open", () => {
    const { dialog } = setup({
      category: makeCategory({ productCount: 0 }),
      error: "We could not save the change. Try again.",
    });

    expect(within(dialog()).getByRole("alert")).toHaveTextContent(
      /^We could not save the change\. Try again\.$/u
    );
  });

  test("shows the pending label on a disabled confirm while deleting", () => {
    const { confirmButton } = setup({ isPending: true });

    expect(confirmButton("Deleting…")).toBeDisabled();
  });

  test("cancel closes the dialog without deleting", async () => {
    const { dialog, onConfirm, onOpenChange, user } = setup();

    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("in Spanish, asks in Spanish", async () => {
    const { confirmButton, dialog, user } = setup({
      category: makeCategory({ countLabel: "3 artículos" }),
      locale: "es",
    });

    expect(dialog()).toHaveAccessibleDescription(
      "«Collares» tiene 3 artículos. Elegí a qué categoría pasan antes de eliminarla."
    );
    expect(
      within(dialog()).getByRole("combobox", { name: "Mover sus artículos a" })
    ).toBeVisible();
    expect(
      within(dialog()).getByRole("button", { name: "Cancelar" })
    ).toBeVisible();

    await user.click(confirmButton("Eliminar categoría"));

    expect(within(dialog()).getByRole("alert")).toHaveTextContent(
      /^Elegí a qué categoría pasan sus artículos\.$/u
    );
  });
});
