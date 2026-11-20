import { z } from "zod";

import { reportError } from "@/lib/errors/client";
import {
  PRODUCT_ATTRIBUTE_VALUES_MAX,
  PRODUCT_IMAGES_MAX,
  type ProductFormValues,
} from "@/lib/schemas/catalog";

/**
 * Changes to a published article are kept in this browser until "Guardar
 * cambios" writes them (FER-017): the storefront shows every write at once,
 * so typing never reaches it. One copy per article, keyed by its id.
 */
export function productEditsKey(id: number): string {
  return `feria:product-edit:${id}`;
}

/**
 * How long a kept copy lasts from its first change: well under the two days
 * after which the orphan cleanup deletes a photo no row names
 * (`cleanUpOrphanBlobs`), so every photo uploaded into it still exists when
 * it is saved, even a day later.
 */
export const PRODUCT_EDITS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Far above any field's limit, yet a bound on what a copy may hold. */
const KEPT_TEXT_MAX_LENGTH = 20_000;

const keptTexts = z.object({
  description: z.string().max(KEPT_TEXT_MAX_LENGTH),
  title: z.string().max(KEPT_TEXT_MAX_LENGTH),
});

/**
 * The form as it was typed, by its shape only: a title over its limit or a
 * price with a third decimal is kept as typed, for the form to flag once it
 * is back, never a reason to lose every other change.
 */
const keptValuesSchema: z.ZodType<ProductFormValues> = z.object({
  attributeValueIds: z
    .array(z.number().int().positive())
    .max(PRODUCT_ATTRIBUTE_VALUES_MAX),
  categoryId: z.string().regex(/^\d*$/u),
  en: keptTexts,
  es: keptTexts,
  images: z
    .array(
      z.object({
        height: z.number().int().positive(),
        url: z.string().min(1).max(500),
        width: z.number().int().positive(),
      })
    )
    .max(PRODUCT_IMAGES_MAX),
  isAvailable: z.boolean(),
  price: z.number().nullable(),
});

/**
 * What is stored: the form as it was, the change time of the article it was
 * typed over and when its first change was kept. Read back it is untrusted
 * (another tab, an older version of this page, a hand edit), so it is parsed
 * whole or dropped.
 */
const storedEditsSchema = z.object({
  baseUpdatedAt: z.iso.datetime({ offset: true }),
  startedAt: z.iso.datetime({ offset: true }),
  values: keptValuesSchema,
  version: z.literal(2),
});

/** The stored text, read as JSON and then as a copy. */
const storedTextSchema = z
  .string()
  .transform((text, context): unknown => {
    try {
      return JSON.parse(text);
    } catch (error) {
      context.addIssue({ code: "custom", message: String(error) });
      return z.NEVER;
    }
  })
  .pipe(storedEditsSchema);

/** A stored copy, or `null` when there is none or it does not read. */
function parseStored(text: string | null) {
  const parsed = text === null ? null : storedTextSchema.safeParse(text);

  return parsed?.success ? parsed.data : null;
}

/** The browser's storage, or `null` where it is refused (a private window). */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch (error) {
    reportError(error, { action: "Product.read_local_edits" });
    return null;
  }
}

/** What `restoreProductEdits` found for the article. */
export type RestoredEdits =
  | { kind: "expired" }
  | { kind: "none" }
  | { kind: "restored"; values: ProductFormValues }
  | { kind: "stale" };

/**
 * The changes this browser kept for the article, if any: `restored` when
 * they were typed over the article as it still is, `stale` (and dropped)
 * when the article changed since (`updatedAt`), `expired` (and dropped) when
 * the first of them is older than `PRODUCT_EDITS_MAX_AGE_MS`, `none`
 * otherwise. A copy that does not read is dropped and counts as none.
 */
export function restoreProductEdits(
  id: number,
  updatedAt: Date | string,
  now: Date = new Date()
): RestoredEdits {
  try {
    const text = storage()?.getItem(productEditsKey(id)) ?? null;

    if (text === null) {
      return { kind: "none" };
    }

    const kept = parseStored(text);

    if (!kept) {
      dropProductEdits(id);
      return { kind: "none" };
    }

    if (
      new Date(kept.baseUpdatedAt).getTime() !== new Date(updatedAt).getTime()
    ) {
      dropProductEdits(id);
      return { kind: "stale" };
    }

    if (
      now.getTime() - new Date(kept.startedAt).getTime() >
      PRODUCT_EDITS_MAX_AGE_MS
    ) {
      dropProductEdits(id);
      return { kind: "expired" };
    }

    return { kind: "restored", values: kept.values };
  } catch (error) {
    // A refused read is as good as none.
    reportError(error, { action: "Product.read_local_edits" });
    dropProductEdits(id);
    return { kind: "none" };
  }
}

/**
 * Keeps the form's state for the article, typed over the article as it was
 * at `updatedAt`, keeping when the copy's first change was made (`now` for
 * a new copy). A browser that refuses to store it (full, private) is
 * reported; the form keeps the changes while the page stays open.
 */
export function keepProductEdits(
  id: number,
  updatedAt: Date | string,
  values: ProductFormValues,
  now: Date = new Date()
): void {
  try {
    const baseUpdatedAt = new Date(updatedAt).toISOString();
    const kept = parseStored(storage()?.getItem(productEditsKey(id)) ?? null);

    storage()?.setItem(
      productEditsKey(id),
      JSON.stringify({
        baseUpdatedAt,
        startedAt:
          kept?.baseUpdatedAt === baseUpdatedAt
            ? kept.startedAt
            : now.toISOString(),
        values,
        version: 2,
      })
    );
  } catch (error) {
    reportError(error, { action: "Product.keep_local_edits" });
  }
}

/** Forgets the article's kept changes: saved, or discarded. */
export function dropProductEdits(id: number): void {
  try {
    storage()?.removeItem(productEditsKey(id));
  } catch (error) {
    reportError(error, { action: "Product.drop_local_edits" });
  }
}
