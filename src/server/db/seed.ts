import { count, eq } from "drizzle-orm";

import { createStoreSchema } from "@/lib/schemas/store";
import type { auth as appAuth } from "@/server/better-auth";
import type { DatabaseClient } from "@/server/db";
import { post, user } from "@/server/db/schema";
import { createStore, listTakenStoreSlugs } from "@/server/services/store";

/** The login a seeded development database accepts. */
export const SEED_USER = {
  name: "Test User",
  email: "test@example.com",
  password: "password123",
};

/**
 * Two stores with different palettes, so one deployment shows a store's own
 * colors at each path. The first is Lucas's, in the default palette under the
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
  auth: { api: Pick<typeof appAuth.api, "signUpEmail"> };
  db: DatabaseClient;
  nodeEnv: string | undefined;
}

/**
 * Development data: a user who can sign in, a first post and two stores. Safe
 * to run again: whatever already exists is left alone.
 */
export async function seed({ auth, db, nodeEnv }: SeedOptions) {
  // No override: a known password and demo rows must never reach production.
  if (nodeEnv === "production") {
    throw new Error("db:seed refuses to run with NODE_ENV=production");
  }

  const existing = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, SEED_USER.email),
  });
  // Through Better Auth, so the password is hashed its way and the
  // credential account exists: a user inserted by hand cannot sign in.
  const userId =
    existing?.id ??
    (await auth.api.signUpEmail({ body: { ...SEED_USER } })).user.id;

  const [posts] = await db.select({ total: count() }).from(post);
  const createPost = (posts?.total ?? 0) === 0;

  if (createPost) {
    await db
      .insert(post)
      .values({ name: "Welcome to the feed!", createdById: userId });
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

  return {
    email: SEED_USER.email,
    createdUser: !existing,
    createdPost: createPost,
    createdStores,
  };
}
