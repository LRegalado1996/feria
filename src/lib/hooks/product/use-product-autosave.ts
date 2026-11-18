import { useEffect, useState } from "react";

import { createSaveQueue, type SaveQueueStatus } from "@/lib/admin/save-queue";
import { reportError } from "@/lib/errors/client";
import type { CreateProductValues } from "@/lib/schemas/catalog";

import { useCreateProduct } from "./use-create-product";
import { useUpdateProduct } from "./use-update-product";

/** How long the wizard waits after the last change before it saves. */
export const AUTOSAVE_DELAY_MS = 800;

interface Writers {
  create: ReturnType<typeof useCreateProduct>["mutateAsync"];
  onCreated: ((id: number) => void) | undefined;
  update: ReturnType<typeof useUpdateProduct>["mutateAsync"];
}

/**
 * The saving itself, made once per wizard: the queue, the pause before a
 * save and the article's id, which the first save sets.
 */
export function createAutosave({
  id: initialId,
  onId,
  onStatus,
}: {
  id: number | null;
  onId: (id: number) => void;
  onStatus: (status: SaveQueueStatus) => void;
}) {
  // The latest mutations, handed in after every render.
  const writers: { current: Writers | null } = { current: null };
  let id = initialId;
  const requireWriters = () => {
    if (!writers.current) {
      throw new Error("The autosave saved before its writers were handed in");
    }
    return writers.current;
  };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiting: CreateProductValues | null = null;
  const queue = createSaveQueue<CreateProductValues>({
    onStatus: (status, error) => {
      onStatus(status);

      if (status === "failed") {
        reportError(error, {
          action: "Product.autosave",
          context: { created: id !== null },
        });
      }
    },
    save: async (values) => {
      if (id === null) {
        const created = await requireWriters().create(values);
        id = created.id;
        onId(created.id);
        writers.current?.onCreated?.(created.id);
        return;
      }

      await requireWriters().update({ ...values, id });
    },
  });

  /** Sends what waits for the typing to pause, at once. */
  const sendWaiting = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    if (waiting) {
      queue.enqueue(waiting);
      waiting = null;
    }
  };

  return {
    /** The article's id as of now: set by the first save, even mid-render. */
    currentId: () => id,
    flush: async () => {
      sendWaiting();
      return await queue.settled();
    },
    retry: () => {
      queue.retry();
    },
    saveNow: (values: CreateProductValues) => {
      waiting = values;
      sendWaiting();
    },
    schedule: (values: CreateProductValues) => {
      waiting = values;

      if (timer !== null) {
        clearTimeout(timer);
      }

      timer = setTimeout(sendWaiting, AUTOSAVE_DELAY_MS);
    },
    sendWaiting,
    setWriters: (next: Writers) => {
      writers.current = next;
    },
  };
}

/**
 * A draft article saved as it is typed (FER-017). `schedule()` saves the
 * latest values once the typing pauses, `saveNow()` at once (the first
 * photo, which creates the draft), and `flush()` sends what is still
 * waiting and resolves once everything is saved (before publishing). The
 * first save creates the article and every later one updates it, one at a
 * time and the latest values only (`createSaveQueue`), so an older save
 * never lands after a newer one. A failure is reported once and waits for
 * `retry()` or the next change. Hiding the page (the phone locked, another
 * app, the tab closed) and leaving the wizard save what is waiting at once.
 */
export function useProductAutosave({
  id: initialId,
  onCreated,
}: {
  /** The article being edited, or `null` until the first save makes one. */
  id: number | null;
  /** Told once the first save created the article, with its id. */
  onCreated?: (id: number) => void;
}) {
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const [status, setStatus] = useState<SaveQueueStatus>("idle");
  const [id, setId] = useState(initialId);
  // Made once per article: the wizard is keyed by it.
  // Made once per wizard, never again: React may throw a memo away, and a
  // new instance would forget the article's id and create a second draft.
  // oxlint-disable-next-line react/hook-use-state -- an instance kept for the component's life, never replaced, so it has no setter
  const [autosave] = useState(() =>
    createAutosave({ id: initialId, onId: setId, onStatus: setStatus })
  );

  // Before any save can run: effects run in order, and a save only starts
  // from a change or a photo, after the first render's effects.
  useEffect(() => {
    autosave.setWriters({
      create: create.mutateAsync,
      onCreated,
      update: update.mutateAsync,
    });
  });

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        autosave.sendWaiting();
      }
    };

    document.addEventListener("visibilitychange", onHidden);

    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      // Leaving the wizard keeps what was typed last.
      autosave.sendWaiting();
    };
  }, [autosave]);

  return {
    /** The article's id now, for a handler that awaited a save. */
    currentId: autosave.currentId,
    /** Sends what is waiting and resolves once all of it is saved, or not. */
    flush: autosave.flush,
    /** The article's id once it exists. */
    id,
    /** Sends the values whose save failed again. */
    retry: autosave.retry,
    /** Saves `values` at once, as the first photo does. */
    saveNow: autosave.saveNow,
    /** Saves `values` once the typing pauses. */
    schedule: autosave.schedule,
    status,
  };
}
