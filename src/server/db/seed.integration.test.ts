import { eq } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";

import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

import { SEED_USER, seed } from "./seed";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

async function deleteSeedUser() {
  // Cascades to its sessions, accounts and posts.
  await db.delete(user).where(eq(user.email, SEED_USER.email));
}

afterEach(deleteSeedUser);

// Runs the seed against the migrated schema, so a constraint or column the
// seed no longer satisfies fails here instead of in the next fresh worktree.
test("leaves one login that signs in, and a second run changes nothing", async () => {
  // This worker's clone may carry the template's seed user: start without it.
  await deleteSeedUser();

  const first = await seed({ auth, db, nodeEnv: "test" });
  const second = await seed({ auth, db, nodeEnv: "test" });

  expect(first).toMatchObject({ email: SEED_USER.email, createdUser: true });
  expect(second).toEqual({
    email: SEED_USER.email,
    createdUser: false,
    createdPost: false,
  });

  const users = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, SEED_USER.email));
  const signedIn = await auth.api.signInEmail({
    body: { email: SEED_USER.email, password: SEED_USER.password },
  });
  expect(users).toEqual([{ id: signedIn.user.id }]);
});
