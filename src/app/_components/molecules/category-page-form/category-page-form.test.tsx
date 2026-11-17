import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import {
  CategoryPageForm,
  type CategoryPageFormCategory,
} from "./category-page-form";

function makeCategory(
  overrides: Partial<CategoryPageFormCategory> = {}
): CategoryPageFormCategory {
  return {
    cover: { computer: null, phone: null },
    coverAltEn: null,
    coverAltEs: null,
    id: 3,
    nameEn: "Rings",
    nameEs: "Anillos",
    parentId: null,
    seoDescriptionEn: null,
    seoDescriptionEs: null,
    seoTitleEn: null,
    seoTitleEs: null,
    ...overrides,
  };
}

function setup({
  category = makeCategory(),
  isGroup = false,
  locale = "en",
  saves = "saved",
}: {
  category?: CategoryPageFormCategory;
  isGroup?: boolean;
  locale?: Locale;
  saves?: "failed" | "saved";
} = {}) {
  const onSave = vi.fn(
    async (_values: unknown) => await Promise.resolve(saves)
  );
  const onCancel = vi.fn<() => void>();
  renderWithI18n(
    <CategoryPageForm
      category={category}
      groups={[
        { id: 6, name: "Bijouterie" },
        { id: 1, name: "Burbujeros" },
      ]}
      isGroup={isGroup}
      onCancel={onCancel}
      onSave={onSave}
    />,
    { locale }
  );

  return {
    field: (name: string) => screen.getByRole("textbox", { name }),
    onCancel,
    onSave,
    user: userEvent.setup(),
  };
}

describe("CategoryPageForm", () => {
  test("sends the chosen group and every text, empty ones as none", async () => {
    const { field, onSave, user } = setup({
      category: makeCategory({ seoTitleEn: "Old title" }),
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Group" }),
      "Bijouterie"
    );
    await user.clear(field("Title for search engines in English"));
    await user.type(
      field("Description for search engines in Spanish"),
      "  Anillos de la feria  "
    );
    await user.click(screen.getByRole("button", { name: "Save the page" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        coverAltEn: null,
        coverAltEs: null,
        id: 3,
        parentId: 6,
        seoDescriptionEn: null,
        seoDescriptionEs: "Anillos de la feria",
        seoTitleEn: null,
        seoTitleEs: null,
      });
    });
  });

  test("takes a category out of its group with No group", async () => {
    const { onSave, user } = setup({
      category: makeCategory({ parentId: 6 }),
    });
    const group = screen.getByRole("combobox", { name: "Group" });

    expect(group).toHaveValue("6");
    await user.selectOptions(group, "No group");
    await user.click(screen.getByRole("button", { name: "Save the page" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ parentId: null })
      );
    });
  });

  test.each([
    ["Title for search engines in Spanish", 71, "Use up to 70 characters."],
    [
      "Description for search engines in English",
      161,
      "Use up to 160 characters.",
    ],
  ])(
    "refuses a %s of %i characters under its field, sending nothing",
    async (name, length, message) => {
      const { field, onSave, user } = setup();

      await user.click(field(name));
      await user.paste("x".repeat(length));
      await user.click(screen.getByRole("button", { name: "Save the page" }));

      expect(await screen.findByText(message)).toBeVisible();
      expect(field(name)).toHaveAttribute("aria-invalid", "true");
      expect(onSave).not.toHaveBeenCalled();
    }
  );

  test("sends no English text for a category without an English name", async () => {
    const { field, onSave, user } = setup({
      category: makeCategory({ nameEn: null, seoTitleEn: "Stale" }),
    });

    expect(field("Title for search engines in English")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save the page" }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ seoTitleEn: null })
      );
    });
  });

  test("says a failed save under the form and keeps what was typed", async () => {
    const { field, user } = setup({ saves: "failed" });

    await user.type(field("Title for search engines in Spanish"), "Anillos");
    await user.click(screen.getByRole("button", { name: "Save the page" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not save the change. Try again."
    );
    expect(field("Title for search engines in Spanish")).toHaveValue("Anillos");
  });

  test("shows both cover images with their own description, and asks for the description in both languages", () => {
    setup({
      category: makeCategory({
        cover: {
          computer: { height: 800, url: "/seed/ring-2.jpg", width: 1200 },
          phone: { height: 1200, url: "/seed/ring-1.jpg", width: 1200 },
        },
        coverAltEs: "Anillo sello",
      }),
    });

    const cover = screen.getByRole("region", { name: "Cover" });
    expect(
      within(cover)
        .getAllByRole("img", { name: "Anillo sello" })
        .map(
          (image) =>
            image.closest("figure")?.querySelector("figcaption")?.textContent
        )
    ).toEqual(["On a computer", "On a phone"]);
    expect(
      within(cover).getByRole("textbox", {
        name: "Cover description in English",
      })
    ).toBeEnabled();
  });

  test("cancels without saving", async () => {
    const { onCancel, onSave, user } = setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("keeps a group's own group shut, in Spanish too", () => {
    setup({ isGroup: true, locale: "es" });

    const group = screen.getByRole("combobox", { name: "Grupo" });
    expect(group).toBeDisabled();
    expect(group).toHaveAccessibleDescription(
      "Esta categoría es un grupo: tiene categorías adentro, así que no puede entrar en otro."
    );
    expect(
      screen.getByRole("form", { name: "Página de «Anillos»" })
    ).toHaveTextContent(
      "Esta categoría todavía no tiene portada: su página muestra solo el título."
    );
  });
});
