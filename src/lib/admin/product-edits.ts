import { z } from "zod";

import { reportError } from "@/lib/errors/client";
import {
  createProductFormSchema,
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
 * What is stored: the form as it was, and the change time of the article it
 * was typed over. Read back it is untrusted (another tab, an older version
 * of this page, a hand edit), so it is parsed whole or dropped.
 */
const storedEditsSchema = z.object({
  baseUpdatedAt: z.iso.datetime({ offset: true }),
  values: createProductFormSchema(),
  version: z.literal(1),
});

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
  | { kind: "none" }
  | { kind: "restored"; values: ProductFormValues }
  | { kind: "stale" };

/**
 * The changes this browser kept for the article, if any: `restored` when
 * they were typed over the article as it still is, `stale` (and dropped)
 * when the article changed since (`updatedAt`), `none` otherwise. A copy
 * that does not read is dropped and counts as none.
 */
export function restoreProductEdits(
  id: number,
  updatedAt: Date | string
): RestoredEdits {
  try {
    const text = storage()?.getItem(productEditsKey(id)) ?? null;

    if (text === null) {
      return { kind: "none" };
    }

    const parsed = storedEditsSchema.safeParse(JSON.parse(text));

    if (!parsed.success) {
      dropProductEdits(id);
      return { kind: "none" };
    }

    if (
      new Date(parsed.data.baseUpdatedAt).getTime() !==
      new Date(updatedAt).getTime()
    ) {
      dropProductEdits(id);
      return { kind: "stale" };
    }

    return { kind: "restored", values: parsed.data.values };
  } catch (error) {
    // Text that is no JSON is as good as none, and so is a refused read.
    if (!(error instanceof SyntaxError)) {
      reportError(error, { action: "Product.read_local_edits" });
    }
    dropProductEdits(id);
    return { kind: "none" };
  }
}

/**
 * Keeps the form's state for the article, typed over the article as it was
 * at `updatedAt`. A browser that refuses to store it (full, private) is
 * reported; the form keeps the changes while the page stays open.
 */
export function keepProductEdits(
  id: number,
  updatedAt: Date | string,
  values: ProductFormValues
): void {
  try {
    storage()?.setItem(
      productEditsKey(id),
      JSON.stringify({
        baseUpdatedAt: new Date(updatedAt).toISOString(),
        values,
        version: 1,
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
