import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { UpdateStoreValues } from "@/lib/schemas/store";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import { SettingsForm, type SettingsFormStore } from "./settings-form";

const SPANISH = {
  description: "Anillos y cadenas.",
  locale: "es",
  tagline: "Joyas en la feria",
} as const;
const ENGLISH = {
  description: "Rings and chains.",
  locale: "en",
  tagline: "Jewelry at the fair",
} as const;

function makeStore(
  overrides: Partial<SettingsFormStore> = {}
): SettingsFormStore {
  return {
    currencyCode: "USD",
    instagramUrl: "https://instagram.com/sample",
    name: "Sample Store",
    tiktokUrl: null,
    translations: [SPANISH, ENGLISH],
    whatsappNumber: "+59899123456",
    ...overrides,
  };
}

/**
 * The form for `store`, with the screen's save button beside it (it lives in
 * the top bar, tied to the form by its id), and a save that answers `saves`:
 * the store as stored, a failure, or nothing until `finish()`.
 */
function setup({
  locale = "en",
  saves = "saved",
  store = makeStore(),
}: {
  locale?: Locale;
  saves?: "failed" | "held" | "saved";
  store?: SettingsFormStore;
} = {}) {
  const held: (() => void)[] = [];
  const onSave = vi.fn(
    async (values: UpdateStoreValues): Promise<SettingsFormStore | null> => {
      if (saves === "failed") {
        return null;
      }

      if (saves === "held") {
        await new Promise<void>((resolve) => {
          held.push(resolve);
        });
      }

      // The server keeps the number in E.164: here, as another one entirely,
      // so the test sees the form show what was stored, not what was typed.
      return { ...store, ...values, whatsappNumber: "+59891000000" };
    }
  );
  renderWithI18n(
    <>
      <SettingsForm id="settings" onSave={onSave} store={store} />
      <button form="settings" type="submit">
        Save
      </button>
    </>,
    { locale }
  );
  const user = userEvent.setup();

  return {
    field: (name: string) => screen.getByRole("textbox", { name }),
    finish: () => {
      for (const resolve of held.splice(0)) {
        resolve();
      }
    },
    onSave,
    save: async () => {
      await user.click(screen.getByRole("button", { name: "Save" }));
    },
    user,
  };
}

describe("SettingsForm", () => {
  test("opens with the store's settings in their fields", () => {
    const { field } = setup();

    expect(field("Store name")).toHaveValue("Sample Store");
    expect(field("Tagline in Spanish")).toHaveValue("Joyas en la feria");
    expect(field("Tagline in English")).toHaveValue("Jewelry at the fair");
    expect(field("Description in Spanish")).toHaveValue("Anillos y cadenas.");
    expect(field("Description in English")).toHaveValue("Rings and chains.");
    expect(field("WhatsApp number")).toHaveValue("+59899123456");
    expect(field("Instagram link")).toHaveValue("https://instagram.com/sample");
    expect(field("TikTok link")).toHaveValue("");
  });

  test.each([
    ["en", "UYU", "CurrencyUruguayan pesos (UYU)"],
    ["en", "USD", "CurrencyUS dollars (USD)"],
    ["es", "UYU", "MonedaPesos uruguayos (UYU)"],
    ["es", "USD", "MonedaDólares estadounidenses (USD)"],
  ] as const)(
    "in %s, shows a store in %s its currency as text it cannot change",
    (locale, currencyCode, shown) => {
      setup({ locale, store: makeStore({ currencyCode }) });

      // The label, the currency, then the line that says it is fixed.
      expect(screen.getByTestId("settings-currency")).toHaveTextContent(
        `${shown}${DICTIONARIES[locale].admin.settings.currencyHint}`
      );
      expect(screen.queryByRole("combobox")).toBeNull();
      expect(screen.queryByLabelText(/currency|moneda/iu)).toBeNull();
    }
  );

  test.each([
    ["Store name", "Store name*"],
    ["Tagline in Spanish", "Tagline in Spanish*"],
    ["Tagline in English", "Tagline in English*"],
    ["Description in Spanish", "Description in Spanish*"],
    ["Description in English", "Description in English*"],
    ["WhatsApp number", "WhatsApp number"],
    ["Instagram link", "Instagram link"],
    ["TikTok link", "TikTok link"],
  ])(
    "marks %s as the schema asks for it: its label reads %s",
    (name, label) => {
      const { field } = setup();

      expect(
        document.querySelector(`label[for="${field(name).id}"]`)?.textContent
      ).toBe(label);
    }
  );

  test("marks each text with its language", () => {
    const { field } = setup();

    expect(field("Tagline in Spanish")).toHaveAttribute("lang", "es");
    expect(field("Tagline in English")).toHaveAttribute("lang", "en");
    expect(field("Description in Spanish")).toHaveAttribute("lang", "es");
    expect(field("Description in English")).toHaveAttribute("lang", "en");
  });

  test("in Spanish, names its fields in Spanish", () => {
    const { field } = setup({ locale: "es" });

    expect(field("Nombre de la tienda")).toHaveValue("Sample Store");
    expect(field("Número de WhatsApp")).toHaveValue("+59899123456");
    expect(
      screen.getByRole("region", { name: "Contacto y redes" })
    ).toContainElement(field("Enlace de Instagram"));
  });

  test("opens a language the store has no text in empty, and asks for it before saving", async () => {
    const { field, onSave, save } = setup({
      store: makeStore({ translations: [SPANISH] }),
    });
    expect(field("Tagline in English")).toHaveValue("");

    await save();

    expect(
      await screen.findByText("Write the tagline.", { exact: true })
    ).toBeVisible();
    expect(field("Tagline in English")).toHaveAttribute("aria-invalid", "true");
    expect(field("Description in English")).toHaveAccessibleDescription(
      "Write the description."
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  test("sends every setting, the number read as typed and a cleared link as null, never the currency", async () => {
    const { field, onSave, save, user } = setup();
    await user.clear(field("Store name"));
    await user.type(field("Store name"), "Renamed Store");
    await user.clear(field("WhatsApp number"));
    await user.type(field("WhatsApp number"), "098 765 432");
    await user.clear(field("Instagram link"));
    await user.type(field("TikTok link"), "https://tiktok.com/@sample");

    await save();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith({
        instagramUrl: null,
        name: "Renamed Store",
        tiktokUrl: "https://tiktok.com/@sample",
        translations: [SPANISH, ENGLISH],
        whatsappNumber: "+59898765432",
      });
    });
  });

  test("shows the settings as they were stored once saved", async () => {
    const { field, save, user } = setup();
    await user.clear(field("WhatsApp number"));
    await user.type(field("WhatsApp number"), "098 765 432");

    await save();

    await waitFor(() => {
      expect(field("WhatsApp number")).toHaveValue("+59891000000");
    });
  });

  test("keeps everything typed when the save fails", async () => {
    const { field, onSave, save, user } = setup({ saves: "failed" });
    await user.clear(field("Tagline in Spanish"));
    await user.type(field("Tagline in Spanish"), "Texto nuevo");
    await user.clear(field("WhatsApp number"));
    await user.type(field("WhatsApp number"), "098 765 432");

    await save();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ whatsappNumber: "+59898765432" })
      );
    });
    expect(field("Tagline in Spanish")).toHaveValue("Texto nuevo");
    expect(field("WhatsApp number")).toHaveValue("098 765 432");
  });

  test("refuses a number it cannot read under its field, focusing it, and sends nothing", async () => {
    const { field, onSave, save, user } = setup();
    await user.clear(field("WhatsApp number"));
    await user.type(field("WhatsApp number"), "099 123 45");

    await save();

    const number = field("WhatsApp number");
    await waitFor(() => {
      expect(number).toHaveAttribute("aria-invalid", "true");
    });
    expect(number).toHaveFocus();
    expect(number).toHaveAccessibleDescription(
      expect.stringContaining(
        "That is not a WhatsApp number we can use. Write it as 099 123 456"
      )
    );
    expect(
      within(
        screen.getByRole("region", { name: "Contact and socials" })
      ).getByRole("alert")
    ).toHaveTextContent(/^That is not a WhatsApp number we can use\./u);
    expect(onSave).not.toHaveBeenCalled();
  });

  test("a blank number is no WhatsApp, never a refused one", async () => {
    const { field, onSave, save, user } = setup();
    await user.clear(field("WhatsApp number"));

    await save();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ whatsappNumber: null })
      );
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("shuts every field while the save is on its way, and opens them after", async () => {
    const { field, finish, onSave, save } = setup({ saves: "held" });

    await save();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: "Sample Store" })
      );
    });
    expect(field("Store name")).toBeDisabled();
    expect(field("Description in English")).toBeDisabled();

    finish();

    await waitFor(() => {
      expect(field("Store name")).toBeEnabled();
    });
  });
});
