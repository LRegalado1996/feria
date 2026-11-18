/** Where a queue of saves stands: what the wizard's save status says. */
export type SaveQueueStatus = "failed" | "idle" | "saved" | "saving";

export interface SaveQueue<Values> {
  /**
   * Saves `values` once nothing else is on its way. A newer one while a
   * save travels replaces any value still waiting: only the latest is sent.
   */
  enqueue: (values: Values) => void;
  /** Sends the values whose save failed again, unless newer ones came. */
  retry: () => void;
  /**
   * Resolves once nothing is on its way or waiting: `saved` when the last
   * save went through, `failed` when it did not, `idle` when nothing was
   * ever saved.
   */
  settled: () => Promise<Exclude<SaveQueueStatus, "saving">>;
  status: () => SaveQueueStatus;
}

/**
 * One save at a time, the latest values only (FER-017's autosave). The
 * server keeps whichever save of an article commits last, whole, so two
 * saves in flight could land in the wrong order and an older state win:
 * here a save starts only once the one before it answered, and the values
 * typed meanwhile collapse into one save of the newest. A failure stops the
 * queue until `retry()` or a newer `enqueue()`; a newer one while it travels
 * supersedes it, and its failure goes unsaid.
 */
export function createSaveQueue<Values>({
  onStatus,
  save,
}: {
  onStatus: (status: SaveQueueStatus, error?: unknown) => void;
  save: (values: Values) => Promise<void>;
}): SaveQueue<Values> {
  let current: SaveQueueStatus = "idle";
  let outcome: Exclude<SaveQueueStatus, "saving"> = "idle";
  let waiting: { values: Values } | null = null;
  let failed: { values: Values } | null = null;
  let running = false;
  let listeners: (() => void)[] = [];

  const announce = (status: SaveQueueStatus, error?: unknown) => {
    current = status;
    onStatus(status, error);

    if (status !== "saving") {
      outcome = status;
      const settledNow = listeners;
      listeners = [];
      for (const listener of settledNow) {
        listener();
      }
    }
  };

  const drain = async () => {
    running = true;

    while (waiting) {
      const { values } = waiting;
      waiting = null;
      announce("saving");

      try {
        await save(values);
        failed = null;
      } catch (error) {
        if (!waiting) {
          failed = { values };
          running = false;
          announce("failed", error);
          return;
        }
      }
    }

    running = false;
    announce("saved");
  };

  return {
    enqueue: (values) => {
      waiting = { values };
      failed = null;

      if (!running) {
        void drain();
      }
    },
    retry: () => {
      if (failed && !running) {
        waiting = failed;
        failed = null;
        void drain();
      }
    },
    settled: async () => {
      if (running) {
        await new Promise<void>((resolve) => {
          listeners.push(resolve);
        });
      }

      return outcome;
    },
    status: () => current,
  };
}
