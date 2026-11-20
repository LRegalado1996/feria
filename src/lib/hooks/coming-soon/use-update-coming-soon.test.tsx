import { noop } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { comingSoonKey } from "./use-coming-soon";
import { useUpdateComingSoon } from "./use-update-coming-soon";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

const INPUT = {
  countdownTo: "2026-12-20",
  translations: [
    {
      eyebrow: null,
      headline: "Abrimos",
      lead: "Te esperamos.",
      locale: "es" as const,
      marquee: null,
    },
  ],
};

const LOADED = { countdownTo: null, published: true, translations: [] };

/** The page as `comingSoon.update` answers it: what was sent, and the switch. */
const SAVED = { ...INPUT, published: true };

function setup({
  fails = false,
  answered = Promise.resolve(),
}: {
  /** Settles when the server may answer the save. */
  answered?: Promise<void>;
  fails?: boolean;
} = {}) {
  const update = vi.fn((_input: unknown) => SAVED);
  server.use(
    fails
      ? createOrpcErrorHandler("comingSoon.update", {
          code: "BAD_REQUEST",
          message: "Input validation failed",
          status: 400,
        })
      : createOrpcHandler("comingSoon.update", async (input) => {
          await answered;

          return update(input);
        })
  );
  const wrapper = createQueryWrapper();
  wrapper.queryClient.setQueryData(comingSoonKey(), LOADED);
  const { result } = renderHook(() => useUpdateComingSoon(), { wrapper });
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return { metas, queryClient: wrapper.queryClient, result, update };
}

describe("useUpdateComingSoon", () => {
  test("sends the texts and the day, and the saved page becomes the screen's copy", async () => {
    const { queryClient, result, update } = setup();

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual(SAVED);

    expect(update).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(queryClient.getQueryData(comingSoonKey())).toEqual(SAVED);
  });

  test("a read answered before the save and landing after it never puts the old texts back", async () => {
    const { queryClient, result } = setup();
    const answers: ((page: typeof LOADED) => void)[] = [];
    const stale = queryClient
      .query({
        queryFn: async () =>
          await new Promise<typeof LOADED>((resolve) => {
            answers.push(resolve);
          }),
        queryKey: comingSoonKey(),
        staleTime: 0,
      })
      .catch(noop);

    await result.current.mutateAsync(INPUT);
    for (const answer of answers) {
      answer(LOADED);
    }
    await stale;

    expect(queryClient.getQueryData(comingSoonKey())).toEqual(SAVED);
  });

  test("a flip that lands while the save travels keeps its switch: the save's answer brings only the texts", async () => {
    const release: { answer: () => void } = { answer: () => undefined };
    const { queryClient, result, update } = setup({
      answered: new Promise<void>((resolve) => {
        release.answer = resolve;
      }),
    });

    const saving = result.current.mutateAsync(INPUT);
    await vi.waitFor(() => {
      expect(update).not.toHaveBeenCalled();
      expect(result.current.isPending).toBe(true);
    });
    // The store was opened while the save was on its way.
    queryClient.setQueryData(comingSoonKey(), { ...LOADED, published: false });
    release.answer();
    await saving;

    expect(queryClient.getQueryData(comingSoonKey())).toEqual({
      ...SAVED,
      published: false,
    });
  });

  test("rejects a refused save with its code, keeps the copy it had, and leaves the report to the screen", async () => {
    const { metas, queryClient, result } = setup({ fails: true });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });

    expect(queryClient.getQueryData(comingSoonKey())).toEqual(LOADED);
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
