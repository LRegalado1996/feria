import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { ProductRowMenu } from "./product-row-menu";

function setup({
  locale = "en",
  published = true,
  switching = false,
}: { locale?: Locale; published?: boolean; switching?: boolean } = {}) {
  const onDelete = vi.fn<(opener: HTMLButtonElement) => void>();
  const onToggleVisibility = vi.fn<(opener: HTMLButtonElement) => void>();
  renderWithI18n(
    <ProductRowMenu
      onDelete={onDelete}
      onToggleVisibility={onToggleVisibility}
      published={published}
      switching={switching}
      title="Anillo de plata"
    />,
    { locale }
  );
  const user = userEvent.setup();
  const trigger = screen.getByTestId("product-row-menu");

  return {
    onDelete,
    onToggleVisibility,
    open: async () => {
      await user.click(trigger);
    },
    trigger,
    user,
  };
}

describe("ProductRowMenu", () => {
  test.each([
    [
      "en",
      true,
      "Actions for “Anillo de plata”",
      ["Hide from the store", "Delete"],
    ],
    [
      "en",
      false,
      "Actions for “Anillo de plata”",
      ["Show in the store", "Delete"],
    ],
    [
      "es",
      true,
      "Acciones de «Anillo de plata»",
      ["Ocultar de la web", "Eliminar"],
    ],
    [
      "es",
      false,
      "Acciones de «Anillo de plata»",
      ["Mostrar en la web", "Eliminar"],
    ],
  ] as const)(
    "in %s, published: %s, a button named %j opens the row's two actions",
    async (locale, published, name, items) => {
      const { open, trigger } = setup({ locale, published });

      expect(trigger).toHaveAccessibleName(name);
      await open();

      expect(
        screen.getAllByRole("menuitem").map((item) => item.textContent)
      ).toEqual(items);
    }
  );

  test("sits above the row's stretched link, so a tap on it never opens the wizard", () => {
    const { trigger } = setup();

    expect(trigger).toHaveClass("relative", "z-10");
  });

  test.each([
    [true, "Hide from the store"],
    [false, "Show in the store"],
  ] as const)(
    "published: %s, %j changes the article's visibility at once, without asking, and focus goes back to the menu's button",
    async (published, name) => {
      const { onDelete, onToggleVisibility, open, trigger, user } = setup({
        published,
      });
      await open();

      await user.click(screen.getByRole("menuitem", { name }));

      // Handed its button, for focus to go on from if the row leaves.
      expect(onToggleVisibility).toHaveBeenCalledExactlyOnceWith(trigger);
      expect(onDelete).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(trigger).toHaveFocus();
      });
    }
  );

  test("Delete hands its action the menu's button, for focus to come back to, and leaves focus to its question", async () => {
    const { onDelete, onToggleVisibility, open, trigger, user } = setup();
    await open();

    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(trigger);
    expect(onToggleVisibility).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    expect(trigger).not.toHaveFocus();
  });

  test("closed without choosing, focus goes back to the menu's button", async () => {
    const { open, trigger, user } = setup();
    await open();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  test("while its visibility is changing, the item is off and does nothing", async () => {
    const { onToggleVisibility, open, user } = setup({ switching: true });
    await open();

    const item = screen.getByRole("menuitem", { name: "Hide from the store" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    await user.click(item);
    expect(onToggleVisibility).not.toHaveBeenCalled();
  });
});
