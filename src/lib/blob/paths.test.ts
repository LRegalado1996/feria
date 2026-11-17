import { afterEach, describe, expect, test, vi } from "vitest";

import { blobNamespace, blobPathname, isOwnBlobUrl } from "./paths";

afterEach(() => {
  vi.unstubAllEnvs();
});

const HOST = "store9.public.blob.vercel-storage.com";
const ID = "0f8e2b9c-1d2a-4b3c-8d4e-5f6a7b8c9d0e";

function ownUrl(path = `qa/cover/${ID}.webp`) {
  return `https://${HOST}/${path}`;
}

describe("blobNamespace", () => {
  test.each([
    [
      "production by its target",
      { VERCEL_TARGET_ENV: "production" },
      "production",
    ],
    [
      "production by its branch",
      { VERCEL_GIT_COMMIT_REF: "main" },
      "production",
    ],
    [
      "qa by its branch",
      { VERCEL_GIT_COMMIT_REF: "qa", VERCEL_ENV: "preview", VERCEL: "1" },
      "qa",
    ],
    [
      "a real preview",
      { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fer-011" },
      "preview",
    ],
    ["a faked preview off Vercel", { VERCEL_ENV: "preview" }, "local"],
    ["a local run", {}, "local"],
  ])("%s is %s", (_case, env, namespace) => {
    expect(blobNamespace(env)).toBe(namespace);
  });

  test("reads process.env by default", () => {
    vi.stubEnv("VERCEL_TARGET_ENV", "production");

    expect(blobNamespace()).toBe("production");
  });
});

describe("blobPathname", () => {
  test.each([
    ["image/jpeg", `qa/cover/${ID}.jpg`],
    ["image/png", `qa/cover/${ID}.png`],
    ["image/webp", `qa/cover/${ID}.webp`],
  ] as const)("names a %s file %s", (contentType, pathname) => {
    expect(
      blobPathname({ contentType, id: ID, namespace: "qa", purpose: "cover" })
    ).toBe(pathname);
  });
});

describe("isOwnBlobUrl", () => {
  const scope = { host: HOST, namespace: "qa" } as const;

  test.each([
    ["an upload of this deployment", ownUrl(), true],
    ["a JPEG", ownUrl(`qa/cover/${ID}.jpg`), true],
    [
      "another store's host",
      `https://other.public.blob.vercel-storage.com/qa/cover/${ID}.webp`,
      false,
    ],
    [
      "a host that only ends like it",
      `https://x${HOST}/qa/cover/${ID}.webp`,
      false,
    ],
    ["plain HTTP", `http://${HOST}/qa/cover/${ID}.webp`, false],
    [
      "another deployment's folder",
      ownUrl(`production/cover/${ID}.webp`),
      false,
    ],
    ["a folder no purpose has", ownUrl(`qa/avatar/${ID}.webp`), false],
    ["a name that is no id", ownUrl("qa/cover/photo.webp"), false],
    ["another extension", ownUrl(`qa/cover/${ID}.svg`), false],
    ["a deeper path", ownUrl(`qa/cover/x/${ID}.webp`), false],
    ["a query string", `${ownUrl()}?download=1`, false],
    ["a fragment", `${ownUrl()}#top`, false],
    ["a port", `https://${HOST}:8443/qa/cover/${ID}.webp`, false],
    ["credentials", `https://user:pw@${HOST}/qa/cover/${ID}.webp`, false],
    ["a local seed path", "/seed/bubble-gun-1.jpg", false],
    ["no address at all", "not a url", false],
  ])("%s is own: %s", (_case, url, own) => {
    expect(isOwnBlobUrl(url, scope)).toBe(own);
  });

  test("a host in capitals is the same host", () => {
    expect(
      isOwnBlobUrl(ownUrl().replace(HOST, HOST.toUpperCase()), scope)
    ).toBe(true);
  });

  test("checks the purpose's folder when one is given", () => {
    expect(isOwnBlobUrl(ownUrl(), { ...scope, purpose: "cover" })).toBe(true);
    // Shaped like an upload, but in another purpose's folder.
    expect(
      isOwnBlobUrl(ownUrl(`qa/avatar/${ID}.webp`), {
        ...scope,
        purpose: "cover",
      })
    ).toBe(false);
  });
});
