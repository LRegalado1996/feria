import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { productRouter } from "./product";

// The router is input → the admin's login and store → service, inside the
// login's re-check. The queries are `src/server/services/catalog.test.ts`'s
// and the access rules `src/server/services/access.test.ts`'s.

// The handle `withAdmin` hands its write: distinct from the client, so a
// mutation that wrote through the outer client instead would be caught.
const { TX } = vi.hoisted(() => ({
  TX: { handle: "the write's transaction" },
}));

const BLOB_STORE = {
  host: "store9.public.blob.vercel-storage.com",
  namespace: "qa",
  token: "vercel_blob_rw_store9_secret",
};

const services = vi.hoisted(() => ({
  createProduct: vi.fn(async () => ({
    id: 11,
    publishGaps: ["category"],
    slug: "articulo",
    status: "draft",
    updatedAt: new Date("2026-11-17T10:00:00.000Z"),
  })),
  deleteProduct: vi.fn(async () => ({
    id: 12,
    imageUrls: ["https://store9.public.blob.vercel-storage.com/a.webp"],
  })),
  discardBlobs: vi.fn<(db: unknown, urls: readonly string[]) => void>(),
  findAdminStore: vi.fn(),
  getStoreProduct: vi.fn(async () => ({ id: 5, slug: "cadena" })),
  invalidateCatalogCache: vi.fn<(storeId: number) => void>(),
  listStoreProducts: vi.fn(async () => ({
    currencyCode: "UYU",
    items: [{ id: 5 }],
    nextCursor: null,
  })),
  publishProduct: vi.fn(async () => ({
    id: 13,
    slug: "cadena",
    status: "published",
  })),
  readBlobStore: vi.fn(),
  setProductAvailability: vi.fn(async () => ({ id: 15, isAvailable: false })),
  unpublishProduct: vi.fn(async () => ({
    id: 16,
    slug: "cadena",
    status: "draft",
  })),
  updateProduct: vi.fn(),
  withAdmin: vi.fn(
    async (
      _db: unknown,
      _userId: unknown,
      write: (handle: unknown) => Promise<unknown>
    ) => await write(TX)
  ),
}));

vi.mock("@/server/services/product", () => ({
  createProduct: services.createProduct,
  deleteProduct: services.deleteProduct,
  getStoreProduct: services.getStoreProduct,
  listStoreProducts: services.listStoreProducts,
  publishProduct: services.publishProduct,
  setProductAvailability: services.setProductAvailability,
  unpublishProduct: services.unpublishProduct,
  updateProduct: services.updateProduct,
}));

// The files' deletion after the response, and reading the Blob store, are
// `blob-store.test.ts`'s.
vi.mock("@/server/api/utils/blob-store", () => ({
  discardBlobs: services.discardBlobs,
  readBlobStore: services.readBlobStore,
}));

vi.mock("@/server/services/access", () => ({
  findAdminStore: services.findAdminStore,
  withAdmin: services.withAdmin,
}));

// Next's cache only exists inside a Next render: the catalog's invalidation is
// spied on, its cached reads are `src/server/cache/catalog.test.ts`'s.
vi.mock("@/server/cache/catalog", () => ({
  invalidateCatalogCache: services.invalidateCatalogCache,
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn(async () => null) } },
}));

const STORE = { id: 7 };

/** A photo the saved article no longer shows. */
const DROPPED_PHOTO =
  "https://store9.public.blob.vercel-storage.com/qa/product/b.webp";

const UNAUTHORIZED = { code: "UNAUTHORIZED", message: "Unauthorized" };

function makeFields(overrides: Record<string, unknown> = {}) {
  return {
    attributeValueIds: [21, 22],
    categoryId: 3,
    images: [
      {
        height: 1600,
        url: "https://store9.public.blob.vercel-storage.com/qa/product/a.webp",
        width: 1200,
      },
    ],
    isAvailable: true,
    priceAmount: 129_000,
    translations: [
      {
        description: "",
        locale: "es",
        seoDescription: null,
        seoTitle: null,
        title: "Cadena",
      },
    ],
    ...overrides,
  };
}

/** What `updateProduct` answers for an article that is now `status`. */
function makeSaved(
  status: "draft" | "published",
  discardedImageUrls: string[] = []
) {
  return {
    discardedImageUrls,
    id: 17,
    publishGaps: [],
    slug: "cadena",
    status,
    updatedAt: new Date("2026-11-17T10:00:00.000Z"),
  };
}

/**
 * A signed-in admin working on the store (or a login the database no longer
 * has, or nobody), on a deployment with a Blob store, whose save of an
 * article leaves it `saved` (a draft unless told).
 */
function setup({
  isLogin = true,
  saved = "draft",
  signedIn = true,
}: {
  isLogin?: boolean;
  saved?: "draft" | "published";
  signedIn?: boolean;
} = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  services.findAdminStore.mockResolvedValue(isLogin ? STORE : null);
  services.readBlobStore.mockReturnValue(BLOB_STORE);
  services.updateProduct.mockResolvedValue(makeSaved(saved));
  const options = { context: mockCtx as never };
  const procedures = {
    create: async (input: unknown) =>
      await call(productRouter.create, input as never, options),
    delete: async (input: unknown) =>
      await call(productRouter.delete, input as never, options),
    get: async (input: unknown) =>
      await call(productRouter.get, input as never, options),
    list: async (input: unknown) =>
      await call(productRouter.list, input as never, options),
    publish: async (input: unknown) =>
      await call(productRouter.publish, input as never, options),
    setAvailability: async (input: unknown) =>
      await call(productRouter.setAvailability, input as never, options),
    unpublish: async (input: unknown) =>
      await call(productRouter.unpublish, input as never, options),
    update: async (input: unknown) =>
      await call(productRouter.update, input as never, options),
  };
  const run = async (name: keyof typeof procedures, input: unknown) =>
    await procedures[name](input);

  return { db: mockCtx.db, holdTransaction, run };
}

/**
 * Keeps the next write's transaction open once its work returned, until the
 * test commits it or makes the commit fail: whatever runs in between runs
 * before the commit.
 */
function holdTransaction() {
  let markWorked: () => void = () => undefined;
  const worked = new Promise<void>((resolve) => {
    markWorked = resolve;
  });
  let settle: { fail: (error: Error) => void; pass: () => void } = {
    fail: () => undefined,
    pass: () => undefined,
  };
  const commit = new Promise<void>((resolve, reject) => {
    settle = { fail: (error) => reject(error), pass: () => resolve() };
  });
  services.withAdmin.mockImplementationOnce(async (_db, _userId, write) => {
    const result = await write(TX);
    markWorked();
    await commit;

    return result;
  });

  return {
    commit: () => settle.pass(),
    failCommit: (error: Error) => settle.fail(error),
    worked,
  };
}

const USER_ID = "test-user-id";

describe("product router", () => {
  test("creates the draft in the store with the deployment's Blob store, inside the access check", async () => {
    const { db, run } = setup();

    await expect(run("create", makeFields())).resolves.toEqual({
      id: 11,
      publishGaps: ["category"],
      slug: "articulo",
      status: "draft",
      updatedAt: new Date("2026-11-17T10:00:00.000Z"),
    });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.createProduct).toHaveBeenCalledExactlyOnceWith(TX, {
      blobStore: BLOB_STORE,
      storeId: 7,
      values: makeFields(),
    });
    // A new article is a draft: no shopper's page shows it yet.
    expect(services.invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test("saves the whole article by id within the store, answering without the dropped addresses", async () => {
    const { db, run } = setup();
    services.updateProduct.mockResolvedValueOnce(
      makeSaved("draft", [DROPPED_PHOTO])
    );

    await expect(run("update", { ...makeFields(), id: "5" })).resolves.toEqual({
      id: 17,
      publishGaps: [],
      slug: "cadena",
      status: "draft",
      updatedAt: new Date("2026-11-17T10:00:00.000Z"),
    });

    expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
      db,
      USER_ID,
      expect.any(Function)
    );
    expect(services.updateProduct).toHaveBeenCalledExactlyOnceWith(TX, {
      blobStore: BLOB_STORE,
      storeId: 7,
      values: { ...makeFields(), id: 5 },
    });
  });

  test("deletes the photos the save dropped only once its transaction committed", async () => {
    const { db, holdTransaction, run } = setup();
    const transaction = holdTransaction();
    services.updateProduct.mockResolvedValueOnce(
      makeSaved("draft", [DROPPED_PHOTO])
    );

    const saving = run("update", { ...makeFields(), id: 5 });
    await transaction.worked;

    expect(services.updateProduct).toHaveBeenCalledExactlyOnceWith(TX, {
      blobStore: BLOB_STORE,
      storeId: 7,
      values: { ...makeFields(), id: 5 },
    });
    expect(services.discardBlobs).not.toHaveBeenCalled();

    transaction.commit();
    await expect(saving).resolves.toMatchObject({ id: 17 });

    expect(services.discardBlobs).toHaveBeenCalledExactlyOnceWith(db, [
      DROPPED_PHOTO,
    ]);
  });

  test("a save whose commit fails deletes no photo", async () => {
    const { holdTransaction, run } = setup();
    const transaction = holdTransaction();
    services.updateProduct.mockResolvedValueOnce(
      makeSaved("draft", [DROPPED_PHOTO])
    );

    const saving = run("update", { ...makeFields(), id: 5 });
    await transaction.worked;
    transaction.failCommit(new Error("could not serialize access"));

    await expect(saving).rejects.toMatchObject({
      message: "could not serialize access",
    });
    expect(services.discardBlobs).not.toHaveBeenCalled();
  });

  test.each([
    ["keeps", "draft", []],
    ["drops", "published", [[7]]],
  ] as const)(
    "%s the store's cached catalog when the saved article is %s",
    async (_case, saved, calls) => {
      const { run } = setup({ saved });

      await run("update", { ...makeFields(), id: 5 });

      expect(services.invalidateCatalogCache.mock.calls).toEqual(calls);
    }
  );

  test("a refused save deletes no file and keeps the cache", async () => {
    const { run } = setup();
    services.updateProduct.mockRejectedValueOnce(
      Object.assign(
        new Error("An article photo must be one uploaded to this store"),
        {
          code: "BAD_REQUEST",
        }
      )
    );

    await expect(
      run("update", { ...makeFields(), id: 5 })
    ).rejects.toMatchObject({
      message: "An article photo must be one uploaded to this store",
    });
    expect(services.discardBlobs).not.toHaveBeenCalled();
    expect(services.invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test("hands a deployment without a Blob store over as none, for the service to refuse new photos", async () => {
    const { run } = setup();
    services.readBlobStore.mockReturnValue(null);

    await run("create", makeFields());

    expect(services.createProduct).toHaveBeenCalledExactlyOnceWith(TX, {
      blobStore: null,
      storeId: 7,
      values: makeFields(),
    });
  });

  test("reads one article of the store by the id in its path, outside any write", async () => {
    const { db, run } = setup();

    await expect(run("get", { id: "5" })).resolves.toEqual({
      id: 5,
      slug: "cadena",
    });

    expect(services.getStoreProduct).toHaveBeenCalledExactlyOnceWith(db, {
      id: 5,
      storeId: 7,
    });
    expect(services.withAdmin).not.toHaveBeenCalled();
  });

  test("lists the store's articles a page at a time, from the cursor given", async () => {
    const { db, run } = setup();
    const cursor = { id: 9, updatedAt: "2026-11-17T10:00:00.123Z" };

    await expect(run("list", { cursor, limit: "10" })).resolves.toEqual({
      currencyCode: "UYU",
      items: [{ id: 5 }],
      nextCursor: null,
    });

    expect(services.listStoreProducts).toHaveBeenCalledExactlyOnceWith(db, {
      cursor,
      limit: 10,
      storeId: 7,
    });
  });

  test("lists the first page of 24 when asked nothing", async () => {
    const { db, run } = setup();

    await run("list", {});

    expect(services.listStoreProducts).toHaveBeenCalledExactlyOnceWith(db, {
      cursor: undefined,
      limit: 24,
      storeId: 7,
    });
  });

  test.each([
    ["get", { id: 5 }, services.getStoreProduct],
    ["list", {}, services.listStoreProducts],
  ] as const)(
    "%s by a login the database no longer has is UNAUTHORIZED, before the read",
    async (name, input, service) => {
      const { run } = setup({ isLogin: false });

      await expect(run(name, input)).rejects.toMatchObject(UNAUTHORIZED);
      expect(service).not.toHaveBeenCalled();
    }
  );

  test.each([
    [
      "publish",
      services.publishProduct,
      { id: 13, slug: "cadena", status: "published" },
    ],
    [
      "unpublish",
      services.unpublishProduct,
      { id: 16, slug: "cadena", status: "draft" },
    ],
    ["delete", services.deleteProduct, { id: 12 }],
  ] as const)(
    "%s acts on the article by id within the store, then drops its cached catalog",
    async (name, service, answer) => {
      const { db, run } = setup();

      await expect(run(name, { id: 5 })).resolves.toEqual(answer);

      expect(services.withAdmin).toHaveBeenCalledExactlyOnceWith(
        db,
        USER_ID,
        expect.any(Function)
      );
      expect(service).toHaveBeenCalledExactlyOnceWith(TX, {
        id: 5,
        storeId: 7,
      });
      expect(services.invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(
        7
      );
    }
  );

  test("delete hands the deleted article's image addresses to the files' deletion, after the write", async () => {
    const { db, run } = setup();

    await run("delete", { id: 5 });

    expect(services.discardBlobs).toHaveBeenCalledExactlyOnceWith(db, [
      "https://store9.public.blob.vercel-storage.com/a.webp",
    ]);
    expect(services.discardBlobs.mock.invocationCallOrder[0]).toBeGreaterThan(
      services.invalidateCatalogCache.mock.invocationCallOrder[0] ?? Infinity
    );
  });

  test("a refused delete deletes no file", async () => {
    const { run } = setup();
    services.deleteProduct.mockRejectedValueOnce(
      Object.assign(new Error("Article not found"), { code: "NOT_FOUND" })
    );

    await expect(run("delete", { id: 5 })).rejects.toMatchObject({
      message: "Article not found",
    });
    expect(services.discardBlobs).not.toHaveBeenCalled();
  });

  test("sets availability within the store, then drops its cached catalog", async () => {
    const { run } = setup();

    await expect(
      run("setAvailability", {
        id: 5,
        isAvailable: false,
      })
    ).resolves.toEqual({ id: 15, isAvailable: false });

    expect(services.setProductAvailability).toHaveBeenCalledExactlyOnceWith(
      TX,
      {
        id: 5,
        isAvailable: false,
        storeId: 7,
      }
    );
    expect(services.invalidateCatalogCache).toHaveBeenCalledExactlyOnceWith(7);
  });

  test.each([
    ["repeats a filter value", { attributeValueIds: [21, 21] }],
    [
      "carries more than 50 filter values",
      {
        attributeValueIds: Array.from({ length: 51 }, (_, index) => index + 1),
      },
    ],
    [
      "carries nine photos",
      {
        images: Array.from({ length: 9 }, (_, index) => ({
          height: 10,
          url: `https://store9.public.blob.vercel-storage.com/qa/product/${index}.webp`,
          width: 10,
        })),
      },
    ],
  ])(
    "refuses a save that %s, before reading the login",
    async (_case, overrides) => {
      const { run } = setup();

      await expect(
        run("update", { ...makeFields(overrides), id: 5 })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Input validation failed",
      });
      expect(services.findAdminStore).not.toHaveBeenCalled();
      expect(services.updateProduct).not.toHaveBeenCalled();
    }
  );

  test("a login the database no longer has is UNAUTHORIZED, before any write", async () => {
    const { run } = setup({ isLogin: false });

    await expect(run("publish", { id: 5 })).rejects.toMatchObject(UNAUTHORIZED);
    expect(services.withAdmin).not.toHaveBeenCalled();
    expect(services.publishProduct).not.toHaveBeenCalled();
    expect(services.invalidateCatalogCache).not.toHaveBeenCalled();
  });

  test("a signed-out caller is UNAUTHORIZED, before the login is read", async () => {
    const { run } = setup({ signedIn: false });

    await expect(run("delete", { id: 5 })).rejects.toMatchObject(UNAUTHORIZED);
    expect(services.findAdminStore).not.toHaveBeenCalled();
  });

  test("refuses an article without its Spanish texts before reading the login", async () => {
    const { run } = setup();

    await expect(
      run("create", {
        ...makeFields({
          translations: [
            {
              description: "",
              locale: "en",
              seoDescription: null,
              seoTitle: null,
              title: "Chain",
            },
          ],
        }),
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
    expect(services.findAdminStore).not.toHaveBeenCalled();
  });
});
