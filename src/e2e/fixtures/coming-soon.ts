import { type APIRequestContext, expect, request } from "@playwright/test";

import type { UpdateComingSoonValues } from "../../lib/schemas/coming-soon";
import { IGNORE_HTTPS_ERRORS } from "./user.fixture";

/** The coming-soon page with every text empty: the dictionary's page. */
export const DEFAULT_COMING_SOON: UpdateComingSoonValues = {
  countdownTo: null,
  translations: [],
};

/** The two positions of the switch (FER-034). */
export type Storefront = "closed" | "open";

async function requireOk(
  response: Awaited<ReturnType<APIRequestContext["post"]>>,
  procedure: string
): Promise<void> {
  if (response.status() !== 200) {
    throw new Error(
      `${procedure} answered ${response.status()}: ${await response.text()}`
    );
  }
}

/**
 * Publishes the coming-soon page (`closed`) or takes it down (`open`)
 * through `comingSoon.setPublished`, as an admin does. `admin` carries an
 * admin's session.
 */
export async function writeStorefront(
  admin: APIRequestContext,
  storefront: Storefront
): Promise<void> {
  await requireOk(
    await admin.post("/api/orpc/comingSoon/setPublished", {
      data: { json: { published: storefront === "closed" } },
    }),
    "comingSoon.setPublished"
  );
}

/** Replaces the page's texts and day through `comingSoon.update`. */
export async function writeComingSoonTexts(
  admin: APIRequestContext,
  values: UpdateComingSoonValues
): Promise<void> {
  await requireOk(
    await admin.post("/api/orpc/comingSoon/update", {
      data: { json: values },
    }),
    "comingSoon.update"
  );
}

/**
 * Waits until the public (no session) gets `storefront` at `/`: a temporary
 * redirect to the coming-soon page, or the store. The proxy remembers the
 * switch for a few seconds on each server (`SWITCH_TTL_MS`), so a flip
 * reaches the public only once that window passed; this waits for exactly
 * that, never for a fixed time.
 */
export async function waitForStorefront(
  baseURL: string,
  storefront: Storefront
): Promise<void> {
  const visitor = await request.newContext({
    baseURL,
    ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
    // Inside a test, a new context takes the config's `use`, the worker's
    // session included: an admin would see the closed store.
    storageState: { cookies: [], origins: [] },
  });

  try {
    await expect
      .poll(
        async () => {
          const response = await visitor.get("/", { maxRedirects: 0 });
          const location = response.headers().location ?? "";

          return response.status() === 307 &&
            new URL(location, baseURL).pathname === "/coming-soon"
            ? "closed"
            : "open";
        },
        { intervals: [250, 500, 1000], timeout: 30_000 }
      )
      .toBe(storefront);
  } finally {
    await visitor.dispose();
  }
}
