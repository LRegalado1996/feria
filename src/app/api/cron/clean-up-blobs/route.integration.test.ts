import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import { product, productImage } from "@/server/db/schema";
import { theStoreId, uniqueTag } from "@/server/test/one-store";

import { GET } from "./route";

const SECRET = "synthetic-cron-secret-0123456789";
const HOST = "cronstore.public.blob.vercel-storage.com";

vi.mock("@/env", () => ({
  env: {
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_CronStore_s3cretPart",
    CRON_SECRET: "synthetic-cron-secret-0123456789",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The Blob store is a double holding files in memory; the rows that
// reference them are real, and so is the route in front of the cleanup.
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

const createdProductIds: number[] = [];

afterEach(async () => {
  store.files.clear();
  await db
    .delete(product)
    .where(inArray(product.id, createdProductIds.splice(0)));
});

/** A file of the local folder in the double, uploaded at `uploadedAt`. */
function putFile(uploadedAt: Date) {
  const pathname = `local/cover/${randomUUID()}.webp`;
  const url = `https://${HOST}/${pathname}`;
  store.files.set(url, { pathname, uploadedAt, url });

  return url;
}

async function setup() {
  vi.setSystemTime(new Date("2026-11-17T07:00:00.000Z"));
  const kept = putFile(new Date("2026-11-10T00:00:00.000Z"));
  const orphan = putFile(new Date("2026-11-10T00:00:00.000Z"));
  const young = putFile(new Date("2026-11-16T00:00:00.000Z"));
  const [article] = await db
    .insert(product)
    .values({ slug: `cron-${uniqueTag()}`, storeId: await theStoreId(db) })
    .returning({ id: product.id });

  if (!article) {
    throw new Error("no article");
  }

  createdProductIds.push(article.id);
  await db.insert(productImage).values({
    height: 800,
    position: 0,
    productId: article.id,
    url: kept,
    width: 1200,
  });

  return {
    files: { kept, orphan, young },
    run: async (authorization: string) =>
      await GET(
        new NextRequest("http://localhost:3000/api/cron/clean-up-blobs", {
          headers: { authorization },
        })
      ),
  };
}

describe("cron: clean up blobs against the database", () => {
  test("Vercel's call deletes the old orphan and keeps what a row names or is young", async () => {
    const { files, run } = await setup();

    const response = await run(`Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ checked: 2, deleted: 1 });
    expect(new Set(store.files.keys())).toEqual(
      new Set([files.kept, files.young])
    );
  });

  test("a call without the secret deletes nothing", async () => {
    const { files, run } = await setup();

    const response = await run("Bearer guessed");

    expect(response.status).toBe(401);
    expect(new Set(store.files.keys())).toEqual(
      new Set([files.kept, files.orphan, files.young])
    );
  });
});
