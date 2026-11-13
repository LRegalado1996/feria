import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";
import { z } from "zod";

// Drizzle's migrator applies a journal entry only when its `when` is newer
// than the last migration the database applied, and skips older ones
// silently: a migration generated on a parallel branch and merged after a
// newer one never runs, and the next deploy fails on a missing table. When
// this fails, delete your migration (SQL and snapshot), rebase and run
// `pnpm db:generate` again. Never hand-edit `idx`, `when` or the file name.

const journalSchema = z.object({
  entries: z.array(
    z.object({ idx: z.number(), when: z.number(), tag: z.string() })
  ),
});

const { entries } = journalSchema.parse(
  JSON.parse(
    readFileSync(new URL("meta/_journal.json", import.meta.url), "utf-8")
  )
);

describe("migration journal", () => {
  test("numbers its entries 0, 1, 2… in file order", () => {
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((entry) => entry.idx)).toEqual(
      entries.map((_entry, position) => position)
    );
  });

  test("stamps every entry later than the one before it", () => {
    const stampedTooEarly = entries
      .filter(
        (entry, position) =>
          position > 0 &&
          entry.when <=
            (entries[position - 1]?.when ?? Number.NEGATIVE_INFINITY)
      )
      .map((entry) => entry.tag);

    expect(stampedTooEarly).toEqual([]);
  });
});
