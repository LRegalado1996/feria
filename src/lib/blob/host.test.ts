import { describe, expect, test } from "vitest";

import { blobImagePatterns, blobStoreHost } from "./host";

describe("blobStoreHost", () => {
  test.each([
    [
      "a read-write token",
      "vercel_blob_rw_AbC123xyz_s3cretPart",
      "abc123xyz.public.blob.vercel-storage.com",
    ],
    ["no token", undefined, null],
    ["an empty token", "", null],
    ["a client token", "vercel_blob_client_AbC123xyz_s3cret", null],
    ["a token without its secret", "vercel_blob_rw_Synthetic", null],
    ["a store id with a dot", "vercel_blob_rw_evil.com_s3cret", null],
  ])("%s gives %s", (_case, token, host) => {
    expect(blobStoreHost(token)).toBe(host);
  });
});

describe("blobImagePatterns", () => {
  test("allows the store's own host only, over HTTPS, without a query", () => {
    expect(blobImagePatterns("vercel_blob_rw_Store9_s3cret")).toEqual([
      {
        hostname: "store9.public.blob.vercel-storage.com",
        pathname: "/**",
        port: "",
        protocol: "https",
        search: "",
      },
    ]);
  });

  test("allows nothing without a token", () => {
    expect(blobImagePatterns(undefined)).toEqual([]);
  });
});
