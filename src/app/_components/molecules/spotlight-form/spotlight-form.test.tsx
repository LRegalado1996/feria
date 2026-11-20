import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { SpotlightFormValues } from "@/lib/schemas/page";
import { renderWithI18n } from "@/test/i18n";

import { SpotlightForm, type SpotlightFormSpotlight } from "./spotlight-form";

function makeSpotlight(
  overrides: Partial<SpotlightFormSpotlight> = {}
): SpotlightFormSpotlight {
  return {
    id: 51,
    labelEn: "New",
    labelEs: "Nuevo",
    phraseEn: null,
    phraseEs: "El que más piden.",
    productId: 22,
    ...overrides,
  };
}

function setup({
  locale = "en",
  rowsIndex = null,
  saves = true,
  spotlight = null,
}: {
  locale?: Locale;
  rowsIndex?: number | null;
  saves?: boolean;
  spotlight?: SpotlightFormSpotlight | null;
} = {}) {
  const onSave = vi.fn(
    async (_values: SpotlightFormValues) => await Promise.resolve(saves)
  );
  const onCancel = vi.fn<() => void>();
  renderWithI18n(
    <SpotlightForm
      articles={[
        { id: 21, label: "Anillo sello" },
        { id: 22, label: "Burbujero pez" },
      ]}
      onCancel={onCancel}
      onSave={onSave}
      rows={["Best sellers", "Rings", "Featured"]}
      rowsIndex={rowsIndex}
      spotlight={spotlight}
    />,
    { locale }
  );
  const user = userEvent.setup();

  return {
    field: (name: string) => screen.getByRole("textbox", { name }),
    onCancel,
    onSave,
    select: (name: string) => screen.getByRole("combobox", { name }),
    submit: async () => {
      await user.click(screen.getByTestId("spotlight-form-submit"));
    },
    user,
  };
}

describe("SpotlightForm", () => {
  test("a new spotlight opens with no article chosen, first on the page, and offers every row to go after", () => {
    const { select } = setup();

    expect(screen.getByRole("form", { name: "New spotlight" })).toBeVisible();
    expect(select("Article")).toHaveValue("");
    expect(select("After")).toHaveValue("0");
    expect(
      [...select("After").querySelectorAll("option")].map(
        (option) => option.textContent
      )
    ).toEqual([
      "At the very top, under the cover",
      "Best sellers",
      "Rings",
      "Featured",
    ]);
  });

  test("tells assistive tech which control is required, and only that one", () => {
    const { select } = setup();

    expect(select("Article")).toBeRequired();
    expect(select("After")).not.toBeRequired();

    for (const name of [
      "Label in Spanish",
      "Label in English",
      "Phrase in Spanish",
      "Phrase in English",
    ]) {
      expect(screen.getByRole("textbox", { name })).not.toBeRequired();
    }
  });

  test("refuses a spotlight with no article, under its field, saving nothing", async () => {
    const { onSave, select, submit } = setup();

    await submit();

    expect(await screen.findByText("Choose the article.")).toBeVisible();
    expect(select("Article")).toHaveAttribute("aria-invalid", "true");
    expect(select("Article")).toHaveAccessibleDescription(
      expect.stringContaining("Choose the article.")
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  test("sends the article, its words with blanks as none, and its place", async () => {
    const { field, onSave, select, submit, user } = setup();

    await user.selectOptions(select("Article"), "Burbujero pez");
    await user.type(field("Label in Spanish"), " Nuevo ");
    await user.type(field("Phrase in English"), "Kids love it.");
    await user.selectOptions(select("After"), "Rings");
    await submit();

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      labelEn: null,
      labelEs: "Nuevo",
      phraseEn: "Kids love it.",
      phraseEs: null,
      productId: 22,
      rowsIndex: 2,
    });
  });

  test.each([
    ["Label in English", "labelEn", 24],
    ["Phrase in Spanish", "phraseEs", 140],
  ] as const)(
    "%s takes %i characters and sends them as typed",
    async (name, key, length) => {
      const { field, onSave, select, submit, user } = setup();
      const words = "x".repeat(length);

      await user.selectOptions(select("Article"), "Anillo sello");
      await user.click(field(name));
      await user.paste(words);
      await submit();

      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        labelEn: null,
        labelEs: null,
        phraseEn: null,
        phraseEs: null,
        productId: 21,
        rowsIndex: 0,
        [key]: words,
      });
    }
  );

  test.each([
    ["Label in English", 25, "Use up to 24 characters."],
    ["Phrase in Spanish", 141, "Use up to 140 characters."],
  ] as const)(
    "%s refuses %i characters under its field, saving nothing",
    async (name, length, message) => {
      const { field, onSave, select, submit, user } = setup();

      await user.selectOptions(select("Article"), "Anillo sello");
      await user.click(field(name));
      await user.paste("x".repeat(length));
      await submit();

      expect(await screen.findByText(message)).toBeVisible();
      expect(field(name)).toHaveAttribute("aria-invalid", "true");
      expect(field(name)).toHaveAccessibleDescription(
        expect.stringContaining(message)
      );
      expect(onSave).not.toHaveBeenCalled();
    }
  );

  test.each([
    [
      "Label in Spanish",
      "Optional. The green pill above the name, such as “New”.",
    ],
    [
      "Label in English",
      "Optional. The green pill above the name, such as “New”.",
    ],
    ["Phrase in Spanish", "Optional. A short line under the price."],
    ["Phrase in English", "Optional. A short line under the price."],
  ])("%s is described by its hint", (name, hint) => {
    const { field } = setup();

    expect(field(name)).toHaveAccessibleDescription(hint);
  });

  test("an edit opens on its article, words and place, its words in their languages", () => {
    const { field, select } = setup({
      rowsIndex: 2,
      spotlight: makeSpotlight(),
    });

    expect(screen.getByRole("form", { name: "Edit spotlight" })).toBeVisible();
    expect(select("Article")).toHaveDisplayValue("Burbujero pez");
    expect(field("Label in Spanish")).toHaveValue("Nuevo");
    expect(field("Label in Spanish")).toHaveAttribute("lang", "es");
    expect(field("Label in English")).toHaveValue("New");
    expect(field("Phrase in Spanish")).toHaveValue("El que más piden.");
    expect(field("Phrase in English")).toHaveValue("");
    expect(field("Phrase in English")).toHaveAttribute("lang", "en");
    expect(select("After")).toHaveValue("2");
  });

  test("an edit of its words alone sends no place, so it stays where it is now", async () => {
    const { field, onSave, submit, user } = setup({
      rowsIndex: 1,
      spotlight: makeSpotlight(),
    });

    await user.clear(field("Label in English"));
    await user.type(field("Label in English"), "Fresh");
    await submit();

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      labelEn: "Fresh",
      labelEs: "Nuevo",
      phraseEn: null,
      phraseEs: "El que más piden.",
      productId: 22,
    });
  });

  test("an edit that moves it sends its new place", async () => {
    const { onSave, select, submit, user } = setup({
      rowsIndex: 1,
      spotlight: makeSpotlight(),
    });

    await user.selectOptions(select("After"), "Featured");
    await submit();

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      labelEn: "New",
      labelEs: "Nuevo",
      phraseEn: null,
      phraseEs: "El que más piden.",
      productId: 22,
      rowsIndex: 3,
    });
  });

  test("a place past the end of the rows opens at the last one", () => {
    const { select } = setup({ rowsIndex: 9, spotlight: makeSpotlight() });

    expect(select("After")).toHaveValue("3");
  });

  test("a failed save keeps everything typed and says so", async () => {
    const { field, onSave, submit, user } = setup({
      saves: false,
      spotlight: makeSpotlight(),
    });

    await user.clear(field("Label in English"));
    await user.type(field("Label in English"), "Fresh");
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not save the spotlight. What you typed is still here: try again."
    );
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      labelEn: "Fresh",
      labelEs: "Nuevo",
      phraseEn: null,
      phraseEs: "El que más piden.",
      productId: 22,
    });
    expect(field("Label in English")).toHaveValue("Fresh");
  });

  test("cancel closes without saving", async () => {
    const { onCancel, onSave, user } = setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
    expect(onSave).not.toHaveBeenCalled();
  });

  test("speaks Spanish on a Spanish page", () => {
    setup({ locale: "es" });

    expect(screen.getByRole("form", { name: "Nueva vidriera" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Guardar vidriera" })
    ).toBeVisible();
  });
});
