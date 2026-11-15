import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import {
  AttributeForm,
  type AttributeFormResult,
  type AttributeFormSaved,
} from "./attribute-form";

interface SetupOptions {
  /** An editor opened from a button: it takes focus once shown. */
  focusOnOpen?: boolean;
  /** Names the form by a heading beside it, as a filter's value form is. */
  labelledBy?: boolean;
  locale?: Locale;
  /** What the save answers; `"hang"` never settles. */
  result?: AttributeFormResult | "hang";
  /** A filter or a value being edited: the form starts from it and can be cancelled. */
  values?: AttributeFormSaved;
  withSwatch?: boolean;
}

function makeSaved(overrides: Partial<AttributeFormSaved> = {}) {
  return { nameEn: null, nameEs: "Dorado", swatchColor: null, ...overrides };
}

function setup({
  focusOnOpen = false,
  labelledBy = false,
  locale = "en",
  result = "saved",
  values,
  withSwatch = false,
}: SetupOptions = {}) {
  const copy = DICTIONARIES[locale].admin.filters;
  const onSave = vi.fn(async (_values: AttributeFormSaved) =>
    result === "hang"
      ? await new Promise<AttributeFormResult>(() => {})
      : result
  );
  const onCancel = vi.fn();
  const user = userEvent.setup();

  renderWithI18n(
    <>
      {labelledBy ? <h3 id="value-form-title">New value of “Color”</h3> : null}
      <AttributeForm
        focusOnOpen={focusOnOpen}
        labelledBy={labelledBy ? "value-form-title" : undefined}
        onCancel={values ? onCancel : undefined}
        onSave={onSave}
        pendingLabel="Saving now"
        submitLabel="Save it"
        values={values}
        withSwatch={withSwatch}
      />
    </>,
    { locale }
  );

  const spanish = () =>
    screen.getByLabelText(new RegExp(`^${copy.fields.nameEs}`, "u"));
  const english = () => screen.getByLabelText(copy.fields.nameEn);
  const swatch = () => screen.getByLabelText(copy.fields.swatch);
  const addSwatch = () => screen.getByLabelText(copy.fields.swatchAdd);

  return {
    addSwatch,
    copy,
    english,
    onCancel,
    onSave,
    /**
     * Picks a color in `input` as the browser's picker would. happy-dom
     * lowercases a color input's value itself, so the value is read through
     * a getter: a browser that reports capitals still saves lowercase.
     */
    pick: (input: HTMLElement, color: string) => {
      Object.defineProperty(input, "value", {
        configurable: true,
        get: () => color,
      });
      fireEvent.input(input);
    },
    spanish,
    submit: async () => {
      await user.click(screen.getByRole("button", { name: "Save it" }));
    },
    swatch,
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

describe("AttributeForm", () => {
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
    ["Spanish", SIXTY, "", makeSaved({ nameEs: SIXTY })],
    ["English", "Dorado", SIXTY, makeSaved({ nameEn: SIXTY })],
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
    ["English", "Dorado", SIXTY_ONE, "nameEn"],
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

  test("sends the trimmed names, a blank English one and an untouched picker as none", async () => {
    const { addSwatch, english, onSave, spanish, submit, type } = setup({
      withSwatch: true,
    });
    expect(addSwatch()).toHaveAttribute("type", "color");
    await type(spanish(), "  Dorado  ");
    await type(english(), "   ");

    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(makeSaved());
    });
  });

  test("a filter's form offers no swatch", () => {
    setup();

    expect(screen.queryByLabelText("Add a swatch color")).toBeNull();
    expect(screen.queryByLabelText("Swatch color")).toBeNull();
  });

  test("choosing a color in the add control shows the swatch field with it, described", async () => {
    const { addSwatch, pick, swatch } = setup({ withSwatch: true });

    expect(screen.queryByLabelText("Swatch color")).toBeNull();
    pick(addSwatch(), "#d4af37");

    expect(swatch()).toHaveValue("#d4af37");
    expect(swatch()).toHaveAccessibleDescription(
      "A dot of this color shows beside the name."
    );
    expect(screen.queryByLabelText("Add a swatch color")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove color" })).toBeVisible();
  });

  test.each([
    ["the add control", undefined, "Add a swatch color"],
    ["the swatch field", "#000000", "Swatch color"],
  ] as const)(
    "saves a color picked in %s in lowercase",
    async (_control, swatchColor, label) => {
      const { onSave, pick, submit } = setup({
        values: makeSaved({ swatchColor: swatchColor ?? null }),
        withSwatch: true,
      });

      pick(screen.getByLabelText(label), "#D4AF37");
      await submit();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledExactlyOnceWith(
          makeSaved({ swatchColor: "#d4af37" })
        );
      });
    }
  );

  test("removing the swatch saves none and offers to add one again", async () => {
    const { onSave, submit, user } = setup({
      values: makeSaved({ swatchColor: "#d4af37" }),
      withSwatch: true,
    });

    expect(screen.getByLabelText("Swatch color")).toHaveValue("#d4af37");
    await user.click(screen.getByRole("button", { name: "Remove color" }));

    expect(screen.queryByLabelText("Swatch color")).toBeNull();
    expect(screen.getByLabelText("Add a swatch color")).toHaveAttribute(
      "type",
      "color"
    );
    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(makeSaved());
    });
  });

  test("clears itself for the next one once something new is saved, swatch included", async () => {
    const { addSwatch, english, onSave, pick, spanish, submit, type } = setup({
      withSwatch: true,
    });
    await type(spanish(), "Dorado");
    await type(english(), "Gold");
    pick(addSwatch(), "#d4af37");

    await submit();

    await waitFor(() => {
      expect(spanish()).toHaveValue("");
    });
    expect(english()).toHaveValue("");
    expect(screen.queryByLabelText("Swatch color")).toBeNull();
    expect(screen.getByLabelText("Add a swatch color")).toBeEnabled();
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      nameEn: "Gold",
      nameEs: "Dorado",
      swatchColor: "#d4af37",
    });
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  test("puts a name already in use on the Spanish field, keeping what was typed", async () => {
    const { english, spanish, submit, type } = setup({ result: "duplicate" });
    await type(spanish(), "Dorado");
    await type(english(), "Gold");

    await submit();

    await waitFor(() => {
      expect(spanish()).toHaveAttribute("aria-invalid", "true");
    });
    expect(messageOf(spanish())).toBe(
      "There is already one with that name here."
    );
    expect(spanish()).toHaveValue("Dorado");
    expect(english()).toHaveValue("Gold");
    expect(
      screen.queryByText("We could not save the change. Try again.")
    ).toBeNull();
  });

  test("says a failed save failed, keeps the text, and clears the alert on the next try", async () => {
    const { english, onSave, spanish, submit, type } = setup({
      result: "failed",
    });
    await type(spanish(), "Dorado");
    await type(english(), "Gold");

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /^We could not save the change\. Try again\.$/u
    );
    expect(spanish()).toHaveValue("Dorado");
    expect(english()).toHaveValue("Gold");

    onSave.mockImplementationOnce(
      async () => await new Promise<AttributeFormResult>(() => {})
    );
    await submit();

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  test("locks its fields and shows the pending label while saving", async () => {
    const { english, onSave, spanish, submit, type, user } = setup({
      result: "hang",
      withSwatch: true,
    });
    await type(spanish(), "Dorado");
    await type(english(), "Gold");

    await submit();

    const pending = await screen.findByRole("button", { name: "Saving now" });
    expect(pending).toBeDisabled();
    expect(spanish()).toBeDisabled();
    expect(english()).toBeDisabled();
    expect(screen.getByLabelText("Add a swatch color")).toBeDisabled();
    await user.type(spanish(), " claro");
    expect(spanish()).toHaveValue("Dorado");
    expect(onSave).toHaveBeenCalledExactlyOnceWith(
      makeSaved({ nameEn: "Gold" })
    );
  });

  test("an edit form starts from the value, keeps it once saved, and can be cancelled", async () => {
    const { english, onCancel, onSave, spanish, submit, swatch, user } = setup({
      values: makeSaved({ nameEn: "Gold", swatchColor: "#d4af37" }),
      withSwatch: true,
    });

    expect(spanish()).toHaveValue("Dorado");
    expect(english()).toHaveValue("Gold");
    expect(swatch()).toHaveValue("#d4af37");

    await submit();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        makeSaved({ nameEn: "Gold", swatchColor: "#d4af37" })
      );
    });
    expect(spanish()).toHaveValue("Dorado");
    expect(swatch()).toHaveValue("#d4af37");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledExactlyOnceWith(expect.anything());
  });

  test("starts an edit with no English name nor swatch from empty fields", () => {
    const { english } = setup({ values: makeSaved(), withSwatch: true });

    expect(english()).toHaveValue("");
    expect(screen.queryByLabelText("Swatch color")).toBeNull();
    expect(screen.getByLabelText("Add a swatch color")).toHaveAttribute(
      "type",
      "color"
    );
  });

  test("in Spanish, labels its fields and messages in Spanish", async () => {
    const { english, spanish, submit } = setup({
      locale: "es",
      values: makeSaved({ nameEs: "" }),
      withSwatch: true,
    });

    expect(english()).toHaveAccessibleDescription(
      "Si lo dejás vacío, en inglés se muestra el nombre en español."
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeVisible();
    expect(screen.getByLabelText("Agregar color de muestra")).toHaveAttribute(
      "type",
      "color"
    );
    expect(spanish()).toBe(screen.getByLabelText(/^Nombre en español/u));

    await submit();

    await waitFor(() => {
      expect(messageOf(spanish())).toBe("Escribí el nombre en español.");
    });
  });

  test("picking a color keeps the same input in place, focused, and Remove puts focus back on it", async () => {
    const { addSwatch, pick, swatch, user } = setup({ withSwatch: true });
    const input = addSwatch();
    input.focus();

    pick(input, "#d4af37");

    expect(swatch()).toBe(input);
    expect(input).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Remove color" }));

    expect(addSwatch()).toBe(input);
    expect(input).toHaveFocus();
  });

  test("links the swatch hint only while a color is set", async () => {
    const { addSwatch, swatch, user } = setup({
      values: makeSaved({ swatchColor: "#d4af37" }),
      withSwatch: true,
    });

    expect(swatch()).toHaveAccessibleDescription(
      "A dot of this color shows beside the name."
    );

    await user.click(screen.getByRole("button", { name: "Remove color" }));

    expect(addSwatch()).not.toHaveAttribute("aria-describedby");
    expect(addSwatch()).toHaveAccessibleDescription("");
    expect(
      screen.queryByText("A dot of this color shows beside the name.")
    ).toBeNull();
  });

  test.each([
    [true, "New value of “Color”"],
    [false, ""],
  ])("named by its heading: %s", (labelledBy, name) => {
    setup({ labelledBy, withSwatch: true });

    expect(document.querySelector("form")).toHaveAccessibleName(name);
  });

  test.each([
    [true, true],
    [false, false],
  ])(
    "with focusOnOpen %s, the Spanish name has focus once shown: %s",
    async (focusOnOpen, focused) => {
      const { spanish } = setup({ focusOnOpen });

      await waitFor(() => {
        expect(document.activeElement === spanish()).toBe(focused);
      });
    }
  );

  test("locks Cancel while saving, so a late save cannot close a reopened editor", async () => {
    const { onCancel, submit, user } = setup({
      result: "hang",
      values: makeSaved(),
    });

    await submit();

    const cancel = await screen.findByRole("button", { name: "Cancel" });
    await waitFor(() => {
      expect(cancel).toBeDisabled();
    });
    await user.click(cancel);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
