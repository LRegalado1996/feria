import { randomUUID } from "node:crypto";

import { getPayloadFromClientToken } from "@vercel/blob/client";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, test, vi } from "vitest";

import * as schema from "@/server/db/schema";
import { productImage } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import {
  type BlobStore,
  cleanUpOrphanBlobs,
  deleteBlobs,
  IMAGE_URL_COLUMNS,
  issueUploadToken,
} from "./upload";

// The Blob API's network calls are doubles: no test reaches the real store.
// The client token is signed for real, which happens in this process.
const blob = vi.hoisted(() => ({
  del: vi.fn(async (_urls: string[], _options: unknown) => undefined),
  list: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ del: blob.del, list: blob.list }));

const HOST = "store9.public.blob.vercel-storage.com";
const STORE: BlobStore = {
  host: HOST,
  namespace: "qa",
  token: "vercel_blob_rw_Store9_s3cretPart",
};
const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A cover's pathname in `folder` that no other call gave. */
function makePathname(folder = "qa") {
  return `${folder}/cover/${randomUUID()}.webp`;
}

function makeListed(pathname: string, uploadedAt: Date) {
  return { pathname, uploadedAt, url: `https://${HOST}/${pathname}` };
}

describe("issueUploadToken", () => {
  test("signs the type, the exact size and a new name under the folder and the purpose", async () => {
    vi.setSystemTime(new Date("2026-11-16T12:00:00.000Z"));

    const { pathname, token } = await issueUploadToken(STORE, {
      contentType: "image/webp",
      purpose: "cover",
      size: 1_234_567,
    });

    expect(pathname).toMatch(new RegExp(`^qa/cover/${UUID_PATTERN}\\.webp$`));
    expect(token).toMatch(/^vercel_blob_client_Store9_/);
    expect(getPayloadFromClientToken(token)).toEqual({
      addRandomSuffix: false,
      allowOverwrite: false,
      allowedContentTypes: ["image/webp"],
      maximumSizeInBytes: 1_234_567,
      pathname,
      validUntil: new Date("2026-11-16T12:10:00.000Z").getTime(),
    });
  });

  test("names a JPEG .jpg and never repeats a name", async () => {
    const request = {
      contentType: "image/jpeg",
      purpose: "cover",
      size: 10,
    } as const;

    const first = await issueUploadToken(STORE, request);
    const second = await issueUploadToken(STORE, request);

    expect(first.pathname).toMatch(/^qa\/cover\/.+\.jpg$/);
    expect(second.pathname).not.toBe(first.pathname);
  });

  test("refuses to sign without a read-write token of the right shape", async () => {
    await expect(
      issueUploadToken(
        { ...STORE, token: "not-a-token" },
        { contentType: "image/png", purpose: "cover", size: 10 }
      )
    ).rejects.toMatchObject({
      message: "Vercel Blob: Invalid `token` parameter",
    });
  });
});

describe("deleteBlobs", () => {
  test("deletes this deployment's files once each, never anybody else's", async () => {
    const own = `https://${HOST}/${makePathname()}`;
    const other = `https://other.public.blob.vercel-storage.com/${makePathname()}`;
    const production = `https://${HOST}/${makePathname("production")}`;

    await expect(
      deleteBlobs(STORE, [own, "/seed/ring.jpg", own, other, production])
    ).resolves.toEqual([own]);

    expect(blob.del).toHaveBeenCalledExactlyOnceWith([own], {
      token: STORE.token,
    });
  });

  test("calls nothing when none of them is its own", async () => {
    await expect(deleteBlobs(STORE, ["/seed/ring.jpg"])).resolves.toEqual([]);

    expect(blob.del).not.toHaveBeenCalled();
  });
});

describe("cleanUpOrphanBlobs", () => {
  function setup({
    pages,
    stored,
  }: {
    pages: { blobs: ReturnType<typeof makeListed>[]; cursor?: string }[];
    stored: string[];
  }) {
    const db = createMockDatabase();
    blob.list.mockImplementation(async ({ cursor }: { cursor?: string }) => {
      const index = cursor === undefined ? 0 : Number(cursor);
      const page = pages[index] ?? { blobs: [] };

      return {
        blobs: page.blobs,
        cursor: page.cursor,
        hasMore: page.cursor !== undefined,
      };
    });
    db.$["select.where"].mockResolvedValue(stored.map((url) => ({ url })));

    return { db };
  }

  const OLDER_THAN = new Date("2026-11-14T12:00:00.000Z");
  const OLD = new Date("2026-11-13T09:00:00.000Z");

  test("deletes every old file of its folder that no row names, across pages", async () => {
    const [kept, orphanA, orphanB, young] = [
      makePathname(),
      makePathname(),
      makePathname(),
      makePathname(),
    ];
    const { db } = setup({
      pages: [
        {
          blobs: [makeListed(kept, OLD), makeListed(orphanA, OLD)],
          cursor: "1",
        },
        {
          blobs: [
            makeListed(orphanB, new Date(OLDER_THAN.getTime() - 1)),
            makeListed(young, OLDER_THAN),
          ],
        },
      ],
      // A host in capitals names the same file.
      stored: [`https://${HOST.toUpperCase()}/${kept}`, "/seed/ring.jpg"],
    });

    await expect(
      cleanUpOrphanBlobs(db as never, STORE, { olderThan: OLDER_THAN })
    ).resolves.toEqual({ checked: 3, deleted: [orphanA, orphanB] });

    expect(blob.list.mock.calls).toEqual([
      [{ cursor: undefined, prefix: "qa/", token: STORE.token }],
      [{ cursor: "1", prefix: "qa/", token: STORE.token }],
    ]);
    expect(blob.del).toHaveBeenCalledExactlyOnceWith(
      [`https://${HOST}/${orphanA}`, `https://${HOST}/${orphanB}`],
      { token: STORE.token }
    );
  });

  test("reads the rows of every image column, narrowed to its folder", async () => {
    const { db } = setup({
      pages: [{ blobs: [makeListed(makePathname(), OLD)] }],
      stored: [],
    });

    await cleanUpOrphanBlobs(db as never, STORE, { olderThan: OLDER_THAN });

    expect(db.$["select.from"].mock.calls).toEqual([[productImage]]);
    expect(
      db.$["select.where"].mock.calls.map(([where]) => renderQuery(where))
    ).toEqual([
      {
        params: ["https://%/qa/%"],
        sql: '"product_image"."url" like $1',
      },
    ]);
  });

  test("deletes in batches of 100", async () => {
    const listed = Array.from({ length: 101 }, () =>
      makeListed(makePathname(), OLD)
    );
    const { db } = setup({ pages: [{ blobs: listed }], stored: [] });

    const { deleted } = await cleanUpOrphanBlobs(db as never, STORE, {
      olderThan: OLDER_THAN,
    });

    expect(deleted).toEqual(listed.map((file) => file.pathname));
    expect(blob.del.mock.calls.map(([urls]) => urls.length)).toEqual([100, 1]);
    expect(blob.del.mock.calls.flatMap(([urls]) => urls)).toEqual(
      listed.map((file) => file.url)
    );
  });

  test("reads no row and deletes nothing when no file is old enough", async () => {
    const { db } = setup({
      pages: [{ blobs: [makeListed(makePathname(), OLDER_THAN)] }],
      stored: [],
    });

    await expect(
      cleanUpOrphanBlobs(db as never, STORE, { olderThan: OLDER_THAN })
    ).resolves.toEqual({ checked: 0, deleted: [] });

    expect(db.$.select).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });
});

describe("IMAGE_URL_COLUMNS", () => {
  test("lists every column of the schema that holds an image's address", () => {
    const imageColumns = Object.values(schema)
      .filter((value): value is PgTable => is(value, PgTable))
      .flatMap((table) =>
        Object.values(getTableColumns(table))
          .filter(
            (column) =>
              /image_?url$/i.test(column.name) ||
              (getTableName(table).endsWith("image") && column.name === "url")
          )
          .map((column) => `${getTableName(table)}.${column.name}`)
      );

    expect(
      IMAGE_URL_COLUMNS.map(
        (column) => `${getTableName(column.table)}.${column.name}`
      )
    ).toEqual(imageColumns);
  });
});
