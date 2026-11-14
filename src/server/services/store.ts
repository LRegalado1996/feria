import { ORPCError } from "@orpc/server";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { isUniqueViolation } from "@/lib/errors/postgres";
import type {
  CreateStoreValues,
  GetStoreBySlugValues,
  UpdateStoreValues,
} from "@/lib/schemas/store";
import type { DatabaseClient } from "@/server/db";
import { store, storeTranslation } from "@/server/db/schema";

// The name Postgres gives `store.slug`'s unique constraint (see the migration).
const SLUG_UNIQUE_CONSTRAINT = "store_slug_unique";

const TRANSLATION_COLUMNS = {
  description: storeTranslation.description,
  locale: storeTranslation.locale,
  tagline: storeTranslation.tagline,
};

/**
 * The columns of a store, named one by one: a write never spreads its input
 * into the row, so a key the schema did not list cannot reach the table.
 */
function toStoreRow(values: CreateStoreValues) {
  return {
    colorAccent: values.colorAccent,
    colorBackground: values.colorBackground,
    colorContrast: values.colorContrast,
    colorForeground: values.colorForeground,
    colorSurface: values.colorSurface,
    currencyCode: values.currencyCode,
    instagramUrl: values.instagramUrl,
    isActive: values.isActive,
    logoUrl: values.logoUrl,
    name: values.name,
    slug: values.slug,
    tiktokUrl: values.tiktokUrl,
    whatsappNumber: values.whatsappNumber,
  };
}

/** A store's texts as rows of `store_translation`, column by column too. */
function toTranslationRows(
  storeId: number,
  translations: CreateStoreValues["translations"]
) {
  return translations.map((translation) => ({
    description: translation.description,
    locale: translation.locale,
    storeId,
    tagline: translation.tagline,
  }));
}

/**
 * A slug another store holds is the one conflict a person can fix by typing
 * something else, so it gets its own message; anything else propagates.
 */
async function refusingATakenSlug<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error, SLUG_UNIQUE_CONSTRAINT)) {
      throw new ORPCError("CONFLICT", {
        message: "Another store already uses that address. Choose another one",
      });
    }

    throw error;
  }
}

/**
 * The store the public pages of `slug` belong to, with its texts in every
 * language it has, or `null`. An inactive store is `null` too: to a visitor
 * it does not exist.
 */
export async function findActiveStoreBySlug(db: DatabaseClient, slug: string) {
  const found = await db.query.store.findFirst({
    columns: {
      colorAccent: true,
      colorBackground: true,
      colorContrast: true,
      colorForeground: true,
      colorSurface: true,
      currencyCode: true,
      id: true,
      instagramUrl: true,
      logoUrl: true,
      name: true,
      slug: true,
      tiktokUrl: true,
      whatsappNumber: true,
    },
    where: and(eq(store.slug, slug), eq(store.isActive, true)),
    with: {
      translations: {
        columns: { description: true, locale: true, tagline: true },
      },
    },
  });

  return found ?? null;
}

export type PublicStore = NonNullable<
  Awaited<ReturnType<typeof findActiveStoreBySlug>>
>;

/** {@link findActiveStoreBySlug}, answering NOT_FOUND instead of `null`. */
export async function getActiveStoreBySlug(
  db: DatabaseClient,
  { slug }: GetStoreBySlugValues
) {
  const found = await findActiveStoreBySlug(db, slug);

  if (!found) {
    throw new ORPCError("NOT_FOUND", { message: "Store not found" });
  }

  return found;
}

/** The slugs among `slugs` that a store, active or not, already holds. */
export async function listTakenStoreSlugs(
  db: DatabaseClient,
  slugs: readonly string[]
) {
  const rows = await db.query.store.findMany({
    columns: { slug: true },
    where: inArray(store.slug, [...slugs]),
  });

  return rows.map((row) => row.slug);
}

/** Stores the store and its texts together, or neither. */
export async function createStore(
  db: DatabaseClient,
  values: CreateStoreValues
) {
  return await refusingATakenSlug(
    async () =>
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(store)
          .values(toStoreRow(values))
          .returning();

        if (!created) {
          throw new Error("Inserting a store returned no row");
        }

        const translations =
          values.translations.length > 0
            ? await tx
                .insert(storeTranslation)
                .values(toTranslationRows(created.id, values.translations))
                .returning(TRANSLATION_COLUMNS)
            : [];

        return { ...created, translations };
      })
  );
}

/**
 * Replaces everything a person can set on store `id`, texts included: a
 * language left out of `translations` loses its text. One transaction, so a
 * reader never sees the new colors with the old texts.
 */
export async function updateStore(
  db: DatabaseClient,
  values: UpdateStoreValues
) {
  return await refusingATakenSlug(
    async () =>
      await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(store)
          .set(toStoreRow(values))
          .where(eq(store.id, values.id))
          .returning();

        if (!updated) {
          throw new ORPCError("NOT_FOUND", { message: "Store not found" });
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
      })
  );
}
