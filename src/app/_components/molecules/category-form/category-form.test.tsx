import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import { CategoryForm, type CategoryFormResult } from "./category-form";

interface SetupOptions {
  locale?: Locale;
  /** What the save answers; `"hang"` never settles. */
  result?: CategoryFormResult | "hang";
  /** A category being renamed: the form starts from it and can be cancelled. */
  values?: { nameEn: string | null; nameEs: string };
}

function setup({ locale = "en", result = "saved", values }: SetupOptions = {}) {
  const copy = DICTIONARIES[locale].admin.categories;
  const onSave = vi.fn(
    async (_names: { nameEn: string | null; nameEs: string }) =>
      result === "hang"
        ? await new Promise<CategoryFormResult>(() => {})
        : result
  );
  const onCancel = vi.fn();
  const user = userEvent.setup();

  renderWithI18n(
    <CategoryForm
      onCancel={values ? onCancel : undefined}
      onSave={onSave}
      pendingLabel="Saving now"
      submitLabel="Save it"
      values={values}
    />,
    { locale }
  );

  const spanish = () =>
    screen.getByLabelText(new RegExp(`^${copy.fields.nameEs}`, "u"));
  const english = () => screen.getByLabelText(copy.fields.nameEn);

  return {
    copy,
    english,
    onCancel,
    onSave,
    spanish,
    submit: async () => {
      await user.click(screen.getByRole("button", { name: "Save it" }));
    },
    type: async (field: HTMLElement, text: string) => {
      await user.clear(field);

      if (text !== "") {
        await user.type(field, text);
      }
    },
    user,
  };
}

/** The message bound to a field through `aria-describedby`. */
function messageOf(field: HTMLElement) {
  const ids = field.getAttribute("aria-describedby")?.split(" ") ?? [];
  return ids
    .map((id) => document.querySelector(`#${id}`))
    .find((node) => node?.getAttribute("role") === "alert")?.textContent;
}

describe("CategoryForm", () => {
  test("asks for the Spanish name before saving anything", async () => {
    const { onSave, spanish, submit } = setup();

    await submit();

    await waitFor(() => {
      expect(spanish()).toHaveAttribute("aria-invalid", "true");
    });
    expect(messageOf(spanish())).toBe("Write the name in Spanish.");
    expect(onSave).not.toHaveBeenCalled();
  });

  const SIXTY = "x".repeat(60);
  const SIXTY_ONE = "x".repeat(61);

  test.each([
    ["Spanish", SIXTY, "", { nameEn: null, nameEs: SIXTY }],
    ["English", "Collares", SIXTY, { nameEn: SIXTY, nameEs: "Collares" }],
  ] as const)(
    "saves a %s name of exactly 60 characters",
    async (_language, nameEs, nameEn, sent) => {
      const { english, onSave, spanish, submit, type } = setup();
      await type(spanish(), nameEs);
      await type(english(), nameEn);

      await submit();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledExactlyOnceWith(sent);
      });
    }
  );

  test.each([
    ["Spanish", SIXTY_ONE, "", "nameEs"],
    ["English", "Collares", SIXTY_ONE, "nameEn"],
  ] as const)(
    "refuses a %s name of 61 characters under its field",
    async (_language, nameEs, nameEn, refused) => {
      const { english, onSave, spanish, submit, type } = setup();
      await type(spanish(), nameEs);
      await type(english(), nameEn);

      await submit();

      const field = refused === "nameEs" ? spanish() : english();
      await waitFor(() => {
        expect(messageOf(field)).toBe("Use up to 60 characters.");
      });
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(onSave).not.toHaveBeenCalled();
    }
  );

  test("sends the trimmed names, a blank English one as none", async () => {
    const { english, onSave, spanish, submit, type } = setup();
    await type(spanish(), "  Collares  ");
    await type(english(), "   ");

    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        nameEn: null,
        nameEs: "Collares",
      });
    });
  });

  test("clears itself for the next one once a new category is saved", async () => {
    const { english, onSave, spanish, submit, type } = setup();
    await type(spanish(), "Collares");
    await type(english(), "Necklaces");

    await submit();

    await waitFor(() => {
      expect(spanish()).toHaveValue("");
    });
    expect(english()).toHaveValue("");
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      nameEn: "Necklaces",
      nameEs: "Collares",
    });
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  test("puts a name the store already uses on the Spanish field, keeping what was typed", async () => {
    const { english, spanish, submit, type } = setup({ result: "duplicate" });
    await type(spanish(), "Collares");
    await type(english(), "Necklaces");

    await submit();

    await waitFor(() => {
      expect(spanish()).toHaveAttribute("aria-invalid", "true");
    });
    expect(messageOf(spanish())).toBe(
      "This store already has a category with that name."
    );
    expect(spanish()).toHaveValue("Collares");
    expect(english()).toHaveValue("Necklaces");
  });

  test("says a failed save failed, keeps the text, and clears the alert on the next try", async () => {
    const { english, onSave, spanish, submit, type } = setup({
      result: "failed",
    });
    await type(spanish(), "Collares");
    await type(english(), "Necklaces");

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^We could not save the change\. Try again\.$/u
    );
    expect(spanish()).toHaveValue("Collares");
    expect(english()).toHaveValue("Necklaces");

    onSave.mockImplementationOnce(
      async () => await new Promise<CategoryFormResult>(() => {})
    );
    await submit();

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  test("shows the pending label and refuses a second submit while saving", async () => {
    const { onSave, spanish, submit, type } = setup({ result: "hang" });
    await type(spanish(), "Collares");

    await submit();

    const pending = await screen.findByRole("button", { name: "Saving now" });
    expect(pending).toBeDisabled();
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      nameEn: null,
      nameEs: "Collares",
    });
  });

  test("an edit form starts from the category's names, keeps them once saved, and can be cancelled", async () => {
    const { english, onCancel, onSave, spanish, submit, user } = setup({
      values: { nameEn: "Necklaces", nameEs: "Collares" },
    });

    expect(spanish()).toHaveValue("Collares");
    expect(english()).toHaveValue("Necklaces");

    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        nameEn: "Necklaces",
        nameEs: "Collares",
      });
    });
    expect(spanish()).toHaveValue("Collares");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledExactlyOnceWith(expect.anything());
  });

  test("starts an edit with no English name from an empty field", () => {
    const { english } = setup({
      values: { nameEn: null, nameEs: "Collares" },
    });

    expect(english()).toHaveValue("");
  });

  test("in Spanish, labels its fields and messages in Spanish", async () => {
    const { english, spanish, submit } = setup({
      locale: "es",
      values: { nameEn: null, nameEs: "" },
    });

    expect(english()).toHaveAccessibleDescription(
      "Si lo dejás vacío, en inglés se muestra el nombre en español."
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeVisible();
    expect(spanish()).toBe(screen.getByLabelText(/^Nombre en español/u));

    await submit();

    await waitFor(() => {
      expect(messageOf(spanish())).toBe("Escribí el nombre en español.");
    });
  });
});
