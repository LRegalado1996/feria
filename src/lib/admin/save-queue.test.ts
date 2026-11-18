import { describe, expect, test, vi } from "vitest";

import { createSaveQueue, type SaveQueueStatus } from "./save-queue";

/**
 * A queue whose saves wait until the test answers them, one by one, in the
 * order they were sent; a save of a value listed in `failing` is refused.
 */
function setup({ failing = [] as string[] } = {}) {
  const pending: { resolve: () => void; values: string }[] = [];
  const save = vi.fn(
    async (values: string) =>
      await new Promise<void>((resolve, reject) => {
        pending.push({
          resolve: () => {
            if (failing.includes(values)) {
              reject(new Error(`refused ${values}`));
            } else {
              resolve();
            }
          },
          values,
        });
      })
  );
  const statuses: [SaveQueueStatus, unknown][] = [];
  const queue = createSaveQueue<string>({
    onStatus: (status, error) => {
      statuses.push([status, error]);
    },
    save,
  });

  /** Answers the oldest save still waiting, then lets the queue move on. */
  const answer = async () => {
    pending.shift()?.resolve();
    // A macrotask: every promise the answer settles has run by then.
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  };

  return { answer, pending, queue, save, statuses };
}

describe("createSaveQueue", () => {
  test("saves what it is given and says saving, then saved", async () => {
    const { answer, queue, save, statuses } = setup();

    queue.enqueue("a");
    expect(queue.status()).toBe("saving");
    await answer();

    expect(save).toHaveBeenCalledExactlyOnceWith("a");
    expect(statuses).toEqual([
      ["saving", undefined],
      ["saved", undefined],
    ]);
    expect(queue.status()).toBe("saved");
  });

  test("never sends a second save while one travels, and sends only the latest of what came meanwhile", async () => {
    const { answer, pending, queue, save } = setup();

    queue.enqueue("a");
    queue.enqueue("b");
    queue.enqueue("c");

    expect(save.mock.calls).toEqual([["a"]]);
    expect(pending.map((call) => call.values)).toEqual(["a"]);

    await answer();
    expect(save.mock.calls).toEqual([["a"], ["c"]]);

    await answer();
    expect(save.mock.calls).toEqual([["a"], ["c"]]);
    expect(queue.status()).toBe("saved");
  });

  test("stops on a failure and says why, keeping the values for a retry", async () => {
    const { answer, queue, save, statuses } = setup({ failing: ["a"] });

    queue.enqueue("a");
    await answer();

    expect(statuses.at(-1)).toEqual(["failed", new Error("refused a")]);
    expect(queue.status()).toBe("failed");

    queue.retry();
    expect(save.mock.calls).toEqual([["a"], ["a"]]);
  });

  test("a failure superseded by newer values goes unsaid and the newer ones are sent", async () => {
    const { answer, queue, save, statuses } = setup({ failing: ["a"] });

    queue.enqueue("a");
    queue.enqueue("b");
    await answer();

    expect(save.mock.calls).toEqual([["a"], ["b"]]);
    await answer();
    expect(statuses.map(([status]) => status)).toEqual([
      "saving",
      "saving",
      "saved",
    ]);
  });

  test("a push after a failure sends the new values, not the failed ones", async () => {
    const { answer, queue, save } = setup({ failing: ["a"] });
    queue.enqueue("a");
    await answer();

    queue.enqueue("b");
    queue.retry();

    expect(save.mock.calls).toEqual([["a"], ["b"]]);
  });

  test("a retry with nothing failed, or while a save travels, sends nothing", async () => {
    const { answer, queue, save } = setup({ failing: ["a"] });

    queue.retry();
    expect(save).not.toHaveBeenCalled();

    queue.enqueue("a");
    await answer();
    queue.retry();
    queue.retry();

    expect(save.mock.calls).toEqual([["a"], ["a"]]);
  });

  test.each([
    ["idle when nothing was ever saved", [], [], "idle"],
    ["saved once the last save went through", ["a"], [], "saved"],
    ["failed when the last save did not", ["a"], ["a"], "failed"],
  ] as const)("settles %s", async (_case, pushes, failing, expected) => {
    const { answer, queue } = setup({ failing: [...failing] });

    for (const values of pushes) {
      queue.enqueue(values);
    }

    const settled = queue.settled();
    await answer();

    await expect(settled).resolves.toBe(expected);
  });

  test("settles only once the values pushed while it waited are saved too", async () => {
    const { answer, queue, save } = setup();
    queue.enqueue("a");
    const settled = queue.settled();
    let done = false;
    void settled.then(() => {
      done = true;
    });

    queue.enqueue("b");
    await answer();
    expect(done).toBe(false);

    await answer();
    await expect(settled).resolves.toBe("saved");
    expect(save.mock.calls).toEqual([["a"], ["b"]]);
  });
});
