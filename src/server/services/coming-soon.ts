import { and, eq, notInArray, sql } from "drizzle-orm";

import type { UpdateComingSoonValues } from "@/lib/schemas/coming-soon";
import type { DatabaseClient } from "@/server/db";
import { comingSoon, comingSoonTranslation } from "@/server/db/schema";

const TRANSLATION_COLUMNS = {
  eyebrow: comingSoonTranslation.eyebrow,
  headline: comingSoonTranslation.headline,
  lead: comingSoonTranslation.lead,
  locale: comingSoonTranslation.locale,
  marquee: comingSoonTranslation.marquee,
};

/**
 * Whether a page nobody saved is published: yes. A database without the row
 * keeps the store closed (FER-034: production stays closed when this ships,
 * untouched).
 */
const UNSAVED_PUBLISHED = true;

/**
 * The coming-soon page (FER-034): whether it is published (the store closed
 * to the public), the day it counts to and its texts in every language it
 * has. Never `null`: no row reads as the page before anyone saved it,
 * published, counting to the fair and saying the dictionary's texts.
 */
export async function findComingSoon(db: DatabaseClient) {
  const found = await db.query.comingSoon.findFirst({
    columns: { countdownTo: true, published: true },
    with: {
      translations: {
        columns: {
          eyebrow: true,
          headline: true,
          lead: true,
          locale: true,
          marquee: true,
        },
      },
    },
  });
  const unsaved: NonNullable<typeof found> = {
    countdownTo: null,
    published: UNSAVED_PUBLISHED,
    translations: [],
  };

  return found ?? unsaved;
}

export type ComingSoonState = Awaited<ReturnType<typeof findComingSoon>>;

/**
 * Whether the store is closed to the public: the one column the proxy reads
 * on its way to a page. No row is closed, like {@link findComingSoon}.
 */
export async function isComingSoonPublished(
  db: DatabaseClient
): Promise<boolean> {
  const [found] = await db
    .select({ published: comingSoon.published })
    .from(comingSoon)
    .limit(1);

  return found?.published ?? UNSAVED_PUBLISHED;
}

/**
 * Replaces the page's texts and its countdown's day, never the switch: the
 * first save makes the row published, as no row already reads. A language
 * left out of `translations` loses its texts. One transaction, so a reader
 * never sees the new day with the old texts.
 */
export async function updateComingSoon(
  db: DatabaseClient,
  storeId: number,
  values: UpdateComingSoonValues
): Promise<ComingSoonState> {
  return await db.transaction(async (tx) => {
    const [page] = await tx
      .insert(comingSoon)
      .values({ countdownTo: values.countdownTo, storeId })
      .onConflictDoUpdate({
        set: {
          countdownTo: sql`excluded."countdownTo"`,
          updatedAt: sql`excluded."updatedAt"`,
        },
        target: comingSoon.storeId,
      })
      .returning({
        countdownTo: comingSoon.countdownTo,
        id: comingSoon.id,
        published: comingSoon.published,
      });

    // An upsert always answers its row; this only narrows the type.
    if (!page) {
      throw new Error("The coming-soon page's upsert answered no row");
    }

    const locales = values.translations.map(({ locale }) => locale);

    await tx
      .delete(comingSoonTranslation)
      .where(
        and(
          eq(comingSoonTranslation.comingSoonId, page.id),
          locales.length > 0
            ? notInArray(comingSoonTranslation.locale, locales)
            : undefined
        )
      );

    const translations =
      values.translations.length > 0
        ? await tx
            .insert(comingSoonTranslation)
            .values(
              values.translations.map((translation) => ({
                comingSoonId: page.id,
                eyebrow: translation.eyebrow,
                headline: translation.headline,
                lead: translation.lead,
                locale: translation.locale,
                marquee: translation.marquee,
              }))
            )
            .onConflictDoUpdate({
              set: {
                eyebrow: sql`excluded."eyebrow"`,
                headline: sql`excluded."headline"`,
                lead: sql`excluded."lead"`,
                marquee: sql`excluded."marquee"`,
                updatedAt: sql`excluded."updatedAt"`,
              },
              target: [
                comingSoonTranslation.comingSoonId,
                comingSoonTranslation.locale,
              ],
            })
            .returning(TRANSLATION_COLUMNS)
        : [];

    return {
      countdownTo: page.countdownTo,
      published: page.published,
      translations,
    };
  });
}

/**
 * Publishes the page (the store closes to the public) or takes it down (the
 * store opens), and nothing else: the texts stay as they were.
 */
export async function setComingSoonPublished(
  db: DatabaseClient,
  storeId: number,
  published: boolean
): Promise<{ published: boolean }> {
  const [page] = await db
    .insert(comingSoon)
    .values({ published, storeId })
    .onConflictDoUpdate({
      set: {
        published: sql`excluded."published"`,
        updatedAt: sql`excluded."updatedAt"`,
      },
      target: comingSoon.storeId,
    })
    .returning({ published: comingSoon.published });

  // An upsert always answers its row; this only narrows the type.
  if (!page) {
    throw new Error("The coming-soon page's upsert answered no row");
  }

  return page;
}

/**
 * Makes the page's row with the switch in `published` when the store has
 * none, and leaves an existing one alone: the seed opens a fresh local
 * store this way without undoing what someone chose. Whether it made one.
 */
export async function addComingSoonIfMissing(
  db: DatabaseClient,
  { published, storeId }: { published: boolean; storeId: number }
): Promise<boolean> {
  const created = await db
    .insert(comingSoon)
    .values({ published, storeId })
    .onConflictDoNothing({ target: comingSoon.storeId })
    .returning({ id: comingSoon.id });

  return created.length > 0;
}
