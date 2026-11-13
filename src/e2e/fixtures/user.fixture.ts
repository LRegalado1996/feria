import {
  test as base,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type Response,
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

/** Rows the UI created during a test, read off the requests that created them. */
export interface CreatedRows {
  /** Response bodies still being read when the test ended. */
  pending: Promise<void>[];
  postIds: number[];
  /** Why a created row's id could not be read: that row leaks. */
  unreadable: string[];
  userEmails: string[];
}

export interface UserFixtures {
  /** A page signed in as the worker's user, in its own context. */
  authenticatedPage: Page;
  /** Rows the test's pages created through the UI, for the db fixture to delete. */
  createdRows: CreatedRows;
  /** A page with a session of its own, from a real sign-in: sign-out tests. */
  freshAuthenticatedPage: Page;
  /** Who the worker's user is. */
  identity: Identity;
}

interface WorkerFixtures {
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
  baseURL: string
): Promise<Identity> {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required for e2e tests");
  }

  const identity = {
    email: `e2e-w${index}@example.com`,
    name: `E2E User w${index}`,
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
      return { ...identity, id: existing.id };
    }

    const auth = betterAuth({
      baseURL,
      database: drizzleAdapter(db, { provider: "pg", schema }),
      emailAndPassword: { enabled: true },
    });
    const { user } = await auth.api.signUpEmail({ body: identity });

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

/**
 * Records the rows a page creates through the UI (a post, a signed-up user)
 * from the responses that created them, so teardown deletes exactly those.
 */
function captureCreatedRows(page: Page, rows: CreatedRows): void {
  page.on("response", (response) => {
    const request = response.request();

    if (request.method() !== "POST" || !response.ok()) {
      return;
    }

    const { pathname } = new URL(response.url());

    if (pathname === "/api/orpc/post/create") {
      rows.pending.push(recordPost(response, rows));
    } else if (pathname === "/api/auth/sign-up/email") {
      // The page reloads as soon as sign-up answers, which discards the
      // response body; the email it signed up, unique, names the user.
      const { email } = request.postDataJSON() as { email: string };
      rows.userEmails.push(email);
    }
  });
}

/** oRPC answers `{ json: <the created post> }`. */
async function recordPost(response: Response, rows: CreatedRows) {
  try {
    const body = (await response.json()) as { json: { id: number } };
    rows.postIds.push(body.json.id);
  } catch (error) {
    // The page went away before the body was read.
    rows.unreadable.push(`post.create: ${String(error)}`);
  }
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

  // oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured first argument
  createdRows: async ({}, use) => {
    await use({ pending: [], postIds: [], unreadable: [], userEmails: [] });
  },

  page: async ({ createdRows, page }, use) => {
    captureCreatedRows(page, createdRows);
    await use(page);
  },

  authenticatedPage: async (
    { baseURL, browser, createdRows, workerUser },
    use
  ) => {
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      storageState: workerUser.storageState,
    });
    const page = await context.newPage();
    captureCreatedRows(page, createdRows);

    await use(page);
    await context.close();
  },

  freshAuthenticatedPage: async (
    { baseURL, browser, createdRows, identity },
    use
  ) => {
    const context = await signIn(browser, requireBaseURL(baseURL), identity);
    const page = await context.newPage();
    captureCreatedRows(page, createdRows);
    await page.goto("/");
    // The navbar renders for a signed-in visitor only.
    await expect(page.getByTestId("navbar").first()).toBeVisible();

    await use(page);
    await context.close();
  },
});
