import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { useCountVisit } from "./use-count-visit";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// When and how often it sends is `use-count-once.test.tsx`'s: here it hands
// over the key and the send it was given.
const { countOnce } = vi.hoisted(() => ({
  countOnce:
    vi.fn<(key: string, send: (onCounted: () => void) => void) => void>(),
}));

vi.mock("./use-count-once", () => ({ useCountOnce: countOnce }));

function setup({ answer = "ok" }: { answer?: "fail" | "ok" } = {}) {
  const count = vi.fn((_input: unknown) => null);
  server.use(
    answer === "fail"
      ? createOrpcErrorHandler("metrics.countVisit", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
          status: 500,
        })
      : createOrpcHandler("metrics.countVisit", count)
  );
  const wrapper = createQueryWrapper();
  renderHook(
    () => {
      useCountVisit();
    },
    { wrapper }
  );
  const onCounted = vi.fn<() => void>();

  return {
    count,
    key: () => countOnce.mock.calls[0]?.[0],
    mutations: () => wrapper.queryClient.getMutationCache().getAll(),
    onCounted,
    send: () => {
      act(() => {
        countOnce.mock.calls[0]?.[1](onCounted);
      });
    },
  };
}

describe("useCountVisit", () => {
  test("counts the visit once per session under its own key", () => {
    const { key } = setup();

    expect(key()).toBe("lr-visited");
  });

  test("sends no input, and marks the visit counted once the server answers", async () => {
    const { count, onCounted, send } = setup();

    send();

    await waitFor(() => {
      expect(onCounted).toHaveBeenCalledExactlyOnceWith();
    });
    expect(count).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  test("leaves a failure unmarked and unreported: a blocker is not a bug", async () => {
    const { mutations, onCounted, send } = setup({ answer: "fail" });

    send();

    await waitFor(() => {
      expect(mutations().map((mutation) => mutation.state.status)).toEqual([
        "error",
      ]);
    });
    expect(onCounted).not.toHaveBeenCalled();
    expect(mutations().map((mutation) => mutation.meta)).toEqual([
      { suppressGlobalErrorReport: true },
    ]);
  });
});
