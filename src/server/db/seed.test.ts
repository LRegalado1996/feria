import { describe, expect, test, vi } from "vitest";

import { post } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { seed } from "./seed";

function setup({
  existingUserId,
  postCount = 0,
}: { existingUserId?: string; postCount?: number } = {}) {
  const db = createMockDatabase();
  const auth = {
    api: {
      signUpEmail: vi.fn(async () => ({ user: { id: "seed-user-id" } })),
    },
  };
  db.query.user.findFirst.mockResolvedValue(
    existingUserId ? { id: existingUserId } : undefined
  );
  db.$["select.from"].mockResolvedValue([{ total: postCount }]);

  return {
    auth,
    db,
    run: async (nodeEnv: string | undefined) =>
      await seed({ auth: auth as never, db: db as never, nodeEnv }),
  };
}

describe("seed", () => {
  test("refuses production before touching the database or Better Auth", async () => {
    const { auth, db, run } = setup();

    await expect(run("production")).rejects.toThrow(
      "db:seed refuses to run with NODE_ENV=production"
    );
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
  });

  test.each(["development", "test", undefined])(
    "runs with NODE_ENV %s",
    async (nodeEnv) => {
      const { run } = setup();

      await expect(run(nodeEnv)).resolves.toEqual({
        email: "test@example.com",
        createdUser: true,
        createdPost: true,
      });
    }
  );

  test("signs the documented login up through Better Auth and posts as them on an empty database", async () => {
    const { auth, db, run } = setup();

    await run("development");

    expect(auth.api.signUpEmail).toHaveBeenCalledExactlyOnceWith({
      body: {
        name: "Test User",
        email: "test@example.com",
        password: "password123",
      },
    });
    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(post);
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
      name: "Welcome to the feed!",
      createdById: "seed-user-id",
    });
  });

  test("looks the user up by the seed email", async () => {
    const { db, run } = setup();

    await run("test");

    const lookup = db.query.user.findFirst.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(renderQuery(lookup.where)).toEqual({
      sql: '"user"."email" = $1',
      params: ["test@example.com"],
    });
  });

  test("leaves an existing user and a feed of one post alone on a second run", async () => {
    const { auth, db, run } = setup({
      existingUserId: "existing-id",
      postCount: 1,
    });

    await expect(run("test")).resolves.toEqual({
      email: "test@example.com",
      createdUser: false,
      createdPost: false,
    });
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("posts as an existing user when the feed is empty", async () => {
    const { auth, db, run } = setup({ existingUserId: "existing-id" });

    await expect(run("test")).resolves.toEqual({
      email: "test@example.com",
      createdUser: false,
      createdPost: true,
    });
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
      name: "Welcome to the feed!",
      createdById: "existing-id",
    });
  });
});
