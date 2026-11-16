import { ORPCError } from "@orpc/server";
import { and, eq, notInArray, sql } from "drizzle-orm";

import type { UpdateStoreValues } from "@/lib/schemas/store";
import type { DatabaseClient } from "@/server/db";
import { store, storeTranslation } from "@/server/db/schema";

const TRANSLATION_COLUMNS = {
  description: storeTranslation.description,
  locale: storeTranslation.locale,
  tagline: storeTranslation.tagline,
};

function storeNotFound() {
  return new ORPCError("NOT_FOUND", { message: "Store not found" });
}

/**
 * The columns a person sets, named one by one: a write never spreads its
 * input into the row, so a key the schema did not list cannot reach the table.
 */
function toStoreRow(values: UpdateStoreValues) {
  return {
    currencyCode: values.currencyCode,
    instagramUrl: values.instagramUrl,
    name: values.name,
    tiktokUrl: values.tiktokUrl,
    whatsappNumber: values.whatsappNumber,
  };
}

/** The store's texts as rows of `store_translation`, column by column too. */
function toTranslationRows(
  storeId: number,
  translations: Readonly<UpdateStoreValues["translations"]>
) {
  return translations.map((translation) => ({
    description: translation.description,
    locale: translation.locale,
    storeId,
    tagline: translation.tagline,
  }));
}

/**
 * The store the site sells for (FER-038): the table's one row, with its texts
 * in every language it has. `null` only before that row exists, on a
 * database whose migrations have not run.
 */
export async function findStore(db: DatabaseClient) {
  const found = await db.query.store.findFirst({
    columns: {
      currencyCode: true,
      id: true,
      instagramUrl: true,
      name: true,
      tiktokUrl: true,
      whatsappNumber: true,
    },
    with: {
      translations: {
        columns: { description: true, locale: true, tagline: true },
      },
    },
  });

  return found ?? null;
}

export type PublicStore = NonNullable<Awaited<ReturnType<typeof findStore>>>;

/** {@link findStore}, answering NOT_FOUND instead of `null`. */
export async function getStore(db: DatabaseClient) {
  const found = await findStore(db);

  if (!found) {
    throw storeNotFound();
  }

  return found;
}

/**
 * Replaces everything a person can set on the store, texts included: a
 * language left out of `translations` loses its text. The row is locked
 * first and every write names its id, all in one transaction, so a reader
 * never sees the new name with the old texts.
 */
export async function updateStore(
  db: DatabaseClient,
  values: UpdateStoreValues
) {
  return await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: store.id })
      .from(store)
      .for("update");

    if (!current) {
      throw storeNotFound();
    }

    const [updated] = await tx
      .update(store)
      .set(toStoreRow(values))
      .where(eq(store.id, current.id))
      .returning({
        currencyCode: store.currencyCode,
        id: store.id,
        instagramUrl: store.instagramUrl,
        name: store.name,
        tiktokUrl: store.tiktokUrl,
        whatsappNumber: store.whatsappNumber,
      });

    if (!updated) {
      throw storeNotFound();
    }

    const locales = values.translations.map(({ locale }) => locale);

    await tx
      .delete(storeTranslation)
      .where(
        and(
          eq(storeTranslation.storeId, updated.id),
          locales.length > 0
            ? notInArray(storeTranslation.locale, locales)
            : undefined
        )
      );

    const translations =
      values.translations.length > 0
        ? await tx
            .insert(storeTranslation)
            .values(toTranslationRows(updated.id, values.translations))
            .onConflictDoUpdate({
              set: {
                description: sql`excluded."description"`,
                tagline: sql`excluded."tagline"`,
                updatedAt: sql`excluded."updatedAt"`,
              },
              target: [storeTranslation.storeId, storeTranslation.locale],
            })
            .returning(TRANSLATION_COLUMNS)
        : [];

    return { ...updated, translations };
  });
}

/**
 * Gives the store a text in each of `translations`' languages it has none in,
 * leaving every text it has alone (the seed). The languages that got one.
 */
export async function addMissingStoreTexts(
  db: DatabaseClient,
  {
    storeId,
    translations,
  }: {
    storeId: number;
    translations: Readonly<UpdateStoreValues["translations"]>;
  }
) {
  if (translations.length === 0) {
    return [];
  }

  const added = await db
    .insert(storeTranslation)
    .values(toTranslationRows(storeId, translations))
    .onConflictDoNothing({
      target: [storeTranslation.storeId, storeTranslation.locale],
    })
    .returning({ locale: storeTranslation.locale });

  return added.map((row) => row.locale);
}
