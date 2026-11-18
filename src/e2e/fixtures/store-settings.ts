import type { APIRequestContext } from "@playwright/test";

import type { UpdateStoreValues } from "../../lib/schemas/store";

/** The store's texts during a run, one per language. */
export const STORE_TEXTS = {
  en: {
    description: "Handmade rings and chains.",
    locale: "en",
    tagline: "Jewelry at the fair",
  },
  es: {
    description: "Anillos y cadenas hechos a mano.",
    locale: "es",
    tagline: "Joyas en la feria",
  },
} as const;

/**
 * The store's settings for the whole run (FER-038: the store is one row every
 * spec shares, and its settings are global). Every worker writes these same
 * values as it starts, so parallel workers converge, and a spec asserts them
 * instead of setting its own. The name is not the brand's, so a title that
 * reads it proves it came from the store. TikTok is left out, so the footer
 * shows that a store without a link has none. A spec that needs other
 * settings is a `*.serial.e2e.ts` and changes them through `storeEdit`,
 * which writes these back when the test ends. The currency is not a setting
 * (FER-014: fixed per store, never written through the API): the store the
 * migrations create is in pesos, and the specs read prices in pesos.
 */
export const STORE_SETTINGS = {
  instagramUrl: "https://instagram.com/e2e-market",
  name: "E2E Market",
  tiktokUrl: null,
  translations: [STORE_TEXTS.es, STORE_TEXTS.en],
  whatsappNumber: "+59899123456",
} satisfies UpdateStoreValues;

/**
 * Replaces the store's settings through `store.update`, as an admin does: the
 * procedure drops the cached store and its cached article pages, so the next
 * visit reads the new values. `request` carries an admin's session.
 */
export async function writeStoreSettings(
  request: APIRequestContext,
  values: UpdateStoreValues
): Promise<void> {
  const response = await request.post("/api/orpc/store/update", {
    data: { json: values },
  });

  if (response.status() !== 200) {
    throw new Error(
      `store.update answered ${response.status()}: ${await response.text()}`
    );
  }
}
