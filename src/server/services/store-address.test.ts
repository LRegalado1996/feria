import { describe, expect, test } from "vitest";

import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { listStoreAddresses } from "./store-address";

// What it makes of real rows (a group's category, a draft, the home) is
// `store-address.integration.test.ts`'s; here, what it asks and makes of
// the answer.

const STORE_ID = 7;
const HOME_ID = 4;

function setup() {
  const db = createMockDatabase();
  db.query.store.findFirst.mockResolvedValue({
    categories: [
      { parent: null, slug: "bijouterie" },
      { parent: { slug: "bijouterie" }, slug: "anillos" },
    ],
    homePageId: HOME_ID,
    id: STORE_ID,
  });
  db.query.page.findMany.mockResolvedValue([
    { id: HOME_ID, isPublished: true, slug: "home" },
    { id: 9, isPublished: false, slug: "ofertas" },
  ]);

  return { db };
}

describe("listStoreAddresses", () => {
  test("answers each category at its page's address and each page with whether it is published and the home", async () => {
    const { db } = setup();

    await expect(listStoreAddresses(db as never)).resolves.toEqual({
      categories: [
        { path: "/bijouterie", slug: "bijouterie" },
        { path: "/bijouterie/anillos", slug: "anillos" },
      ],
      pages: [
        { isHome: true, isPublished: true, slug: "home" },
        { isHome: false, isPublished: false, slug: "ofertas" },
      ],
    });
  });

  test("reads the store's slugs and its home, then its own pages only", async () => {
    const { db } = setup();

    await listStoreAddresses(db as never);

    expect(db.query.store.findFirst).toHaveBeenCalledExactlyOnceWith({
      columns: { homePageId: true, id: true },
      with: {
        categories: {
          columns: { slug: true },
          with: { parent: { columns: { slug: true } } },
        },
      },
    });
    expect(db.query.page.findMany).toHaveBeenCalledExactlyOnceWith({
      columns: { id: true, isPublished: true, slug: true },
      where: expect.anything(),
    });
    const [query] = db.query.page.findMany.mock.calls[0] ?? [];
    expect(renderQuery((query as { where: unknown }).where)).toEqual({
      params: [STORE_ID],
      sql: '"page"."storeId" = $1',
    });
  });

  test("answers null before the store's row exists, asking nothing more", async () => {
    const db = createMockDatabase();

    await expect(listStoreAddresses(db as never)).resolves.toBeNull();
    expect(db.query.page.findMany).not.toHaveBeenCalled();
  });
});
