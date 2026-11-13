import { describe, expect, test, vi } from "vitest";

import { createQueryClient } from "./query-client";

const { reportError } = vi.hoisted(() => ({ reportError: vi.fn() }));

vi.mock("@/lib/errors/client", () => ({ reportError }));

const failure = new Error("boom");

async function failQuery(meta?: Record<string, unknown>) {
  const client = createQueryClient();
  await client
    .query({
      queryKey: ["failing"],
      queryFn: async () => await Promise.reject(failure),
      retry: false,
      meta,
    })
    .catch(() => null);
}

async function failMutation(
  meta?: Record<string, unknown>,
  onError?: (...args: unknown[]) => void
) {
  const client = createQueryClient();
  await client
    .getMutationCache()
    .build(client, {
      mutationFn: async () => await Promise.reject(failure),
      meta,
      onError,
    })
    .execute("input")
    .catch(() => null);
}

describe("createQueryClient", () => {
  test("keeps a query fresh for one second", () => {
    expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(
      1000
    );
  });

  test.each([
    ["a settled query", "success", true],
    [
      "a pending query, so a streamed prefetch reaches the client",
      "pending",
      true,
    ],
    ["never a failed query", "error", false],
  ])("dehydrates %s", (_case, status, dehydrated) => {
    const shouldDehydrate =
      createQueryClient().getDefaultOptions().dehydrate?.shouldDehydrateQuery;

    expect(shouldDehydrate?.({ state: { status } } as never)).toBe(dehydrated);
  });

  test("creates a new instance on each call", () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });
});

describe("error sinks", () => {
  test("reports a failed query", async () => {
    await failQuery();

    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure, {
      action: "Query.failed",
    });
  });

  test("reports a failed mutation, even one with its own onError", async () => {
    const ownHandler = vi.fn<(...args: unknown[]) => void>();

    await failMutation(undefined, ownHandler);

    expect(ownHandler).toHaveBeenCalledExactlyOnceWith(
      failure,
      "input",
      undefined,
      expect.objectContaining({ meta: undefined })
    );
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure, {
      action: "Mutation.failed",
    });
  });

  test("leaves a failure to a query or mutation that reports it itself", async () => {
    await failQuery({ suppressGlobalErrorReport: true });
    await failMutation({ suppressGlobalErrorReport: true });

    expect(reportError).not.toHaveBeenCalled();
  });
});
