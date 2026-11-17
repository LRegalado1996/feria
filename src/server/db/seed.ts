import { eq } from "drizzle-orm";

import { type AccountAuth, createAccount } from "@/server/better-auth/accounts";
import type { DatabaseClient } from "@/server/db";
import { user } from "@/server/db/schema";
import { addMissingStoreTexts, findStore } from "@/server/services/store";

import { seedCatalog, seedCatalogPages } from "./seed-catalog";

interface SeedAccount {
  email: string;
  name: string;
  password: string;
}

/**
 * The documented login of a seeded database. Every login is an admin
 * (FER-038), so one is enough for local work and e2e.
 */
export const SEED_USER: SeedAccount = {
  email: "test@example.com",
  name: "Test User",
  password: "password123",
};

/**
 * The store's texts (FER-038: the store is the table's one row, which the
 * migrations create). Contact details stay empty: a seed holds nobody's
 * phone number.
 */
export const SEED_STORE_TEXTS = [
  {
    description:
      "Burbujeros y joyas: cadenas, anillos, aros y pulseras. Encontranos en la feria navideña y pedí desde acá.",
    locale: "es",
    tagline: "Burbujeros y joyas en la feria",
  },
  {
    description:
      "Bubble guns and jewelry: chains, rings, earrings and bracelets. Find us at the Christmas fair and order from here.",
    locale: "en",
    tagline: "Bubble guns and jewelry at the fair",
  },
] as const;

interface SeedOptions {
  auth: AccountAuth;
  /** Where the seed writes: logins with a known password only go to a local one. */
  databaseUrl: string | undefined;
  db: DatabaseClient;
  nodeEnv: string | undefined;
}

/**
 * Hosts that can only be this machine or a container beside it (Docker
 * Compose's `db`, CI's `postgres` service). qa and previews live on Neon.
 */
const LOCAL_DATABASE_HOSTS = new Set([
  "127.0.0.1",
  "::1",
  "[::1]",
  "db",
  "localhost",
  "postgres",
]);

/**
 * Whether `databaseUrl` points at a database only this machine reaches. The
 * seed's login has a published password, so a seed pointed at qa's database
 * (to give it the sample catalog) must not leave it there.
 */
export function isLocalDatabase(databaseUrl: string | undefined): boolean {
  if (!databaseUrl || !URL.canParse(databaseUrl)) {
    return false;
  }

  return LOCAL_DATABASE_HOSTS.has(new URL(databaseUrl).hostname);
}

/** The account with this email, created when it is missing. */
async function ensureAccount(
  { auth, db }: Pick<SeedOptions, "auth" | "db">,
  account: SeedAccount
): Promise<boolean> {
  const existing = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, account.email),
  });

  if (existing) {
    return false;
  }

  // Through Better Auth's adapter and hasher, so the credential account
  // exists: a user inserted by hand cannot sign in.
  await createAccount(auth, db, {
    email: account.email,
    name: account.name,
    password: account.password,
  });

  return true;
}

/**
 * Development data: the store's texts and its sample catalog, and on a local
 * database a login that can sign in. Safe to run again: whatever already
 * exists is left alone.
 */
export async function seed({ auth, databaseUrl, db, nodeEnv }: SeedOptions) {
  // No override: known passwords and demo rows must never reach production.
  if (nodeEnv === "production") {
    throw new Error("db:seed refuses to run with NODE_ENV=production");
  }

  const store = await findStore(db);

  if (!store) {
    throw new Error("db:seed found no store: run the migrations first");
  }

  // A remote database (qa) gets no login: its first one is created with
  // `pnpm db:create-superadmin`, with a password nobody knows.
  const createdAccounts =
    isLocalDatabase(databaseUrl) &&
    (await ensureAccount({ auth, db }, SEED_USER))
      ? [SEED_USER.email]
      : [];
  const createdStoreTexts = await addMissingStoreTexts(db, {
    storeId: store.id,
    translations: SEED_STORE_TEXTS,
  });
  // In one transaction: a seed that fails half-way leaves no half catalog,
  // and the next run (which skips a store that has categories) starts over.
  // The catalog's pages (FER-043) come after it, and also reach a catalog
  // seeded before them.
  const { catalogPages, createdArticles } = await db.transaction(
    async (tx) => ({
      createdArticles: await seedCatalog(tx, store.id),
      catalogPages: await seedCatalogPages(tx, store.id),
    })
  );

  return { catalogPages, createdAccounts, createdArticles, createdStoreTexts };
}
