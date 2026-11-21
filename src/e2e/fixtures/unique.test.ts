import { describe, expect, test, vi } from "vitest";

import { phoneSequence } from "./unique";

/**
 * `count` phones as the specs of the worker at parallel index `slot` get
 * them: Playwright sets `TEST_PARALLEL_INDEX` before a worker loads a spec.
 */
async function phonesOfWorker(slot: string, count: number) {
  vi.resetModules();
  vi.stubEnv("TEST_PARALLEL_INDEX", slot);
  const { uniquePhone } = await import("./unique");

  return Array.from({ length: count }, () => uniquePhone());
}

/** The values `values` holds more than once. */
function repeated(values: string[]): string[] {
  const seen = new Set<string>();

  return values.filter((value) => {
    const again = seen.has(value);
    seen.add(value);

    return again;
  });
}

describe("uniquePhone", () => {
  // Twenty thousand draws of seven random digits repeat one almost surely
  // (1 - e^-20): what a short random number gives.
  test("never hands one worker the same phone twice", async () => {
    const phones = await phonesOfWorker("0", 20_000);

    expect(repeated(phones.map((phone) => phone.national))).toEqual([]);
  });

  test("never hands two workers that run at once the same phone", async () => {
    const first = new Set(
      (await phonesOfWorker("0", 20_000)).map((phone) => phone.national)
    );
    const second = (await phonesOfWorker("1", 20_000)).map(
      (phone) => phone.national
    );

    expect(second.filter((national) => first.has(national))).toEqual([]);
  });

  test("writes a phone of the worker's block in the three forms the specs use", async () => {
    const [phone] = await phonesOfWorker("7", 1);
    const digits = phone?.international.slice("+5989".length) ?? "";

    expect(digits).toMatch(/^07\d{5}$/u);
    expect(phone).toEqual({
      international: `+5989${digits}`,
      local: `09${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4)}`,
      national: `9${digits}`,
    });
  });
});

describe("phoneSequence", () => {
  test("counts through its block from the start, wrapping inside it", () => {
    const issue = phoneSequence(42, 99_998);

    expect([issue(), issue(), issue()]).toEqual([
      "4299998",
      "4299999",
      "4200000",
    ]);
  });

  test.each([
    [0, "0000000"],
    [99, "9900000"],
  ])("gives worker %i its block", (slot, first) => {
    expect(phoneSequence(slot, 0)()).toBe(first);
  });

  test.each([-1, 100, 1.5])("refuses worker %d, which has no block", (slot) => {
    expect(phoneSequence(slot, 0)).toThrow(
      `Worker ${slot} has no block of phones: they hold 100 workers`
    );
  });

  test("hands out its whole block once, then refuses", () => {
    const issue = phoneSequence(3, 0);
    const block = Array.from({ length: 100_000 }, () => issue());

    expect([block[0], block.at(-1), repeated(block)]).toEqual([
      "0300000",
      "0399999",
      [],
    ]);
    expect(issue).toThrow("Worker 3 handed out every phone it holds");
  });
});
