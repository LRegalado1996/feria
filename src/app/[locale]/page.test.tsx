import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";

import Home, { HomeRedirect } from "./page";

const { connection, getDefaultStore } = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  getDefaultStore: vi.fn(
    async (): Promise<{ id: number; slug: string } | null> =>
      await Promise.resolve(null)
  ),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({ connection }));

vi.mock("@/server/cache/store", () => ({ getDefaultStore }));

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

async function setupShell(locale: string) {
  const page: ReactElement<{
    children: ReactElement<{ locale: Locale }>;
    fallback: ReactNode;
  }> = await Home({ params: makeParams(locale) });

  render(page.props.fallback);

  return { redirectProps: page.props.children.props };
}

function setup({
  store = null,
}: {
  store?: { id: number; slug: string } | null;
} = {}) {
  getDefaultStore.mockResolvedValue(store);

  return {
    open: async (locale: Locale) => await HomeRedirect({ locale }),
  };
}

describe("Home page shell", () => {
  test.each([
    ["es", "Cargando"],
    ["en", "Loading"],
  ] as const)(
    "in %s, streams the redirect behind an empty, busy canvas, reading nothing yet",
    async (locale, loading) => {
      const { redirectProps } = await setupShell(locale);

      expect(screen.getByTestId("home-skeleton")).toHaveAttribute(
        "aria-busy",
        "true"
      );
      expect(screen.getByRole("status")).toHaveTextContent(loading);
      expect(redirectProps).toEqual({ locale });
      expect(getDefaultStore).not.toHaveBeenCalled();
    }
  );

  test("answers 404 for a language the product does not speak", async () => {
    await expect(setupShell("fr")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});

describe("HomeRedirect", () => {
  test.each([
    ["es", "/lr-market"],
    ["en", "/en/lr-market"],
  ] as const)(
    "in %s, sends the visitor to the default store at %s",
    async (locale, target) => {
      const { open } = setup({ store: { id: 7, slug: "lr-market" } });

      await expect(open(locale)).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${target};307;`,
      });
    }
  );

  test("answers the not-found page when no store is the default", async () => {
    const { open } = setup();

    await expect(open("es")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });

  test("waits for a request before reading the store, so the build needs no database", async () => {
    const { open } = setup();
    // The request has not arrived yet: `connection()` stays pending until
    // the test lets it through.
    let arrive: () => void = () => undefined;
    const arrived = new Promise<undefined>((resolve) => {
      arrive = () => {
        resolve(undefined);
      };
    });
    connection.mockImplementationOnce(async () => {
      await arrived;
    });

    const opened = open("es");
    // Every callback already queued runs before this timer fires.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(getDefaultStore).not.toHaveBeenCalled();

    arrive();

    await expect(opened).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(getDefaultStore).toHaveBeenCalledExactlyOnceWith();
  });
});
