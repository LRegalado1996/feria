import type { ReactElement, ReactNode } from "react";
import { describe, expect, test } from "vitest";

import AdminStore from "./page";

interface AdminStoreParams {
  params: Promise<{ locale: string; store: string }>;
}

type Boundary<P> = ReactElement<{
  children: ReactElement<P, (props: P) => Promise<ReactNode>>;
  fallback?: ReactNode;
}>;

async function makeParams(locale: string, store = "lr-market") {
  return await Promise.resolve({ locale, store });
}

/** What the page's boundary streams: the redirect, thrown. */
function setup(locale: string) {
  const page: Boundary<AdminStoreParams> = AdminStore({
    params: makeParams(locale),
  });
  const inner = page.props.children;

  return { fallback: page.props.fallback, resolve: inner.type(inner.props) };
}

describe("AdminStore", () => {
  test.each([
    ["es", "/admin/lr-market/products"],
    ["en", "/en/admin/lr-market/products"],
  ])(
    "in %s, sends the store's admin to its articles at %s",
    async (locale, to) => {
      const { fallback, resolve } = setup(locale);

      await expect(resolve).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${to};307;`,
      });
      expect(fallback).toBeUndefined();
    }
  );

  test("answers 404 for a language the product does not speak", async () => {
    const { resolve } = setup("fr");

    await expect(resolve).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
