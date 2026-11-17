// No imports: `next.config.ts` loads this file, outside the app's aliases.

const READ_WRITE_TOKEN_PATTERN = /^vercel_blob_rw_([A-Za-z0-9]+)_[A-Za-z0-9]+$/;

/**
 * The public host of the Blob store a read-write token belongs to
 * (`<store id>.public.blob.vercel-storage.com`), or `null` without a token
 * or with one of another shape. The store id is the token's third segment,
 * the one the SDK reads too; the host is in lower case, as a parsed URL
 * gives it.
 */
export function blobStoreHost(token: string | undefined): string | null {
  const storeId = token?.match(READ_WRITE_TOKEN_PATTERN)?.[1];

  return storeId
    ? `${storeId.toLowerCase()}.public.blob.vercel-storage.com`
    : null;
}

/**
 * `images.remotePatterns` for `next/image`: this deployment's own Blob store
 * and nothing else, over HTTPS and without a query string, so the optimizer
 * cannot be pointed at anybody else's files. Empty without a token: a build
 * that stores no image.
 */
export function blobImagePatterns(token: string | undefined) {
  const hostname = blobStoreHost(token);

  return hostname
    ? [
        {
          hostname,
          pathname: "/**",
          port: "",
          protocol: "https" as const,
          search: "",
        },
      ]
    : [];
}
