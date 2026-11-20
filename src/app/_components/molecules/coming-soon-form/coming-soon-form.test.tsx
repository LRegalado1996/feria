import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { UpdateComingSoonValues } from "@/lib/schemas/coming-soon";
import { renderWithI18n } from "@/test/i18n";

import { ComingSoonForm, type ComingSoonFormPage } from "./coming-soon-form";

const DEFAULTS = {
  en: {
    eyebrow: "Christmas fair",
    headline: "Opening\nsoon",
    lead: "Soon.",
    marquee: "Jewelry",
  },
  es: {
    eyebrow: "Feria navideña",
    headline: "Muy\npronto",
    lead: "Pronto.",
    marquee: "Bijou",
  },
};

function makePage(
  overrides: Partial<ComingSoonFormPage> = {}
): ComingSoonFormPage {
  return {
    countdownTo: "2026-12-20",
    published: true,
    translations: [
      {
        eyebrow: "Feria · desde el 20",
        headline: "Abrimos\npronto",
        lead: "Te esperamos.",
        locale: "es",
        marquee: null,
      },
    ],
    ...overrides,
  };
}

/**
 * The form, saving through `onSave`, which answers `saved` (the page as
 * stored) or `null` (a failed save); submitted by a button outside it, as
 * the screen's top bar does.
 */
function setup({
  locale = "en",
  page = makePage(),
  saved = page,
}: {
  locale?: Locale;
  page?: ComingSoonFormPage;
  saved?: ComingSoonFormPage | null;
} = {}) {
  const onSave = vi.fn(
    async (_values: UpdateComingSoonValues) => await Promise.resolve(saved)
  );

  const screenFor = (shown: ComingSoonFormPage) => (
    <>
      <ComingSoonForm
        className="extra"
        defaults={DEFAULTS}
        id="coming-soon-form"
        onSave={onSave}
        page={shown}
      />
      <button form="coming-soon-form" type="submit">
        Submit
      </button>
    </>
  );
  const { rerender } = renderWithI18n(screenFor(page), { locale });

  return {
    field: (name: string) => screen.getByRole("textbox", { name }),
    onSave,
    /** A later read of the page reaches the form, as a refetch does. */
    refresh: (stored: ComingSoonFormPage) => {
      rerender(screenFor(stored));
    },
    submit: async () => {
      await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    },
    user: userEvent.setup(),
  };
}

describe("ComingSoonForm", () => {
  test("opens with what is stored, each field in its language, showing while empty what the page then says", () => {
    const { field } = setup();

    // The line over the headline is one line: an input, not a box.
    expect(field("Line over the headline, in Spanish")).toHaveValue(
      "Feria · desde el 20"
    );
    expect(field("Line over the headline, in Spanish").tagName).toBe("INPUT");
    expect(field("Line over the headline, in English")).toHaveAttribute(
      "placeholder",
      "Christmas fair"
    );
    expect(field("Line over the headline, in English")).toHaveAttribute(
      "lang",
      "en"
    );
    expect(field("Headline in Spanish")).toHaveValue("Abrimos\npronto");
    expect(field("Headline in Spanish")).toHaveAttribute("lang", "es");
    expect(field("Text under the headline, in Spanish")).toHaveValue(
      "Te esperamos."
    );
    expect(field("Moving band, in Spanish")).toHaveValue("");
    expect(field("Moving band, in Spanish")).toHaveAttribute(
      "placeholder",
      "Bijou"
    );
    expect(field("Headline in English")).toHaveValue("");
    expect(field("Headline in English")).toHaveAttribute("lang", "en");
    expect(field("Headline in English")).toHaveAttribute(
      "placeholder",
      "Opening\nsoon"
    );
    expect(screen.getByLabelText("Count the days until")).toHaveValue(
      "2026-12-20"
    );
    expect(screen.getByTestId("coming-soon-form")).toHaveClass("extra");
  });

  test("submits both languages and the day, a blank text as null", async () => {
    const { field, onSave, submit, user } = setup({
      page: makePage({ countdownTo: null, translations: [] }),
    });
    await user.type(field("Headline in English"), "We open{Enter}Saturday");

    await submit();

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      countdownTo: null,
      translations: [
        {
          eyebrow: null,
          headline: null,
          lead: null,
          locale: "es",
          marquee: null,
        },
        {
          eyebrow: null,
          headline: "We open\nSaturday",
          lead: null,
          locale: "en",
          marquee: null,
        },
      ],
    });
  });

  test("refuses a third line of the headline under its field, sending nothing", async () => {
    const { field, onSave, submit, user } = setup();
    await user.type(field("Headline in English"), "a{Enter}b{Enter}c");

    await submit();

    expect(await screen.findByText("Use up to 2 lines.")).toBeVisible();
    expect(field("Headline in English")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  test("once saved, shows the page as it was stored", async () => {
    const { field, submit } = setup({
      saved: makePage({
        translations: [
          {
            eyebrow: null,
            headline: "Guardado",
            lead: null,
            locale: "es",
            marquee: null,
          },
        ],
      }),
    });

    await submit();

    expect(field("Headline in Spanish")).toHaveValue("Guardado");
  });

  test("a failed save keeps everything typed", async () => {
    const { field, onSave, submit, user } = setup({ saved: null });
    await user.type(field("Moving band, in English"), "Jewelry");

    await submit();

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      countdownTo: "2026-12-20",
      translations: [
        {
          eyebrow: "Feria · desde el 20",
          headline: "Abrimos\npronto",
          lead: "Te esperamos.",
          locale: "es",
          marquee: null,
        },
        {
          eyebrow: null,
          headline: null,
          lead: null,
          locale: "en",
          marquee: "Jewelry",
        },
      ],
    });
    expect(field("Moving band, in English")).toHaveValue("Jewelry");
  });

  test("a newer page read after it opened replaces the fields left alone, never what the admin typed", async () => {
    const { field, onSave, refresh, submit, user } = setup();
    await user.clear(field("Text under the headline, in Spanish"));
    await user.type(field("Text under the headline, in Spanish"), "Mío");

    // Another admin saved a new headline and text in the meantime.
    refresh(
      makePage({
        translations: [
          {
            eyebrow: "Feria · desde el 20",
            headline: "De ellos",
            lead: "Suyo",
            locale: "es",
            marquee: null,
          },
        ],
      })
    );

    expect(field("Headline in Spanish")).toHaveValue("De ellos");
    expect(field("Text under the headline, in Spanish")).toHaveValue("Mío");
    await submit();
    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      countdownTo: "2026-12-20",
      translations: [
        {
          eyebrow: "Feria · desde el 20",
          headline: "De ellos",
          lead: "Mío",
          locale: "es",
          marquee: null,
        },
        {
          eyebrow: null,
          headline: null,
          lead: null,
          locale: "en",
          marquee: null,
        },
      ],
    });
  });

  test("a field saved is no longer the admin's edit: a newer page read after the save replaces it", async () => {
    const mine = makePage({
      translations: [
        {
          eyebrow: "Feria · desde el 20",
          headline: "Abrimos\npronto",
          lead: "Mío",
          locale: "es",
          marquee: null,
        },
      ],
    });
    const { field, refresh, submit, user } = setup({ saved: mine });
    await user.clear(field("Text under the headline, in Spanish"));
    await user.type(field("Text under the headline, in Spanish"), "Mío");
    await submit();
    refresh(mine);

    // Another admin then saved a new text over it.
    refresh(
      makePage({
        translations: [
          {
            eyebrow: "Feria · desde el 20",
            headline: "Abrimos\npronto",
            lead: "Suyo",
            locale: "es",
            marquee: null,
          },
        ],
      })
    );

    expect(field("Text under the headline, in Spanish")).toHaveValue("Suyo");
  });

  test("in Spanish, labels and refuses in Spanish", async () => {
    const { field, submit, user } = setup({ locale: "es" });
    await user.type(field("Banda en movimiento, en inglés"), "x".repeat(121));

    await submit();

    expect(await screen.findByText("Usá hasta 120 caracteres.")).toBeVisible();
    expect(screen.getByText("Textos en español")).toBeVisible();
  });
});
