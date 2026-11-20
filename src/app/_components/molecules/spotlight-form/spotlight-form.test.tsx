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

  test("refuses a spotlight with no article, under its field, saving nothing", async () => {
    const { onSave, submit } = setup();

    await submit();

    expect(await screen.findByText("Choose the article.")).toBeVisible();
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

  test("refuses a label over 24 characters under its field", async () => {
    const { field, onSave, select, submit, user } = setup();

    await user.selectOptions(select("Article"), "Anillo sello");
    await user.type(field("Label in English"), "x".repeat(25));
    await submit();

    expect(await screen.findByText("Use up to 24 characters.")).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
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

  test("a place past the end of the rows opens at the last one", () => {
    const { select } = setup({ rowsIndex: 9, spotlight: makeSpotlight() });

    expect(select("After")).toHaveValue("3");
  });

  test("a failed save keeps everything typed and says so", async () => {
    const { field, submit } = setup({
      saves: false,
      spotlight: makeSpotlight(),
    });

    await submit();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We could not save the spotlight. What you typed is still here: try again."
    );
    expect(field("Label in English")).toHaveValue("New");
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
