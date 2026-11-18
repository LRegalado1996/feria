import { describe, expect, test, vi } from "vitest";

import { reportError } from "@/lib/errors/client";
import { makeProductForm } from "@/test/factories/store-product";

import {
  dropProductEdits,
  keepProductEdits,
  productEditsKey,
  restoreProductEdits,
} from "./product-edits";

vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const UPDATED_AT = "2026-11-15T09:30:00.000Z";

/** A browser storage, or one that refuses every call with `refuses`. */
function setup({
  refuses,
  stored,
}: { refuses?: Error; stored?: Record<string, string> } = {}) {
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
      if (refuses) {
        throw refuses;
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
    values: makeProductForm({ price: 1500 }),
    version: 1,
    ...overrides,
  });
}

describe("productEditsKey", () => {
  test("keys the copy by the article's id", () => {
    expect(productEditsKey(12)).toBe("feria:product-edit:12");
  });
});

describe("keepProductEdits", () => {
  test("stores the form with the change time it was typed over", () => {
    const { items } = setup();
    const values = makeProductForm({ price: 1500 });

    keepProductEdits(12, new Date(UPDATED_AT), values);

    expect(JSON.parse(items.get("feria:product-edit:12") ?? "")).toEqual({
      baseUpdatedAt: UPDATED_AT,
      values,
      version: 1,
    });
  });

  test("reports a browser that refuses to store it, and goes on", () => {
    const refusal = new DOMException("full", "QuotaExceededError");
    setup({ refuses: refusal });

    keepProductEdits(12, UPDATED_AT, makeProductForm());

    expect(reportError).toHaveBeenCalledExactlyOnceWith(refusal, {
      action: "Product.keep_local_edits",
    });
  });
});

describe("restoreProductEdits", () => {
  test("restores what was typed over the article as it still is", () => {
    setup({ stored: { "feria:product-edit:12": stored() } });

    expect(restoreProductEdits(12, new Date(UPDATED_AT))).toEqual({
      kind: "restored",
      values: makeProductForm({ price: 1500 }),
    });
  });

  test("finds none for another article", () => {
    setup({ stored: { "feria:product-edit:12": stored() } });

    expect(restoreProductEdits(13, UPDATED_AT)).toEqual({ kind: "none" });
  });

  test("drops a copy typed over an older version of the article and says so", () => {
    const { items } = setup({ stored: { "feria:product-edit:12": stored() } });

    expect(restoreProductEdits(12, "2026-11-15T09:30:00.001Z")).toEqual({
      kind: "stale",
    });
    expect(items.has("feria:product-edit:12")).toBe(false);
  });

  test.each([
    ["text that is no JSON", "{not json"],
    ["another version", stored({ version: 2 })],
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
