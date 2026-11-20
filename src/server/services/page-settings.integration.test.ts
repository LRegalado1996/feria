import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { CreatePageValues } from "@/lib/schemas/page";
import { type DatabaseClient, db } from "@/server/db";
import {
  category,
  page,
  pageSection,
  pageTranslation,
  store,
} from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";
import {
  backendPid,
  deferred,
  readyOrFailed,
  releaseHeldWriters,
  releaseOnTeardown,
  waitUntilAdvisoryBlocked,
} from "@/server/test/two-writers";

import { createCategory } from "./category";
import { findHomePageId } from "./page";
import {
  createPage,
  deletePage,
  findHomePage,
  findStorePage,
  listHeaderPages,
  listIndexablePages,
  listPages,
  setHomePage,
  updatePage,
} from "./page-settings";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const ROLLED_BACK = "Rolled back on purpose: this test keeps nothing";

/** A published page named after `tag`, at `/<slug>`, off the header. */
function pageValues(
  slug: string,
  overrides: Partial<CreatePageValues> = {}
): CreatePageValues {
  return {
    isPublished: true,
    nameEn: `Page ${slug}`,
    nameEs: `Página ${slug}`,
    seoDescriptionEn: null,
    seoDescriptionEs: null,
    seoTitleEn: null,
    seoTitleEs: null,
    showInHeader: false,
    slug,
    ...overrides,
  };
}

/** Runs `work` on the store in a transaction that is rolled back. */
async function rolledBack(
  work: (tx: DatabaseClient, storeId: number) => Promise<void>
) {
  const run = db.transaction(async (tx) => {
    await work(tx, await theStoreId(tx));

    throw new Error(ROLLED_BACK);
  });

  // A failed expectation inside rejects with its own message instead.
  await expect(run).rejects.toThrow(ROLLED_BACK);
}

/** What a committed test changed, undone after it. */
const committed = {
  categoryIds: [] as number[],
  homePageId: null as number | null,
  pageIds: [] as number[],
};

afterEach(async () => {
  await releaseHeldWriters();
  const storeId = await theStoreId(db);
  const home = committed.homePageId;
  committed.homePageId = null;

  if (home !== null) {
    await db
      .update(store)
      .set({ homePageId: home })
      .where(eq(store.id, storeId));
  }

  await db.delete(page).where(inArray(page.id, committed.pageIds.splice(0)));
  await db
    .delete(category)
    .where(inArray(category.id, committed.categoryIds.splice(0)));
});

describe("one address space: pages, groups and categories (FER-060)", () => {
  test("a page cannot take a category's address, nor another page's", async () => {
    await rolledBack(async (tx, storeId) => {
      const tag = uniqueTag();
      const ring = await createCategory(tx, {
        storeId,
        values: { nameEn: null, nameEs: `Anillos ${tag}` },
      });
      await createPage(tx, { storeId, values: pageValues(`regalos-${tag}`) });

      await expect(
        createPage(tx, { storeId, values: pageValues(ring.slug) })
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Another page or category already has that address",
      });
      await expect(
        createPage(tx, { storeId, values: pageValues(`regalos-${tag}`) })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  test.each(["productos", "admin", "en", "cart", "llms"])(
    "a page cannot take %s, a path the site answers itself",
    async (slug) => {
      await rolledBack(async (tx, storeId) => {
        await expect(
          createPage(tx, { storeId, values: pageValues(slug) })
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          message: "That address is one the site uses",
        });
      });
    }
  );

  test("a category named like a page takes the next free address, never the page's", async () => {
    await rolledBack(async (tx, storeId) => {
      const tag = uniqueTag();
      await createPage(tx, { storeId, values: pageValues(`navidad-${tag}`) });

      const created = await createCategory(tx, {
        storeId,
        values: { nameEn: null, nameEs: `Navidad ${tag}` },
      });

      expect(created.slug).toBe(`navidad-${tag}-2`);
    });
  });

  test("an edit keeps its own address, and cannot move onto another's", async () => {
    await rolledBack(async (tx, storeId) => {
      const tag = uniqueTag();
      const first = await createPage(tx, {
        storeId,
        values: pageValues(`uno-${tag}`),
      });
      await createPage(tx, { storeId, values: pageValues(`dos-${tag}`) });

      await expect(
        updatePage(tx, {
          storeId,
          values: { ...pageValues(`uno-${tag}`), id: first.id },
        })
      ).resolves.toEqual({
        id: first.id,
        previousSlug: `uno-${tag}`,
        slug: `uno-${tag}`,
      });
      await expect(
        updatePage(tx, {
          storeId,
          values: { ...pageValues(`dos-${tag}`), id: first.id },
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  test("the database refuses two pages of a store at one address, whatever the service", async () => {
    await rolledBack(async (tx, storeId) => {
      const tag = uniqueTag();
      await tx.insert(page).values({ slug: `doble-${tag}`, storeId });

      await expect(
        tx.insert(page).values({ slug: `doble-${tag}`, storeId })
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ code: "23505" }),
      });
    });
  });

  test("a page created while a category takes the same address waits for it, then finds it taken", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const held = deferred();
    const locked = deferred<number>();
    const first = db.transaction(async (tx) => {
      const created = await createCategory(tx, {
        storeId,
        values: { nameEn: null, nameEs: `Ofertas ${tag}` },
      });
      committed.categoryIds.push(created.id);
      locked.resolve(await backendPid(tx));
      await held.promise;

      return created;
    });
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await first
    );
    const holder = await readyOrFailed(locked.promise, first);
    const waiting = deferred<number>();
    const second = db.transaction(async (tx) => {
      waiting.resolve(await backendPid(tx));

      return await createPage(tx, {
        storeId,
        values: pageValues(`ofertas-${tag}`),
      });
    });

    try {
      await waitUntilAdvisoryBlocked(db, await waiting.promise, holder);
    } finally {
      held.resolve(undefined);
    }

    const results = await Promise.allSettled([first, second]);

    expect(results[0]?.status).toBe("fulfilled");
    expect(results[1]).toMatchObject({
      reason: expect.objectContaining({ code: "CONFLICT" }),
      status: "rejected",
    });
  });
});

describe("the home: always exactly one (FER-060)", () => {
  test("the home cannot be deleted nor unpublished; another page can", async () => {
    await rolledBack(async (tx, storeId) => {
      const homeId = await findHomePageId(tx, { storeId });
      const [home] = await tx
        .select({ slug: page.slug })
        .from(page)
        .where(eq(page.id, homeId));
      const other = await createPage(tx, {
        storeId,
        values: pageValues(`otra-${uniqueTag()}`),
      });

      await expect(
        deletePage(tx, { id: homeId, storeId })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "The home cannot be deleted: choose another home first",
      });
      await expect(
        updatePage(tx, {
          storeId,
          values: {
            ...pageValues(home?.slug ?? "", { isPublished: false }),
            id: homeId,
          },
        })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "The home cannot be unpublished: choose another home first",
      });
      await expect(
        updatePage(tx, {
          storeId,
          values: {
            ...pageValues(other.slug, { isPublished: false }),
            id: other.id,
          },
        })
      ).resolves.toMatchObject({ id: other.id });
      await expect(deletePage(tx, { id: other.id, storeId })).resolves.toEqual(
        other
      );
    });
  });

  test("the database itself refuses to delete the page that is the home", async () => {
    await rolledBack(async (tx, storeId) => {
      const homeId = await findHomePageId(tx, { storeId });

      await expect(
        tx.delete(page).where(eq(page.id, homeId))
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ code: "23503" }),
      });
    });
  });

  test("only a published page of the store can become the home; then the old home is an ordinary page", async () => {
    await rolledBack(async (tx, storeId) => {
      const previous = await findHomePageId(tx, { storeId });
      const tag = uniqueTag();
      const draft = await createPage(tx, {
        storeId,
        values: pageValues(`borrador-${tag}`, { isPublished: false }),
      });
      const chosen = await createPage(tx, {
        storeId,
        values: pageValues(`elegida-${tag}`),
      });

      await expect(
        setHomePage(tx, { pageId: draft.id, storeId })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Only a published page can be the home",
      });
      await expect(
        setHomePage(tx, { pageId: 2_147_483_000, storeId })
      ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Page not found" });
      await expect(
        setHomePage(tx, { pageId: chosen.id, storeId })
      ).resolves.toEqual({ homePageId: chosen.id, previousHomeId: previous });
      expect(await findHomePageId(tx, { storeId })).toBe(chosen.id);

      const listed = await listPages(tx, { storeId });
      expect(listed[0]).toMatchObject({ id: chosen.id, isHome: true });
      expect(listed.filter((row) => row.isHome)).toHaveLength(1);

      // The old home is now a page like any other: it can be deleted.
      await expect(
        deletePage(tx, { id: previous, storeId })
      ).resolves.toMatchObject({ id: previous });
    });
  });

  test("two admins choosing the home at once both succeed, one after the other: the last one is the home", async () => {
    const storeId = await theStoreId(db);
    committed.homePageId = await findHomePageId(db, { storeId });
    const tag = uniqueTag();
    const [a, b] = await db.transaction(async (tx) => [
      await createPage(tx, { storeId, values: pageValues(`a-${tag}`) }),
      await createPage(tx, { storeId, values: pageValues(`b-${tag}`) }),
    ]);
    committed.pageIds.push(a?.id ?? 0, b?.id ?? 0);
    const held = deferred();
    const locked = deferred<number>();
    const first = db.transaction(async (tx) => {
      const chosen = await setHomePage(tx, { pageId: a?.id ?? 0, storeId });
      locked.resolve(await backendPid(tx));
      await held.promise;

      return chosen;
    });
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await first
    );
    const holder = await readyOrFailed(locked.promise, first);
    const waiting = deferred<number>();
    const second = db.transaction(async (tx) => {
      waiting.resolve(await backendPid(tx));

      return await setHomePage(tx, { pageId: b?.id ?? 0, storeId });
    });

    try {
      await waitUntilAdvisoryBlocked(db, await waiting.promise, holder);
    } finally {
      held.resolve(undefined);
    }

    const [one, two] = await Promise.all([first, second]);

    expect(one).toEqual({
      homePageId: a?.id,
      previousHomeId: committed.homePageId,
    });
    // The second read the home the first left: no lost choice.
    expect(two).toEqual({ homePageId: b?.id, previousHomeId: a?.id });
    expect(await findHomePageId(db, { storeId })).toBe(b?.id);
  });
});

describe("a page's words and blocks", () => {
  test("an edit without an English name leaves only the Spanish words; a deletion takes its words and blocks", async () => {
    await rolledBack(async (tx, storeId) => {
      const tag = uniqueTag();
      const created = await createPage(tx, {
        storeId,
        values: pageValues(`palabras-${tag}`, {
          seoTitleEs: "Título",
        }),
      });
      const row = await createCategory(tx, {
        storeId,
        values: { nameEn: null, nameEs: `Palabras ${tag}` },
      });
      await tx.insert(pageSection).values({
        categoryId: row.id,
        kind: "category",
        pageId: created.id,
        position: 0,
        storeId,
      });

      await updatePage(tx, {
        storeId,
        values: {
          ...pageValues(created.slug, { nameEn: null, seoTitleEs: null }),
          id: created.id,
        },
      });

      expect(
        await tx
          .select({
            locale: pageTranslation.locale,
            seoTitle: pageTranslation.seoTitle,
          })
          .from(pageTranslation)
          .where(eq(pageTranslation.pageId, created.id))
      ).toEqual([{ locale: "es", seoTitle: null }]);

      expect(
        await tx
          .select({ categoryId: pageSection.categoryId })
          .from(pageSection)
          .where(eq(pageSection.pageId, created.id))
      ).toEqual([{ categoryId: row.id }]);

      await deletePage(tx, { id: created.id, storeId });

      expect(
        await tx
          .select({ id: pageTranslation.id })
          .from(pageTranslation)
          .where(eq(pageTranslation.pageId, created.id))
      ).toEqual([]);
      expect(
        await tx
          .select({ id: pageSection.id })
          .from(pageSection)
          .where(eq(pageSection.pageId, created.id))
      ).toEqual([]);
    });
  });
});

describe("what the storefront reads", () => {
  test("by address, in the language asked or the Spanish; drafts are found and marked, the home says it is", async () => {
    await rolledBack(async (tx, storeId) => {
      const tag = uniqueTag();
      await createPage(tx, {
        storeId,
        values: pageValues(`solo-${tag}`, {
          isPublished: false,
          nameEn: null,
          nameEs: "Solo español",
        }),
      });
      const homeId = await findHomePageId(tx, { storeId });
      const [home] = await tx
        .select({ slug: page.slug })
        .from(page)
        .where(eq(page.id, homeId));

      await expect(
        findStorePage(tx, { locale: "en", slug: `solo-${tag}`, storeId })
      ).resolves.toMatchObject({
        isHome: false,
        isPublished: false,
        lang: "es",
        name: "Solo español",
      });
      await expect(
        findStorePage(tx, { locale: "es", slug: home?.slug ?? "", storeId })
      ).resolves.toMatchObject({ id: homeId, isHome: true });
      await expect(
        findStorePage(tx, { locale: "es", slug: `nada-${tag}`, storeId })
      ).resolves.toBeNull();
    });
  });

  test("the header and search engines list the published pages but the home; the header only those it shows", async () => {
    await rolledBack(async (tx, storeId) => {
      const tag = uniqueTag();
      const shown = await createPage(tx, {
        storeId,
        values: pageValues(`arriba-${tag}`, { showInHeader: true }),
      });
      await createPage(tx, { storeId, values: pageValues(`abajo-${tag}`) });
      await createPage(tx, {
        storeId,
        values: pageValues(`borrador-${tag}`, {
          isPublished: false,
          showInHeader: true,
        }),
      });
      // A home of the test's own, marked for the header before it was one.
      const home = await createPage(tx, {
        storeId,
        values: pageValues(`casa-${tag}`, { showInHeader: true }),
      });
      await setHomePage(tx, { pageId: home.id, storeId });

      const header = await listHeaderPages(tx, { locale: "en", storeId });
      const indexed = await listIndexablePages(tx, { locale: "es", storeId });
      // Only this test's pages: the store's others are not its to assert.
      const own = (path: string) => path.endsWith(`-${tag}`);

      expect(header.filter((entry) => own(entry.path))).toEqual([
        {
          id: shown.id,
          lang: "en",
          name: `Page arriba-${tag}`,
          path: `/arriba-${tag}`,
          slug: `arriba-${tag}`,
        },
      ]);
      expect(indexed.map((entry) => entry.path).filter(own)).toEqual([
        `/arriba-${tag}`,
        `/abajo-${tag}`,
      ]);
      // The home itself is read in the statement that finds it.
      await expect(
        findHomePage(tx, { locale: "es", storeId })
      ).resolves.toMatchObject({
        id: home.id,
        isHome: true,
        slug: `casa-${tag}`,
      });
    });
  });
});
