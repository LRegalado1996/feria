import type { ReactElement, ReactNode } from "react";
import { describe, expect, test } from "vitest";

import Platform from "./page";

interface PlatformParams {
  params: Promise<{ locale: string }>;
}

type Boundary<P> = ReactElement<{
  children: ReactElement<P, (props: P) => Promise<ReactNode>>;
  fallback?: ReactNode;
}>;

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

/** What the page's boundary streams: the redirect, thrown. */
function setup(locale: string) {
  const page: Boundary<PlatformParams> = Platform({
    params: makeParams(locale),
  });
  const inner = page.props.children;

  return { fallback: page.props.fallback, resolve: inner.type(inner.props) };
}

describe("Platform", () => {
  test.each([
    ["es", "/admin/platform/stores"],
    ["en", "/en/admin/platform/stores"],
  ])(
    "in %s, opens the platform area on its stores at %s",
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
