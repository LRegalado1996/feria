import { count, eq } from "drizzle-orm";

import type { auth as appAuth } from "@/server/better-auth";
import type { DatabaseClient } from "@/server/db";
import { post, user } from "@/server/db/schema";

/** The login a seeded development database accepts. */
export const SEED_USER = {
  name: "Test User",
  email: "test@example.com",
  password: "password123",
};

interface SeedOptions {
  auth: { api: Pick<typeof appAuth.api, "signUpEmail"> };
  db: DatabaseClient;
  nodeEnv: string | undefined;
}

/**
 * Development data: a user who can sign in, and a first post. Safe to run
 * again: whatever already exists is left alone.
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

  return {
    email: SEED_USER.email,
    createdUser: !existing,
    createdPost: createPost,
  };
}
