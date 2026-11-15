import { count, eq } from "drizzle-orm";

import type { UserRole } from "@/lib/schemas/access";
import { createStoreSchema } from "@/lib/schemas/store";
import { type AccountAuth, createAccount } from "@/server/better-auth/accounts";
import type { DatabaseClient } from "@/server/db";
import { post, user } from "@/server/db/schema";
import {
  addStoreMember,
  listStoreIdsBySlug,
  setUserRole,
} from "@/server/services/access";
import { createStore, listTakenStoreSlugs } from "@/server/services/store";

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
  db: DatabaseClient;
  nodeEnv: string | undefined;
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
  const created = await createAccount(auth, { email, name, password, role });

  return { created: true, id: created.id };
}

/**
 * Development data: a superadmin and two members who can sign in, a first
 * post and two stores the members belong to. Safe to run again: whatever
 * already exists is left alone.
 */
export async function seed({ auth, db, nodeEnv }: SeedOptions) {
  // No override: known passwords and demo rows must never reach production.
  if (nodeEnv === "production") {
    throw new Error("db:seed refuses to run with NODE_ENV=production");
  }

  const accounts = new Map<string, string>();
  const createdAccounts: string[] = [];

  for (const account of SEED_ACCOUNTS) {
    const { created, id } = await ensureAccount({ auth, db }, account);
    accounts.set(account.email, id);

    if (created) {
      createdAccounts.push(account.email);
    }
  }

  const [posts] = await db.select({ total: count() }).from(post);
  const createPost = (posts?.total ?? 0) === 0;
  const authorId = accounts.get(SEED_USER.email);

  if (createPost && authorId) {
    await db
      .insert(post)
      .values({ name: "Welcome to the feed!", createdById: authorId });
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

  return { createdAccounts, createdPost: createPost, createdStores };
}
