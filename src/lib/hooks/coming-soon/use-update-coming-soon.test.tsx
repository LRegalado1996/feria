import { noop } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { comingSoonKey, useComingSoon } from "./use-coming-soon";
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

/**
 * The save, on a screen that shows the page (`comingSoon.get`, which answers
 * the page as the server holds it: `stored.page`, the loaded one until a
 * test changes it), once that first read has settled.
 */
async function setup({
  fails = false,
  answered = Promise.resolve(),
}: {
  /** Settles when the server may answer the save. */
  answered?: Promise<void>;
  fails?: boolean;
} = {}) {
  const stored: { page: typeof LOADED | typeof SAVED } = { page: LOADED };
  const update = vi.fn((_input: unknown) => SAVED);
  const get = vi.fn((_input: unknown) => stored.page);
  server.use(
    createOrpcHandler("comingSoon.get", get),
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
  const { result } = renderHook(
    () => ({ page: useComingSoon(), save: useUpdateComingSoon() }),
    { wrapper }
  );
  await waitFor(() => {
    expect(result.current.page.isFetching).toBe(false);
  });
  get.mockClear();
  const metas = () =>
    wrapper.queryClient
      .getMutationCache()
      .getAll()
      .map((mutation) => mutation.meta);

  return {
    get,
    metas,
    queryClient: wrapper.queryClient,
    save: () => result.current.save,
    stored,
    update,
  };
}

describe("useUpdateComingSoon", () => {
  test("sends the texts and the day, and the saved page becomes the screen's copy", async () => {
    const { queryClient, save, stored, update } = await setup();
    stored.page = SAVED;

    await expect(save().mutateAsync(INPUT)).resolves.toEqual(SAVED);

    expect(update).toHaveBeenCalledExactlyOnceWith(INPUT);
    expect(queryClient.getQueryData(comingSoonKey())).toEqual(SAVED);
  });

  test("a read answered before the save and landing after it never puts the old texts back", async () => {
    const { queryClient, save, stored } = await setup();
    stored.page = SAVED;
    const answers: ((page: typeof LOADED) => void)[] = [];
    // The first read hangs until the test answers it; the one after the
    // save asks the server.
    const stale = queryClient
      .query({
        queryFn: async () =>
          answers.length === 0
            ? await new Promise<typeof LOADED>((resolve) => {
                answers.push(resolve);
              })
            : stored.page,
        queryKey: comingSoonKey(),
        staleTime: 0,
      })
      .catch(noop);

    await save().mutateAsync(INPUT);
    for (const answer of answers) {
      answer(LOADED);
    }
    await stale;

    expect(queryClient.getQueryData(comingSoonKey())).toEqual(SAVED);
  });

  test("a flip that lands while the save travels keeps its switch: the save's answer brings only the texts", async () => {
    const release: { answer: () => void } = { answer: () => undefined };
    const { queryClient, save, stored, update } = await setup({
      answered: new Promise<void>((resolve) => {
        release.answer = resolve;
      }),
    });

    const saving = save().mutateAsync(INPUT);
    await vi.waitFor(() => {
      expect(update).not.toHaveBeenCalled();
      expect(save().isPending).toBe(true);
    });
    // The store was opened while the save was on its way, after the save
    // read the switch it answers.
    stored.page = { ...SAVED, published: false };
    queryClient.setQueryData(comingSoonKey(), { ...LOADED, published: false });
    // Every switch the screen shows from here on, the read again included.
    const shown = new Set<boolean>();
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      const page = queryClient.getQueryData(comingSoonKey());

      if (page) {
        shown.add(page.published);
      }
    });
    release.answer();
    await saving;
    unsubscribe();

    expect(shown).toEqual(new Set([false]));
    expect(queryClient.getQueryData(comingSoonKey())).toEqual({
      ...SAVED,
      published: false,
    });
  });

  test("a switch flipped elsewhere before the save shows once the save settles: the page is read again", async () => {
    const { get, queryClient, save, stored } = await setup();
    // Another admin opened the store; this screen still says closed.
    stored.page = { ...SAVED, published: false };

    await save().mutateAsync(INPUT);

    expect(get).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(queryClient.getQueryData(comingSoonKey())).toEqual({
      ...SAVED,
      published: false,
    });
  });

  test("rejects a refused save with its code, keeps the copy it had, and leaves the report to the screen", async () => {
    const { get, metas, queryClient, save } = await setup({ fails: true });

    await expect(save().mutateAsync(INPUT)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });

    expect(get).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(comingSoonKey())).toEqual(LOADED);
    expect(metas()).toEqual([{ suppressGlobalErrorReport: true }]);
  });
});
