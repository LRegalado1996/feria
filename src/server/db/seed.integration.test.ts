import { and, asc, desc, eq, ne } from "drizzle-orm";
import { expect, test, vi } from "vitest";

import { auth } from "@/server/better-auth/config";
import { type DatabaseClient, db } from "@/server/db";
import {
  announcement,
  announcementTranslation,
  attribute,
  banner,
  bannerTranslation,
  category,
  comingSoon,
  featuredProduct,
  page,
  pageCoverBanner,
  pageSection,
  pageTranslation,
  product,
  productTranslation,
  rankingEntry,
  spotlight,
  spotlightTranslation,
  store,
  storeTranslation,
  user,
} from "@/server/db/schema";
import { isComingSoonPublished } from "@/server/services/coming-soon";
import { findHomePageId } from "@/server/services/page";
import { theStoreId } from "@/server/test/one-store";

import { SEED_USER, seed } from "./seed";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const ROLLED_BACK = "Rolled back on purpose: this test keeps nothing";

/** The seed run as `pnpm db:seed` runs it, on `tx`, against a local database. */
async function runSeed(tx: DatabaseClient) {
  return await seed({
    auth,
    databaseUrl: process.env.DATABASE_URL,
    db: tx,
    nodeEnv: "test",
  });
}

/**
 * The store as a fresh database has it: no texts, no catalog, no home
 * curation (FER-020) and no coming-soon page (so closed, FER-034).
 * Articles first, since a category that still has one cannot be deleted;
 * they take the curated rows with them, and the banners their places in a
 * page's cover. The home page's sequence goes whole, its curated places
 * included: the seed keeps one it finds there.
 */
async function emptyStore(tx: DatabaseClient, storeId: number) {
  await tx.delete(announcement).where(eq(announcement.storeId, storeId));
  // Only the home page's sequence: the seed reads no other page's.
  const [own] = await tx
    .select({ homePageId: store.homePageId })
    .from(store)
    .where(eq(store.id, storeId));
  await tx
    .delete(pageSection)
    .where(eq(pageSection.pageId, own?.homePageId ?? 0));
  await tx.delete(banner).where(eq(banner.storeId, storeId));
  await tx.delete(comingSoon).where(eq(comingSoon.storeId, storeId));
  await tx.delete(product).where(eq(product.storeId, storeId));
  await tx.delete(attribute).where(eq(attribute.storeId, storeId));
  await tx.delete(category).where(eq(category.storeId, storeId));
  // Every page but the home, which the store points at (FER-060).
  await tx
    .delete(page)
    .where(
      and(
        eq(page.storeId, storeId),
        ne(page.id, await findHomePageId(tx, { storeId }))
      )
    );
  await tx
    .delete(storeTranslation)
    .where(eq(storeTranslation.storeId, storeId));
}

// Runs the seed against the migrated schema, so a constraint or column the
// seed no longer satisfies fails here instead of in the next fresh worktree.
// Inside a transaction that is rolled back: the test needs a database without
// the seed's rows, and the clone's own are put back untouched.
test("leaves one login with its credential, and a second run creates nothing", async () => {
  const run = db.transaction(async (tx) => {
    await tx.delete(user).where(eq(user.email, SEED_USER.email));
    await emptyStore(tx, await theStoreId(tx));

    const first = await runSeed(tx);
    const second = await runSeed(tx);

    expect(first.createdAccounts).toEqual([SEED_USER.email]);
    expect(first.openedStore).toBe(true);
    expect(first.examplePage).toBe(true);
    expect(second).toEqual({
      catalogPages: { covers: 0, grouped: 0, groups: 0 },
      createdAccounts: [],
      createdArticles: 0,
      createdStoreTexts: [],
      examplePage: false,
      home: {
        announcement: false,
        banners: 0,
        featured: 0,
        ranking: 0,
        spotlight: false,
      },
      openedStore: false,
    });
    // A seeded database shows the store: the coming-soon page is unpublished.
    await expect(isComingSoonPublished(tx)).resolves.toBe(false);
    expect(
      await tx.query.user.findMany({
        columns: { email: true },
        where: eq(user.email, SEED_USER.email),
        with: { accounts: { columns: { providerId: true } } },
      })
    ).toEqual([
      { accounts: [{ providerId: "credential" }], email: SEED_USER.email },
    ]);

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation above rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
});

test("gives the one store its texts in both languages and its sample catalog, once, and leaves its name alone", async () => {
  const run = db.transaction(async (tx) => {
    const storeId = await theStoreId(tx);
    const [before] = await tx
      .select({ name: store.name })
      .from(store)
      .where(eq(store.id, storeId));
    await emptyStore(tx, storeId);

    const first = await runSeed(tx);
    const second = await runSeed(tx);

    expect([first.createdStoreTexts, second.createdStoreTexts]).toEqual([
      ["es", "en"],
      [],
    ]);
    expect([first.createdArticles, second.createdArticles]).toEqual([49, 0]);
    const seeded = await tx.query.store.findFirst({
      columns: { name: true },
      where: eq(store.id, storeId),
      with: {
        categories: {
          columns: { slug: true },
          orderBy: category.position,
          with: { parent: { columns: { slug: true } } },
        },
        products: {
          columns: { position: true, slug: true, status: true },
          orderBy: product.position,
          with: { images: { columns: { id: true } } },
        },
        translations: {
          columns: { locale: true },
          orderBy: storeTranslation.locale,
        },
      },
    });
    expect(seeded?.name).toBe(before?.name);
    // The bubble guns first, in no group; then Bijouterie, holding four
    // (FER-043), so the header reads them in Lucas's order (FER-044).
    expect(
      seeded?.categories.map(({ parent, slug }) => [slug, parent?.slug ?? null])
    ).toEqual([
      ["burbujeros", null],
      ["bijouterie", null],
      ["cadenas", "bijouterie"],
      ["anillos", "bijouterie"],
      ["aros", "bijouterie"],
      ["pulseras", "bijouterie"],
    ]);
    const products = seeded?.products ?? [];
    expect(products.map(({ status }) => status)).toEqual(
      Array.from({ length: 49 }, () => "published")
    );
    // Numbered in the order they were made, which mixes the categories.
    expect(products.slice(0, 5).map(({ slug }) => slug)).toEqual([
      "burbujero-cristal",
      "cadena-corazones",
      "anillo-solitario",
      "aros-abotonados",
      "par-de-esclavas",
    ]);
    expect(
      products
        .filter(({ images }) => images.length >= 4)
        .map(({ slug }) => slug)
    ).toEqual([
      "cadena-corazones",
      "par-de-esclavas",
      "burbujero-pez",
      "anillo-halo",
      "aros-argolla-gruesa",
      "pulsera-eslabones",
      "cadena-con-chapita",
    ]);
    expect(seeded?.translations.map(({ locale }) => locale)).toEqual([
      "es",
      "en",
    ]);
    // Still one store: the seed adds to it, never beside it.
    expect(await tx.select({ id: store.id }).from(store)).toEqual([
      { id: storeId },
    ]);

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation above rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
});

// A database seeded before FER-043 has its five categories in no group and
// no covers: the next seed gives it the group, last (FER-044), and the
// covers, and keeps every article where it was.
test("gives a catalog seeded before groups its Bijouterie, last, and its covers", async () => {
  const run = db.transaction(async (tx) => {
    const storeId = await theStoreId(tx);
    await emptyStore(tx, storeId);
    await runSeed(tx);
    // Back to how the earlier seed left it.
    await tx
      .update(category)
      .set({
        coverHeight: null,
        coverPhoneHeight: null,
        coverPhoneUrl: null,
        coverPhoneWidth: null,
        coverUrl: null,
        coverWidth: null,
        parentId: null,
      })
      .where(eq(category.storeId, storeId));
    await tx
      .delete(category)
      .where(
        and(eq(category.storeId, storeId), eq(category.slug, "bijouterie"))
      );
    // The earlier seed's order: the four jewelry categories, then the
    // bubble guns.
    for (const [position, slug] of [
      "cadenas",
      "anillos",
      "aros",
      "pulseras",
      "burbujeros",
    ].entries()) {
      await tx
        .update(category)
        .set({ position })
        .where(and(eq(category.storeId, storeId), eq(category.slug, slug)));
    }
    await tx
      .update(store)
      .set({
        catalogCoverHeight: null,
        catalogCoverUrl: null,
        catalogCoverWidth: null,
        catalogCoverPhoneHeight: null,
        catalogCoverPhoneUrl: null,
        catalogCoverPhoneWidth: null,
      })
      .where(eq(store.id, storeId));

    const upgraded = await runSeed(tx);

    expect(upgraded.catalogPages).toEqual({ covers: 7, grouped: 4, groups: 1 });
    const categories = await tx.query.category.findMany({
      columns: { coverUrl: true, position: true, slug: true },
      orderBy: category.position,
      where: eq(category.storeId, storeId),
      with: { parent: { columns: { slug: true } } },
    });
    expect(
      categories.map(({ coverUrl, parent, slug }) => [
        slug,
        parent?.slug ?? null,
        coverUrl,
      ])
    ).toEqual([
      ["cadenas", "bijouterie", "/seed/necklace-1.jpg"],
      ["anillos", "bijouterie", "/seed/ring-2.jpg"],
      ["aros", "bijouterie", "/seed/earrings-2.jpg"],
      ["pulseras", "bijouterie", "/seed/bracelet-2.jpg"],
      ["burbujeros", null, "/seed/bubble-gun-1.jpg"],
      ["bijouterie", null, "/seed/necklace-2.jpg"],
    ]);
    // The group takes the place after the last; no other category moves,
    // so the header reads the bubble guns, then Bijouterie.
    expect(categories.map(({ position }) => position)).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    const [cover] = await tx
      .select({ url: store.catalogCoverUrl })
      .from(store)
      .where(eq(store.id, storeId));
    expect(cover?.url).toBe("/seed/ring-3.jpg");

    throw new Error(ROLLED_BACK);
  });

  await expect(run).rejects.toThrow(ROLLED_BACK);
});

/** The Spanish titles of the articles of a curated row, in its order. */
async function curatedTitles(
  tx: DatabaseClient,
  table: typeof rankingEntry | typeof featuredProduct,
  storeId: number
) {
  const rows = await tx
    .select({ title: productTranslation.title })
    .from(table)
    .innerJoin(
      productTranslation,
      and(
        eq(productTranslation.productId, table.productId),
        eq(productTranslation.locale, "es")
      )
    )
    .where(eq(table.storeId, storeId))
    .orderBy(asc(table.position));

  return rows.map((row) => row.title);
}

// The home's demo content (FER-020, FER-031's): the announcement, three
// cover banners and two between rows, the order of the rows, the best
// sellers and the featured articles. A second run adding none of it is the
// first test's (`home` in its second result).
test("gives the home its announcement, banners, rows, best sellers and featured articles", async () => {
  const run = db.transaction(async (tx) => {
    const storeId = await theStoreId(tx);
    await emptyStore(tx, storeId);

    const first = await runSeed(tx);

    expect(first.home).toEqual({
      announcement: true,
      banners: 5,
      featured: 4,
      ranking: 8,
      spotlight: true,
    });
    expect(
      await tx.query.announcement.findFirst({
        columns: {
          endsOn: true,
          isActive: true,
          linkUrl: true,
          startsOn: true,
        },
        where: eq(announcement.storeId, storeId),
        with: {
          translations: {
            columns: { locale: true, shortText: true, text: true },
            orderBy: desc(announcementTranslation.locale),
          },
        },
      })
    ).toEqual({
      endsOn: null,
      isActive: true,
      linkUrl: null,
      startsOn: null,
      // The enum's order (es, en) reversed.
      translations: [
        {
          locale: "en",
          shortText: "At the fair · Dec 5 to Jan 5",
          text: "Find us at the fair, from December 5 to January 5",
        },
        {
          locale: "es",
          shortText: "En la feria · 5/12 al 5/1",
          text: "Encontranos en la feria, del 5/12 al 5/1",
        },
      ],
    });
    const banners = await tx.query.banner.findMany({
      columns: {
        id: true,
        imagePhoneUrl: true,
        imageUrl: true,
        linkUrl: true,
      },
      orderBy: [asc(banner.id)],
      where: eq(banner.storeId, storeId),
      with: {
        linkCategory: { columns: { slug: true } },
        translations: {
          columns: { title: true },
          where: eq(bannerTranslation.locale, "es"),
        },
      },
    });
    expect(
      banners.map((row) => [
        row.translations[0]?.title,
        row.imageUrl,
        row.imagePhoneUrl,
        row.linkCategory?.slug ?? row.linkUrl,
      ])
    ).toEqual([
      [
        "Burbujeros para toda la familia",
        "/seed/bubble-gun-2.jpg",
        "/seed/bubble-gun-2-phone.jpg",
        "burbujeros",
      ],
      [
        "Joyas para regalar en las fiestas",
        "/seed/ring-3.jpg",
        "/seed/ring-3-phone.jpg",
        "bijouterie",
      ],
      [
        "Cadenas que brillan",
        "/seed/necklace-4.jpg",
        "/seed/necklace-4-phone.jpg",
        "cadenas",
      ],
      [
        "Encontranos en la feria",
        "/seed/bubbles-1.jpg",
        "/seed/bubbles-1-phone.jpg",
        "/productos",
      ],
      ["Aros para todos los días", "/seed/earrings-4.jpg", null, "aros"],
      // The example page's cover (FER-060), seeded after the home.
      [
        "Regalos para las fiestas",
        "/seed/ring-3.jpg",
        "/seed/ring-3-phone.jpg",
        "/productos",
      ],
    ]);
    const titleOf = new Map(
      banners.map((row) => [row.id, row.translations[0]?.title ?? ""])
    );
    // Placed on the store's home page (FER-058): three in its cover, in
    // order, two between its rows.
    const [{ homePageId } = { homePageId: 0 }] = await tx
      .select({ homePageId: store.homePageId })
      .from(store)
      .where(eq(store.id, storeId));
    const cover = await tx.query.pageCoverBanner.findMany({
      columns: { bannerId: true },
      orderBy: asc(pageCoverBanner.position),
      where: eq(pageCoverBanner.pageId, homePageId),
    });
    expect(cover.map((row) => titleOf.get(row.bannerId))).toEqual([
      "Burbujeros para toda la familia",
      "Joyas para regalar en las fiestas",
      "Cadenas que brillan",
    ]);
    const sections = await tx.query.pageSection.findMany({
      columns: { bannerId: true, kind: true },
      orderBy: asc(pageSection.position),
      where: eq(pageSection.pageId, homePageId),
      with: { category: { columns: { slug: true } } },
    });
    expect(
      sections.map((row) =>
        row.bannerId === null
          ? (row.category?.slug ?? row.kind)
          : `banner:${titleOf.get(row.bannerId) ?? ""}`
      )
    ).toEqual([
      // "How to buy" right under the cover (FER-076).
      "how_to_buy",
      "best_sellers",
      "banner:Encontranos en la feria",
      "burbujeros",
      // The article spotlight after its category's row (FER-059), never
      // against "how to buy", the other dark block.
      "spotlight",
      "featured",
      "cadenas",
      "anillos",
      "banner:Aros para todos los días",
      "aros",
      "pulseras",
      "bijouterie",
    ]);
    // The home's: the example page has its own (FER-060).
    const [homeSpotlight] = await tx
      .select({ id: pageSection.spotlightId })
      .from(pageSection)
      .where(
        and(
          eq(pageSection.pageId, homePageId),
          eq(pageSection.kind, "spotlight")
        )
      );
    expect(
      await tx.query.spotlight.findMany({
        columns: {},
        where: eq(spotlight.id, homeSpotlight?.id ?? 0),
        with: {
          product: {
            columns: {},
            with: {
              translations: {
                columns: { title: true },
                where: eq(productTranslation.locale, "es"),
              },
            },
          },
          translations: {
            columns: { label: true, locale: true, phrase: true },
            orderBy: asc(spotlightTranslation.locale),
          },
        },
      })
    ).toEqual([
      {
        product: { translations: [{ title: "Burbujero pez" }] },
        translations: [
          {
            label: "Nuevo",
            locale: "es",
            phrase:
              "Tira burbujas sin parar. El que más piden los chicos en la feria.",
          },
          {
            label: "New",
            locale: "en",
            phrase:
              "Blows bubbles nonstop. The one kids ask for most at the fair.",
          },
        ],
      },
    ]);
    expect(await curatedTitles(tx, rankingEntry, storeId)).toEqual([
      "Burbujero pez",
      "Cadena corazones",
      "Anillo flor rosa",
      "Aros argolla gruesa",
      "Burbujero cristal",
      "Pulsera chapita",
      "Cadena corona",
      "Aros mariposa",
    ]);
    expect(await curatedTitles(tx, featuredProduct, storeId)).toEqual([
      "Par de esclavas",
      "Anillo sello",
      "Burbujero rosa",
      "Aros perla",
    ]);

    throw new Error(ROLLED_BACK);
  });

  await expect(run).rejects.toThrow(ROLLED_BACK);
});

test("adds the example page at /regalos: published, off the header, its cover, its spotlight and two rows (FER-060)", async () => {
  const run = db.transaction(async (tx) => {
    const storeId = await theStoreId(tx);
    await emptyStore(tx, storeId);

    await runSeed(tx);

    const found = await tx.query.page.findFirst({
      columns: { isPublished: true, showInHeader: true },
      where: and(eq(page.storeId, storeId), eq(page.slug, "regalos")),
      with: {
        cover: {
          columns: {},
          with: {
            banner: {
              columns: { imageUrl: true, linkUrl: true },
              with: {
                translations: {
                  columns: { locale: true, title: true },
                  orderBy: asc(bannerTranslation.locale),
                },
              },
            },
          },
        },
        sections: {
          columns: { kind: true },
          orderBy: asc(pageSection.position),
          with: {
            category: { columns: { slug: true } },
            spotlight: {
              columns: {},
              with: {
                product: {
                  columns: {},
                  with: {
                    translations: {
                      columns: { title: true },
                      where: eq(productTranslation.locale, "es"),
                    },
                  },
                },
              },
            },
          },
        },
        translations: {
          columns: { locale: true, name: true },
          orderBy: asc(pageTranslation.locale),
        },
      },
    });

    expect(found).toEqual({
      cover: [
        {
          banner: {
            imageUrl: "/seed/ring-3.jpg",
            linkUrl: "/productos",
            // The enum's order: es, then en.
            translations: [
              { locale: "es", title: "Regalos para las fiestas" },
              { locale: "en", title: "Gifts for the holidays" },
            ],
          },
        },
      ],
      isPublished: true,
      sections: [
        {
          category: null,
          kind: "spotlight",
          spotlight: {
            product: { translations: [{ title: "Cadena corazones" }] },
          },
        },
        { category: { slug: "anillos" }, kind: "category", spotlight: null },
        { category: { slug: "aros" }, kind: "category", spotlight: null },
      ],
      showInHeader: false,
      translations: [
        { locale: "es", name: "Regalos de Navidad" },
        { locale: "en", name: "Christmas gifts" },
      ],
    });

    throw new Error(ROLLED_BACK);
  });

  await expect(run).rejects.toThrow(ROLLED_BACK);
});

test("places the banners it adds between rows, then its spotlight, after an order the home page already has", async () => {
  const run = db.transaction(async (tx) => {
    const storeId = await theStoreId(tx);
    await emptyStore(tx, storeId);
    const [{ homePageId } = { homePageId: 0 }] = await tx
      .select({ homePageId: store.homePageId })
      .from(store)
      .where(eq(store.id, storeId));
    // An order saved with no banner: the curated rows, featured first.
    await tx.insert(pageSection).values([
      { kind: "featured", pageId: homePageId, position: 0, storeId },
      { kind: "best_sellers", pageId: homePageId, position: 4, storeId },
    ]);

    expect((await runSeed(tx)).home.banners).toBe(5);
    const sections = await tx.query.pageSection.findMany({
      columns: { kind: true, position: true },
      orderBy: asc(pageSection.position),
      where: eq(pageSection.pageId, homePageId),
      with: {
        category: { columns: { slug: true } },
        banner: {
          columns: {},
          with: {
            translations: {
              columns: { title: true },
              where: eq(bannerTranslation.locale, "es"),
            },
          },
        },
      },
    });
    expect(
      sections.map((row) => [
        row.position,
        row.banner?.translations[0]?.title ?? row.category?.slug ?? row.kind,
      ])
    ).toEqual([
      [0, "featured"],
      [1, "best_sellers"],
      [2, "Encontranos en la feria"],
      [3, "Aros para todos los días"],
      // The categories the order never placed, in their own order, then the
      // spotlight, placed through the service as the admin adds one: the
      // sequence is written whole and numbered again (FER-059).
      [4, "burbujeros"],
      [5, "bijouterie"],
      [6, "cadenas"],
      [7, "anillos"],
      [8, "aros"],
      [9, "pulseras"],
      [10, "spotlight"],
    ]);

    throw new Error(ROLLED_BACK);
  });

  await expect(run).rejects.toThrow(ROLLED_BACK);
});
