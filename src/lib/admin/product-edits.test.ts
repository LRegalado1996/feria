import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import { makeProductForm } from "@/test/factories/store-product";

import {
  dropProductEdits,
  keepProductEdits,
  PRODUCT_EDITS_MAX_AGE_MS,
  productEditsKey,
  restoreProductEdits,
} from "./product-edits";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const UPDATED_AT = "2026-11-15T09:30:00.000Z";
/** When the copy's first change was kept, and "now" an hour later. */
const STARTED_AT = "2026-11-16T10:00:00.000Z";
const NOW = new Date("2026-11-16T11:00:00.000Z");

/**
 * A browser storage, or one that refuses every call with `refuses`, or
 * reads but refuses every write with `refusesWrites`.
 */
function setup({
  refuses,
  refusesWrites,
  stored,
}: {
  refuses?: Error;
  refusesWrites?: Error;
  stored?: Record<string, string>;
} = {}) {
  const items = new Map(Object.entries(stored ?? {}));
  const localStorage = {
    getItem: vi.fn((key: string) => {
      if (refuses) {
        throw refuses;
      }
      return items.get(key) ?? null;
    }),
    removeItem: vi.fn((key: string) => {
      if (refuses) {
        throw refuses;
      }
      items.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      const refusal = refuses ?? refusesWrites;

      if (refusal) {
        throw refusal;
      }
      items.set(key, value);
    }),
  };
  vi.stubGlobal("window", { localStorage });

  return { items, localStorage };
}

function stored(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    baseUpdatedAt: UPDATED_AT,
    startedAt: STARTED_AT,
    values: makeProductForm({ price: 1500 }),
    version: 2,
    ...overrides,
  });
}

describe("productEditsKey", () => {
  test("keys the copy by the article's id", () => {
    expect(productEditsKey(12)).toBe("feria:product-edit:12");
  });
});

describe("keepProductEdits", () => {
  test("stores the form with the change time it was typed over, and when its first change was", () => {
    const { items } = setup();
    const values = makeProductForm({ price: 1500 });

    keepProductEdits(12, new Date(UPDATED_AT), values, NOW);

    expect(JSON.parse(items.get("feria:product-edit:12") ?? "")).toEqual({
      baseUpdatedAt: UPDATED_AT,
      startedAt: NOW.toISOString(),
      values,
      version: 2,
    });
  });

  test("keeps when the first change was made as later changes are kept", () => {
    const { items } = setup({ stored: { "feria:product-edit:12": stored() } });
    const values = makeProductForm({ price: 1700 });

    keepProductEdits(12, UPDATED_AT, values, NOW);

    expect(JSON.parse(items.get("feria:product-edit:12") ?? "")).toEqual({
      baseUpdatedAt: UPDATED_AT,
      startedAt: STARTED_AT,
      values,
      version: 2,
    });
  });

  test.each([
    [
      "a copy typed over another version of the article",
      stored({ baseUpdatedAt: "2026-11-14T09:30:00.000Z" }),
    ],
    ["a copy that does not read", stored({ version: 1 })],
    ["text that is no JSON", "{not json"],
  ])("starts the clock again over %s", (_case, text) => {
    const { items } = setup({ stored: { "feria:product-edit:12": text } });

    keepProductEdits(12, UPDATED_AT, makeProductForm(), NOW);

    expect(JSON.parse(items.get("feria:product-edit:12") ?? "")).toMatchObject({
      startedAt: NOW.toISOString(),
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  test("reports a browser that reads but refuses to store it, and goes on", () => {
    const refusal = new DOMException("full", "QuotaExceededError");
    const { items, localStorage } = setup({
      refusesWrites: refusal,
      stored: { "feria:product-edit:12": stored() },
    });

    keepProductEdits(12, UPDATED_AT, makeProductForm(), NOW);

    expect(localStorage.getItem).toHaveBeenCalledExactlyOnceWith(
      "feria:product-edit:12"
    );
    expect(localStorage.setItem).toHaveBeenCalledExactlyOnceWith(
      "feria:product-edit:12",
      JSON.stringify({
        baseUpdatedAt: UPDATED_AT,
        startedAt: STARTED_AT,
        values: makeProductForm(),
        version: 2,
      })
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(refusal, {
      action: "Product.keep_local_edits",
    });
    expect(items.get("feria:product-edit:12")).toBe(stored());
  });
});

describe("restoreProductEdits", () => {
  test("restores what was typed over the article as it still is", () => {
    setup({ stored: { "feria:product-edit:12": stored() } });

    expect(restoreProductEdits(12, new Date(UPDATED_AT), NOW)).toEqual({
      kind: "restored",
      values: makeProductForm({ price: 1500 }),
    });
  });

  test("restores values the form refuses, for the form to say why, rather than lose every change", () => {
    const values = {
      ...makeProductForm({ price: 12.345 }),
      es: { description: "", title: "a".repeat(121) },
    };
    setup({ stored: { "feria:product-edit:12": stored({ values }) } });

    expect(restoreProductEdits(12, UPDATED_AT, NOW)).toEqual({
      kind: "restored",
      values,
    });
  });

  test.each([
    ["exactly a day after its first change", 0, "restored"],
    ["a millisecond past a day", 1, "expired"],
  ] as const)("a copy read %s is %s", (_case, past, kind) => {
    const { items } = setup({ stored: { "feria:product-edit:12": stored() } });
    const now = new Date(
      new Date(STARTED_AT).getTime() + PRODUCT_EDITS_MAX_AGE_MS + past
    );

    expect(restoreProductEdits(12, UPDATED_AT, now).kind).toBe(kind);
    expect(items.has("feria:product-edit:12")).toBe(kind === "restored");
  });

  test("a copy lasts one day, under the two the orphan cleanup spares a photo", () => {
    expect(PRODUCT_EDITS_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });

  test("finds none for another article", () => {
    setup({ stored: { "feria:product-edit:12": stored() } });

    expect(restoreProductEdits(13, UPDATED_AT)).toEqual({ kind: "none" });
  });

  test("drops a copy typed over an older version of the article and says so", () => {
    const { items } = setup({ stored: { "feria:product-edit:12": stored() } });

    expect(restoreProductEdits(12, "2026-11-15T09:30:00.001Z", NOW)).toEqual({
      kind: "stale",
    });
    expect(items.has("feria:product-edit:12")).toBe(false);
  });

  test.each([
    ["text that is no JSON", "{not json"],
    ["another version", stored({ version: 1 })],
    ["no time for its first change", stored({ startedAt: undefined })],
    [
      "a text past any field's bound",
      stored({
        values: {
          ...makeProductForm(),
          es: { description: "a".repeat(20_001), title: "" },
        },
      }),
    ],
    ["a price of the wrong type", stored({ values: { price: "12" } })],
    ["a change time that is no date", stored({ baseUpdatedAt: "yesterday" })],
  ])("drops %s and counts it as none, unreported", (_case, text) => {
    const { items } = setup({ stored: { "feria:product-edit:12": text } });

    expect(restoreProductEdits(12, UPDATED_AT)).toEqual({ kind: "none" });
    expect(items.has("feria:product-edit:12")).toBe(false);
    expect(reportError).not.toHaveBeenCalled();
  });

  test("reports a storage that refuses to be read, and counts it as none", () => {
    const refusal = new DOMException("denied", "SecurityError");
    setup({ refuses: refusal });

    expect(restoreProductEdits(12, UPDATED_AT)).toEqual({ kind: "none" });
    expect(vi.mocked(reportError).mock.calls).toEqual([
      [refusal, { action: "Product.read_local_edits" }],
      [refusal, { action: "Product.drop_local_edits" }],
    ]);
  });

  test("reports a browser without storage at all, and counts it as none", () => {
    const refusal = new DOMException("denied", "SecurityError");
    vi.stubGlobal("window", {
      get localStorage() {
        throw refusal;
      },
    });

    expect(restoreProductEdits(12, UPDATED_AT)).toEqual({ kind: "none" });
    expect(reportError).toHaveBeenCalledWith(refusal, {
      action: "Product.read_local_edits",
    });
  });
});

describe("dropProductEdits", () => {
  test("forgets the article's copy and only it", () => {
    const { items } = setup({
      stored: {
        "feria:product-edit:12": stored(),
        "feria:product-edit:13": stored(),
      },
    });

    dropProductEdits(12);

    expect([...items.keys()]).toEqual(["feria:product-edit:13"]);
  });
});
