import {
  test as base,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type WorkerInfo,
} from "@playwright/test";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../server/db/schema";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/**
 * The config's `use.ignoreHTTPSErrors` and `baseURL` reach the contexts
 * Playwright builds, never a `browser.newContext()`, so every hand-made
 * context repeats them. Locally `E2E_BASE_URL` can be the worktree's HTTPS
 * URL, signed by a local CA Node does not trust; CI runs plain HTTP.
 */
export const IGNORE_HTTPS_ERRORS = !process.env.CI;

const PASSWORD = "e2e-test-password-123";

/** The user a worker signs in as. Only its own worker ever uses it. */
export interface Identity {
  email: string;
  id: string;
  name: string;
  password: string;
}

export interface UserFixtures {
  /** A page signed in as the worker's user, in its own context. */
  authenticatedPage: Page;
  /** A page with a session of its own, from a real sign-in: sign-out tests. */
  freshAuthenticatedPage: Page;
  /** Who the worker's user is. */
  identity: Identity;
  /** A page signed in as the worker's superadmin, in its own context. */
  superadminPage: Page;
}

interface WorkerFixtures {
  workerSuperadmin: Identity & { storageState: StorageState };
  workerUser: Identity & { storageState: StorageState };
}

export function requireBaseURL(baseURL: string | undefined): string {
  if (!baseURL) {
    throw new Error("baseURL is required: set E2E_BASE_URL or use the config");
  }

  return baseURL;
}

// A worker fixture cannot read Playwright's test-scoped `baseURL`, so it
// resolves the URL the way the config does.
function workerBaseURL(): string {
  // oxlint-disable-next-line typescript/prefer-nullish-coalescing -- an empty E2E_BASE_URL means unset
  return process.env.E2E_BASE_URL || "http://localhost:3000";
}

/**
 * Get-or-create through Better Auth's server API on a fixture-local
 * instance: the password is hashed Better Auth's way, and no HTTP sign-up
 * counts against the app's rate limit. The email carries the worker index,
 * the one value unique among the workers running at once, so a restarted
 * worker finds the user it made before.
 */
async function provisionUser(
  index: number,
  baseURL: string,
  role: "member" | "superadmin" = "member"
): Promise<Identity> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for e2e tests");
  }

  // One login per worker and role (FER-009): a member with no store, and a
  // superadmin for the specs that call platform procedures.
  const prefix = role === "superadmin" ? "e2e-admin" : "e2e";
  const identity = {
    email: `${prefix}-w${index}@example.com`,
    name: `E2E ${role === "superadmin" ? "Superadmin" : "User"} w${index}`,
    password: PASSWORD,
  };
  const pool = new Pool({ connectionString, max: 1 });

  try {
    const db = drizzle(pool, { schema });
    const existing = await db.query.user.findFirst({
      columns: { id: true },
      where: eq(schema.user.email, identity.email),
    });

    if (existing) {
      // A run that died between creating the user and setting its role
      // leaves a member where a superadmin is wanted: set it every time.
      await db
        .update(schema.user)
        .set({ role })
        .where(eq(schema.user.id, existing.id));
      return { ...identity, id: existing.id };
    }

    // The app closes sign-up (FER-009); this fixture-local instance does not,
    // and the role is set after, as `input: false` keeps it out of sign-up.
    const auth = betterAuth({
      baseURL,
      database: drizzleAdapter(db, { provider: "pg", schema }),
      emailAndPassword: { enabled: true },
    });
    const { user } = await auth.api.signUpEmail({ body: identity });
    await db
      .update(schema.user)
      .set({ role })
      .where(eq(schema.user.id, user.id));

    return { ...identity, id: user.id };
  } finally {
    await pool.end();
  }
}

/** A context signed in over HTTP, as a browser would be. */
async function signIn(
  browser: Browser,
  baseURL: string,
  identity: Identity
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
  });
  const response = await context.request.post(
    `${baseURL}/api/auth/sign-in/email`,
    {
      headers: { origin: baseURL },
      data: { email: identity.email, password: identity.password },
    }
  );

  if (!response.ok()) {
    // Read before closing: closing the context disposes the response.
    const detail = `${response.status()} ${await response.text()}`;
    await context.close();
    throw new Error(`Sign-in failed for ${identity.email}: ${detail}`);
  }

  return context;
}

export const test = base.extend<UserFixtures, WorkerFixtures>({
  workerUser: [
    async (
      { browser }: { browser: Browser },
      use: (user: WorkerFixtures["workerUser"]) => Promise<void>,
      workerInfo: WorkerInfo
    ) => {
      const baseURL = workerBaseURL();
      const identity = await provisionUser(workerInfo.parallelIndex, baseURL);
      const context = await signIn(browser, baseURL, identity);
      const storageState = await context.storageState();
      await context.close();

      await use({ ...identity, storageState });
    },
    { scope: "worker" },
  ],

  workerSuperadmin: [
    async (
      { browser }: { browser: Browser },
      use: (user: WorkerFixtures["workerSuperadmin"]) => Promise<void>,
      workerInfo: WorkerInfo
    ) => {
      const baseURL = workerBaseURL();
      const identity = await provisionUser(
        workerInfo.parallelIndex,
        baseURL,
        "superadmin"
      );
      const context = await signIn(browser, baseURL, identity);
      const storageState = await context.storageState();
      await context.close();

      await use({ ...identity, storageState });
    },
    { scope: "worker" },
  ],

  identity: async ({ workerUser }, use) => {
    const { storageState: _storageState, ...identity } = workerUser;
    await use(identity);
  },

  // The default `page` and `context` sign in as the worker's user too, so a
  // spec on raw `page` is isolated. A spec that starts signed out sets
  // `test.use({ storageState: { cookies: [], origins: [] } })`; the project
  // in playwright.config.ts must not set one.
  storageState: async ({ workerUser }, use) => {
    await use(workerUser.storageState);
  },

  authenticatedPage: async ({ baseURL, browser, workerUser }, use) => {
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: workerUser.storageState,
    });
    const page = await context.newPage();

    await use(page);
    await context.close();
  },

  superadminPage: async ({ baseURL, browser, workerSuperadmin }, use) => {
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: workerSuperadmin.storageState,
    });
    const page = await context.newPage();

    await use(page);
    await context.close();
  },

  freshAuthenticatedPage: async ({ baseURL, browser, identity }, use) => {
    const context = await signIn(browser, requireBaseURL(baseURL), identity);
    const page = await context.newPage();
    await page.goto("/admin");
    // The admin's shell renders for a signed-in visitor only.
    await expect(
      page.getByTestId("admin-shell").filter({ visible: true }).first()
    ).toBeVisible();

    await use(page);
    await context.close();
  },
});
