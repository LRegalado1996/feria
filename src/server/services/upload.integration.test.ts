import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import { product, productImage } from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";

import { type BlobStore, cleanUpOrphanBlobs } from "./upload";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The Blob store is a double holding files in memory, listed and deleted as
// the real API does; the rows that reference them are real.
const store = vi.hoisted(() => ({
  files: new Map<string, { pathname: string; uploadedAt: Date; url: string }>(),
}));

vi.mock("@vercel/blob", () => ({
  del: vi.fn(async (urls: string[]) => {
    for (const url of urls) {
      store.files.delete(url);
    }
  }),
  list: vi.fn(async ({ prefix }: { prefix: string }) => ({
    blobs: [...store.files.values()].filter((file) =>
      file.pathname.startsWith(prefix)
    ),
    hasMore: false,
  })),
}));

const BLOB_STORE: BlobStore = {
  host: "integration.public.blob.vercel-storage.com",
  namespace: "local",
  token: "vercel_blob_rw_Integration_s3cret",
};

// The articles this file created; deleting one deletes its images.
const createdProductIds: number[] = [];

afterEach(async () => {
  store.files.clear();
  await db
    .delete(product)
    .where(inArray(product.id, createdProductIds.splice(0)));
});

/** A file in the double, uploaded at `uploadedAt`, in `folder`. */
function putFile(uploadedAt: Date, folder = "local") {
  const pathname = `${folder}/cover/${randomUUID()}.webp`;
  const url = `https://${BLOB_STORE.host}/${pathname}`;
  store.files.set(url, { pathname, uploadedAt, url });

  return { pathname, url };
}

/** A draft article whose one image is stored at `url`. */
async function makeArticleShowing(url: string) {
  const [article] = await db
    .insert(product)
    .values({ slug: `cleanup-${uniqueTag()}`, storeId: await theStoreId(db) })
    .returning({ id: product.id });

  if (!article) {
    throw new Error("no article");
  }

  createdProductIds.push(article.id);
  await db.insert(productImage).values({
    height: 800,
    position: 0,
    productId: article.id,
    url,
    width: 1200,
  });
}

describe("cleanUpOrphanBlobs against the database", () => {
  test("leaves no orphan behind, and keeps what a row names or is still young", async () => {
    const olderThan = new Date("2026-11-14T12:00:00.000Z");
    const old = new Date("2026-11-13T12:00:00.000Z");
    const referenced = putFile(old);
    const orphan = putFile(old);
    const young = putFile(olderThan);
    const otherDeployment = putFile(old, "qa");
    await makeArticleShowing(referenced.url);

    const result = await cleanUpOrphanBlobs(db, BLOB_STORE, { olderThan });

    expect(result).toEqual({ checked: 2, deleted: [orphan.pathname] });
    expect(new Set(store.files.keys())).toEqual(
      new Set([referenced.url, young.url, otherDeployment.url])
    );
  });

  test("a second run finds nothing more to delete", async () => {
    const olderThan = new Date("2026-11-14T12:00:00.000Z");
    const kept = putFile(new Date("2026-11-01T00:00:00.000Z"));
    putFile(new Date("2026-11-01T00:00:00.000Z"));
    await makeArticleShowing(kept.url);
    await cleanUpOrphanBlobs(db, BLOB_STORE, { olderThan });

    await expect(
      cleanUpOrphanBlobs(db, BLOB_STORE, { olderThan })
    ).resolves.toEqual({ checked: 1, deleted: [] });
    expect([...store.files.keys()]).toEqual([kept.url]);
  });
});
