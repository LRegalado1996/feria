import { readFileSync } from "node:fs";
import path from "node:path";

import type { Page, Request } from "@playwright/test";

/** A photo of the repository's seed, for a test to upload. */
export function seedPhoto(file: string): string {
  return path.join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "public",
    "seed",
    file
  );
}

/**
 * The address the store gives an upload, as Vercel's API answers it: the
 * client token names the store, the request the pathname the server chose.
 */
function uploadedUrl(request: Request): string {
  const token = request.headers().authorization ?? "";
  const storeId = /vercel_blob_client_([A-Za-z0-9]+)_/.exec(token)?.[1] ?? "";
  const pathname = new URL(request.url()).searchParams.get("pathname") ?? "";

  return `https://${storeId.toLowerCase()}.public.blob.vercel-storage.com/${pathname}`;
}

/**
 * Stands in for the Blob store (FER-011): answers the browser's uploads as
 * Vercel's API does, and `next/image`'s requests for an uploaded file with
 * `fallback` (the file lives nowhere). Nothing reaches the real store; the
 * token and the saves are the app's own. Answers the uploads' addresses, in
 * the order they were sent.
 */
export async function interceptBlobStore(
  page: Page,
  fallback = seedPhoto("ring-2.jpg")
): Promise<{ uploads: string[] }> {
  const uploads: string[] = [];
  const photo = readFileSync(fallback);

  await page.route("https://vercel.com/api/blob/**", async (route) => {
    const url = uploadedUrl(route.request());
    uploads.push(url);
    const pathname = new URL(url).pathname.slice(1);

    await route.fulfill({
      json: {
        contentDisposition: `inline; filename="${path.basename(pathname)}"`,
        contentType: "image/webp",
        downloadUrl: `${url}?download=1`,
        etag: '"e2e"',
        pathname,
        url,
      },
    });
  });
  await page.route(
    (url) =>
      url.pathname === "/_next/image" &&
      (url.searchParams.get("url") ?? "").includes(
        ".public.blob.vercel-storage.com/"
      ),
    async (route) => {
      await route.fulfill({ body: photo, contentType: "image/jpeg" });
    }
  );

  return { uploads };
}
