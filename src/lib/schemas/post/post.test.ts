import { describe, expect, test } from "vitest";

import {
  createPostSchema,
  deletePostSchema,
  getPostsSchema,
  POST_NAME_MAX_LENGTH,
} from ".";

/** The path of every issue a rejected parse reports, `[]` when it parsed. */
function issuePaths(result: {
  error?: { issues: { path: PropertyKey[] }[] };
}): PropertyKey[][] {
  return result.error?.issues.map((issue) => issue.path) ?? [];
}

describe("createPostSchema", () => {
  test("accepts a post and trims the surrounding whitespace", () => {
    expect(createPostSchema.parse({ name: "  My First Post \n" })).toEqual({
      name: "My First Post",
    });
  });

  test("accepts a post at the length limit, counted after trimming", () => {
    const atLimit = "A".repeat(POST_NAME_MAX_LENGTH);

    expect(createPostSchema.parse({ name: ` ${atLimit} ` })).toEqual({
      name: atLimit,
    });
  });

  test.each([
    ["an empty post", "", "Title is required"],
    ["a whitespace-only post", " \t\n ", "Title is required"],
    [
      "a post one character over the limit",
      "A".repeat(POST_NAME_MAX_LENGTH + 1),
      `Keep it to ${POST_NAME_MAX_LENGTH} characters`,
    ],
  ])("rejects %s", (_case, name, message) => {
    const result = createPostSchema.safeParse({ name });

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["name"], message }),
    ]);
  });

  test("rejects a missing name", () => {
    expect(issuePaths(createPostSchema.safeParse({}))).toEqual([["name"]]);
  });
});

describe("getPostsSchema", () => {
  test("starts the feed without a cursor", () => {
    expect(getPostsSchema.parse({})).toEqual({});
  });

  test.each([
    ["an id of 1, the smallest", 1, 1],
    ["query-string text", "42", 42],
  ])("reads the cursor's createdAt and id, from %s", (_case, id, expected) => {
    expect(
      getPostsSchema.parse({
        cursor: { createdAt: "2024-06-15T12:00:00.123Z", id },
      })
    ).toEqual({
      cursor: { createdAt: new Date("2024-06-15T12:00:00.123Z"), id: expected },
    });
  });

  test.each([
    ["an invalid date", { createdAt: "yesterday", id: 1 }, "createdAt"],
    ["a zero id", { createdAt: "2024-06-15T12:00:00Z", id: 0 }, "id"],
    ["a fractional id", { createdAt: "2024-06-15T12:00:00Z", id: 1.5 }, "id"],
    ["no id", { createdAt: "2024-06-15T12:00:00Z" }, "id"],
  ])("rejects a cursor with %s", (_case, cursor, field) => {
    expect(issuePaths(getPostsSchema.safeParse({ cursor }))).toEqual([
      ["cursor", field],
    ]);
  });
});

describe("deletePostSchema", () => {
  test.each([
    [1, 1],
    [7, 7],
    ["7", 7],
  ])("reads the id %j, also from a path segment", (id, expected) => {
    expect(deletePostSchema.parse({ id })).toEqual({ id: expected });
  });

  test.each([
    ["zero", 0],
    ["a negative id", -1],
    ["a fraction", 1.5],
    ["text", "abc"],
  ])("rejects %s", (_case, id) => {
    expect(issuePaths(deletePostSchema.safeParse({ id }))).toEqual([["id"]]);
  });
});
