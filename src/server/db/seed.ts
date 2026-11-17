import { eq } from "drizzle-orm";

import type { UserRole } from "@/lib/schemas/access";
import { createStoreSchema } from "@/lib/schemas/store";
import { type AccountAuth, createAccount } from "@/server/better-auth/accounts";
import type { DatabaseClient } from "@/server/db";
import { user } from "@/server/db/schema";
import {
  addStoreMember,
  listStoreIdsBySlug,
  setUserRole,
} from "@/server/services/access";
import { createStore, listTakenStoreSlugs } from "@/server/services/store";

import { seedCatalog } from "./seed-catalog";

/** The store that gets the sample catalog: Lucas's. */
const CATALOG_STORE_SLUG = "lr-market";

interface SeedAccount {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  /** The seed stores the login is a member of. */
  stores: string[];
}

/** The documented login of a seeded database: a superadmin. */
export const SEED_USER: SeedAccount = {
  email: "test@example.com",
  name: "Test User",
  password: "password123",
  role: "superadmin",
  stores: [],
};

/**
 * One login per way into the admin (FER-009, FER-013): a member of one store,
 * who lands in it, and a member of two, who picks one. Same password as the
 * superadmin, for local work and e2e only.
 */
export const SEED_MEMBERS: SeedAccount[] = [
  {
    email: "member@example.com",
    name: "Store Member",
    password: "password123",
    role: "member",
    stores: ["lr-market"],
  },
  {
    email: "multi@example.com",
    name: "Two Stores Member",
    password: "password123",
    role: "member",
    stores: ["lr-market", "tienda-demo"],
  },
];

const SEED_ACCOUNTS = [SEED_USER, ...SEED_MEMBERS];

/**
 * Two stores with different palettes, so one deployment shows a store's own
 * colors at each path. The first is Lucas's and the site's default, in the default palette under the
 * project's working name (the brand is FER-006's to decide); the second is a
 * stand-in for the next business. Contact details stay empty: a seed holds
 * nobody's phone number.
 */
export const SEED_STORES = [
  {
    colorAccent: "#c8f31d",
    colorBackground: "#f2f3f0",
    colorContrast: "#111312",
    colorForeground: "#111312",
    colorSurface: "#ffffff",
    currencyCode: "UYU",
    instagramUrl: null,
    isActive: true,
    isDefault: true,
    logoUrl: null,
    name: "LR Market",
    slug: "lr-market",
    tiktokUrl: null,
    translations: [
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
    ],
    whatsappNumber: null,
  },
  {
    colorAccent: "#ff8a3d",
    colorBackground: "#fff4e6",
    colorContrast: "#3d1f47",
    colorForeground: "#26160f",
    colorSurface: "#ffffff",
    currencyCode: "USD",
    instagramUrl: null,
    isActive: true,
    isDefault: false,
    logoUrl: null,
    name: "Tienda Demo",
    slug: "tienda-demo",
    tiktokUrl: null,
    translations: [
      {
        description:
          "Una tienda de ejemplo con otra paleta, para ver cómo cada negocio viste sus propios colores.",
        locale: "es",
        tagline: "Otra tienda, otros colores",
      },
      {
        description:
          "A sample store with another palette, to see how each business wears its own colors.",
        locale: "en",
        tagline: "Another store, other colors",
      },
    ],
    whatsappNumber: null,
  },
];

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
 * seed's logins share one published password and include a superadmin, so a
 * seed pointed at qa's database (to give it the two stores) must not leave
 * them there.
 */
export function isLocalDatabase(databaseUrl: string | undefined): boolean {
  if (!databaseUrl || !URL.canParse(databaseUrl)) {
    return false;
  }

  return LOCAL_DATABASE_HOSTS.has(new URL(databaseUrl).hostname);
}

/**
 * The account with this email, created when it is missing and given its seed
 * role when it is not: a database seeded before roles existed converges.
 */
async function ensureAccount(
  { auth, db }: Pick<SeedOptions, "auth" | "db">,
  account: SeedAccount
): Promise<{ created: boolean; id: string }> {
  const existing = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, account.email),
  });

  if (existing) {
    await setUserRole(db, { role: account.role, userId: existing.id });
    return { created: false, id: existing.id };
  }

  // Through Better Auth's adapter and hasher, so the credential account
  // exists: a user inserted by hand cannot sign in.
  const { email, name, password, role } = account;
  const created = await createAccount(auth, db, {
    email,
    name,
    password,
    role,
  });

  return { created: true, id: created.id };
}

/**
 * Development data: two stores, and on a local database a superadmin and two
 * members who can sign in, with the members' memberships. Safe
 * to run again: whatever already exists is left alone.
 */
export async function seed({ auth, databaseUrl, db, nodeEnv }: SeedOptions) {
  // No override: known passwords and demo rows must never reach production.
  if (nodeEnv === "production") {
    throw new Error("db:seed refuses to run with NODE_ENV=production");
  }

  const accounts = new Map<string, string>();
  const createdAccounts: string[] = [];
  // A remote database (qa) gets the stores and no login: its superadmin is
  // created with `pnpm db:create-superadmin`, with a password nobody knows.
  const seedLogins = isLocalDatabase(databaseUrl);

  for (const account of seedLogins ? SEED_ACCOUNTS : []) {
    const { created, id } = await ensureAccount({ auth, db }, account);
    accounts.set(account.email, id);

    if (created) {
      createdAccounts.push(account.email);
    }
  }

  const takenSlugs = await listTakenStoreSlugs(
    db,
    SEED_STORES.map((store) => store.slug)
  );
  const createdStores: string[] = [];

  for (const seedStore of SEED_STORES) {
    if (!takenSlugs.includes(seedStore.slug)) {
      // Through the same schema as the API, so a seed palette that fails the
      // contrast rules fails here and not on a visitor's screen.
      const created = await createStore(db, createStoreSchema.parse(seedStore));
      createdStores.push(created.slug);
    }
  }

  const storeIds = await listStoreIdsBySlug(
    db,
    SEED_STORES.map((store) => store.slug)
  );

  for (const account of SEED_MEMBERS) {
    const userId = accounts.get(account.email);

    for (const slug of account.stores) {
      const storeId = storeIds.get(slug);

      if (userId && storeId !== undefined) {
        await addStoreMember(db, { storeId, userId });
      }
    }
  }

  const catalogStoreId = storeIds.get(CATALOG_STORE_SLUG);
  // In one transaction: a seed that fails half-way leaves no half catalog,
  // and the next run (which skips a store that has categories) starts over.
  const createdArticles =
    catalogStoreId === undefined
      ? 0
      : await db.transaction(
          async (tx) => await seedCatalog(tx, catalogStoreId)
        );

  return {
    createdAccounts,
    createdArticles,
    createdStores,
  };
}
