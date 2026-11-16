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

/**
 * Rows the test's pages created through the UI, read off the responses that
 * created them, for the db fixture to delete at teardown.
 */
export interface CreatedRows {
  categoryIds: number[];
  filterIds: number[];
  filterValueIds: number[];
  /** An order's public token: what `order.create` answers, unique per order. */
  orderTokens: string[];
  /** Response bodies still being read when the test ended. */
  pending: Promise<void>[];
  /** Why a created row's id could not be read: that row leaks. */
  unreadable: string[];
}

export interface UserFixtures {
  /** A page signed in as the worker's user, in its own context. */
  authenticatedPage: Page;
  /** Rows the test's pages created through the UI (`CreatedRows`). */
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

/**
 * The base URL for a worker fixture, which cannot read Playwright's
 * test-scoped `baseURL`: resolved the way the config resolves it.
 */
export function workerBaseURL(): string {
  // oxlint-disable-next-line typescript/prefer-nullish-coalescing -- an empty E2E_BASE_URL means unset
  return process.env.E2E_BASE_URL || "http://localhost:3000";
}

/**
 * Get-or-create through Better Auth's server API on a fixture-local
 * instance: the password is hashed Better Auth's way, and no HTTP sign-up
 * counts against the app's rate limit. The email carries the worker index,
 * the one value unique among the workers running at once, so a restarted
 * worker finds the user it made before. Every login is an admin (FER-038),
 * so this one reaches the whole admin.
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

    // The app closes sign-up (FER-009); this fixture-local instance does not.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The created row's `field`, from an oRPC answer: `{ json: { … } }`. */
function readCreated(body: unknown, field: "id" | "token"): unknown {
  return isRecord(body) && isRecord(body.json) ? body.json[field] : undefined;
}

/** The procedures that create a row, and where its key goes. */
const CREATING = {
  "/api/orpc/attribute/create": "filterIds",
  "/api/orpc/attribute/createValue": "filterValueIds",
  "/api/orpc/category/create": "categoryIds",
  "/api/orpc/order/create": "orderTokens",
} as const;

function isCreating(pathname: string): pathname is keyof typeof CREATING {
  return Object.hasOwn(CREATING, pathname);
}

/** Records the key of the row one creating response made. */
async function recordCreated(
  response: Response,
  path: keyof typeof CREATING,
  rows: CreatedRows
): Promise<void> {
  try {
    const target = CREATING[path];
    const body: unknown = await response.json();

    if (target === "orderTokens") {
      const token = readCreated(body, "token");

      if (typeof token !== "string") {
        throw new TypeError("no token in the answer");
      }

      rows.orderTokens.push(token);
      return;
    }

    const id = readCreated(body, "id");

    if (typeof id !== "number") {
      throw new TypeError("no id in the answer");
    }

    rows[target].push(id);
  } catch (error) {
    // The page went away before the body was read, or the answer changed.
    rows.unreadable.push(`${path}: ${String(error)}`);
  }
}

/**
 * Records the rows any page of `context` creates through the UI (a category,
 * a filter or a value from the admin's forms, an order from the checkout)
 * from the responses that created them, so teardown deletes exactly those.
 * A request sent with `page.request` is not a page's and is not seen here:
 * the orders it places hold the test's own articles, which teardown follows.
 */
function captureCreatedRows(context: BrowserContext, rows: CreatedRows): void {
  context.on("response", (response) => {
    if (response.request().method() !== "POST" || !response.ok()) {
      return;
    }

    const { pathname } = new URL(response.url());

    if (isCreating(pathname)) {
      rows.pending.push(recordCreated(response, pathname, rows));
    }
  });
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
    await use({
      categoryIds: [],
      filterIds: [],
      filterValueIds: [],
      orderTokens: [],
      pending: [],
      unreadable: [],
    });
  },

  context: async ({ context, createdRows }, use) => {
    captureCreatedRows(context, createdRows);
    await use(context);
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
    captureCreatedRows(context, createdRows);
    const page = await context.newPage();

    await use(page);
    await context.close();
  },

  freshAuthenticatedPage: async (
    { baseURL, browser, createdRows, identity },
    use
  ) => {
    const context = await signIn(browser, requireBaseURL(baseURL), identity);
    captureCreatedRows(context, createdRows);
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
