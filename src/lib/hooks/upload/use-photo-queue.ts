import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { reportError } from "@/lib/errors/client";
import { orpc } from "@/lib/orpc/client";
import { PRODUCT_IMAGES_MAX } from "@/lib/schemas/catalog";
import {
  IMAGE_PURPOSE_MAX_BYTES,
  IMAGE_SOURCE_MAX_BYTES,
  type ImagePurpose,
  type UploadedImage,
} from "@/lib/schemas/upload";
import {
  type PreparedImage,
  prepareImage,
  UnreadableImageError,
} from "@/lib/upload/prepare-image";
import { isUploadsNotConfigured, sendImage } from "@/lib/upload/send-image";

import type { ImageUploadFailure } from "./use-image-upload";

/** Where one photo of the queue stands. */
export type QueuedPhotoState =
  | { percent: number; status: "uploading" }
  | { reason: ImageUploadFailure; status: "failed" }
  | { status: "preparing" }
  | { status: "waiting" };

/** A photo chosen and not uploaded yet, shown at once from the device. */
export interface QueuedPhoto {
  key: string;
  /** The file's own name, to say which one a refusal is about. */
  name: string;
  /** A local address of the chosen file, for its thumbnail. */
  preview: string;
  state: QueuedPhotoState;
}

/** A file refused before any work, with what to tell the person. */
export type PhotoRefusal =
  | { count: number; kind: "tooMany" }
  | { kind: "notImage" | "tooBig"; name: string };

/** A photo once it reached the store, with the thumbnail it was shown by. */
export interface QueuedPhotoUploaded {
  image: UploadedImage;
  key: string;
  preview: string;
}

interface Attempt {
  controller: AbortController;
  file: File;
  prepared: PreparedImage | null;
}

/** Why a photo's upload stopped, from what it threw. */
function failureOf(error: unknown): ImageUploadFailure {
  if (error instanceof UnreadableImageError) {
    return "unreadable";
  }

  return isUploadsNotConfigured(error) ? "notConfigured" : "failed";
}

/** At most this many photos travel at once, once the first one is in. */
const CONCURRENT_UPLOADS = 2;

let nextKey = 0;

/**
 * Several photos uploaded straight to the store at once (FER-017's wizard),
 * each prepared, sent and reported on its own like `useImageUpload`'s one.
 * A file that is not an image, weighs more than `IMAGE_SOURCE_MAX_BYTES` or
 * does not fit beside the article's other photos (`PRODUCT_IMAGES_MAX`) is
 * refused at once with its reason, before any work. The others show at once
 * from the device and wait their turn: while the article has no photo, the
 * first one chosen travels alone, so the draft exists as soon as possible;
 * then two at a time. A photo that arrives leaves the queue for
 * `onUploaded`, which takes over its thumbnail address; one that fails stays
 * with its reason, to retry or remove. Leaving the screen stops every upload
 * and frees every thumbnail still queued.
 */
export function usePhotoQueue({
  onUploaded,
  purpose,
}: {
  onUploaded: (photo: QueuedPhotoUploaded) => void;
  purpose: ImagePurpose;
}) {
  const [items, setItems] = useState<QueuedPhoto[]>([]);
  const attempts = useRef(new Map<string, Attempt>());
  const waiting = useRef<string[]>([]);
  const active = useRef(new Set<string>());
  // The article has no photo yet: the first one travels alone.
  const alone = useRef(false);
  const previews = useRef(new Map<string, string>());
  const uploaded = useRef(onUploaded);
  const tokenRequest = useMutation({
    ...orpc.upload.createToken.mutationOptions(),
    // Reported below with the photo's own action, once.
    meta: { suppressGlobalErrorReport: true },
  });

  useEffect(() => {
    uploaded.current = onUploaded;
  });

  useEffect(() => {
    const running = attempts.current;
    const shown = previews.current;

    return () => {
      for (const attempt of running.values()) {
        attempt.controller.abort();
      }
      running.clear();

      for (const preview of shown.values()) {
        URL.revokeObjectURL(preview);
      }
      shown.clear();
    };
  }, []);

  const patch = (key: string, state: QueuedPhotoState) => {
    setItems((list) =>
      list.map((item) => (item.key === key ? { ...item, state } : item))
    );
  };

  /** Takes the photo off the queue; its thumbnail too, unless handed over. */
  const drop = (key: string, { keepPreview = false } = {}) => {
    attempts.current.get(key)?.controller.abort();
    attempts.current.delete(key);
    waiting.current = waiting.current.filter((other) => other !== key);
    const preview = previews.current.get(key);
    previews.current.delete(key);

    if (preview !== undefined && !keepPreview) {
      URL.revokeObjectURL(preview);
    }

    setItems((list) => list.filter((item) => item.key !== key));
  };

  const isCurrent = (key: string, attempt: Attempt) =>
    attempts.current.get(key) === attempt && !attempt.controller.signal.aborted;

  const send = async (key: string, attempt: Attempt) => {
    if (!attempt.prepared) {
      patch(key, { status: "preparing" });
      attempt.prepared = await prepareImage(attempt.file, {
        maxBytes: IMAGE_PURPOSE_MAX_BYTES[purpose],
      });
    }

    const { prepared } = attempt;

    if (!isCurrent(key, attempt)) {
      return;
    }

    if (prepared.blob.size > IMAGE_PURPOSE_MAX_BYTES[purpose]) {
      patch(key, { reason: "tooLarge", status: "failed" });
      return;
    }

    patch(key, { percent: 0, status: "uploading" });
    const { pathname, token } = await tokenRequest.mutateAsync({
      contentType: prepared.contentType,
      purpose,
      size: prepared.blob.size,
    });

    if (!isCurrent(key, attempt)) {
      return;
    }

    const url = await sendImage({
      onProgress: (percent) => {
        if (isCurrent(key, attempt)) {
          patch(key, { percent, status: "uploading" });
        }
      },
      pathname,
      prepared,
      signal: attempt.controller.signal,
      token,
    });

    if (!isCurrent(key, attempt)) {
      return;
    }

    const preview = previews.current.get(key) ?? url;
    alone.current = false;
    drop(key, { keepPreview: true });
    uploaded.current({
      image: { height: prepared.height, url, width: prepared.width },
      key,
      preview,
    });
  };

  /** Says why a photo's upload stopped, unless it was superseded. */
  const fail = (key: string, attempt: Attempt, error: unknown) => {
    if (!isCurrent(key, attempt)) {
      return;
    }

    const reason = failureOf(error);

    // A file the browser cannot read is the person's to change.
    if (reason !== "unreadable") {
      reportError(error, {
        action: "Product.upload_photo",
        context: { prepared: attempt.prepared !== null, purpose, reason },
      });
    }

    patch(key, { reason, status: "failed" });
  };

  /** Starts the waiting photos while there is room, each starting the next. */
  const pump = () => {
    const limit = alone.current ? 1 : CONCURRENT_UPLOADS;

    while (active.current.size < limit && waiting.current.length > 0) {
      const [key, ...rest] = waiting.current;
      waiting.current = rest;
      const attempt = key === undefined ? undefined : attempts.current.get(key);

      if (key !== undefined && attempt) {
        active.current.add(key);
        void (async () => {
          try {
            await send(key, attempt);
          } catch (error) {
            fail(key, attempt, error);
          }

          active.current.delete(key);
          pump();
        })();
      }
    }
  };

  return {
    /**
     * Queues the files that can be photos, `photoCount` being how many the
     * article already holds, and answers the ones refused and why.
     */
    add: (files: readonly File[], photoCount: number): PhotoRefusal[] => {
      const refusals: PhotoRefusal[] = [];
      const accepted: File[] = [];

      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          refusals.push({ kind: "notImage", name: file.name });
        } else if (file.size > IMAGE_SOURCE_MAX_BYTES) {
          refusals.push({ kind: "tooBig", name: file.name });
        } else {
          accepted.push(file);
        }
      }

      const room = Math.max(
        0,
        PRODUCT_IMAGES_MAX - photoCount - attempts.current.size
      );
      const taken = accepted.slice(0, room);

      if (accepted.length > taken.length) {
        refusals.push({
          count: accepted.length - taken.length,
          kind: "tooMany",
        });
      }

      if (photoCount === 0 && attempts.current.size === 0) {
        alone.current = true;
      }

      const added = taken.map((file) => {
        nextKey += 1;
        const key = `photo-${nextKey}`;
        const preview = URL.createObjectURL(file);
        previews.current.set(key, preview);
        attempts.current.set(key, {
          controller: new AbortController(),
          file,
          prepared: null,
        });
        waiting.current = [...waiting.current, key];

        return {
          key,
          name: file.name,
          preview,
          state: { status: "waiting" },
        } satisfies QueuedPhoto;
      });

      setItems((list) => [...list, ...added]);
      pump();

      return refusals;
    },
    /** Stops a photo on its way, or drops a failed one, off the queue. */
    remove: (key: string) => {
      drop(key);
      pump();
    },
    items,
    /** Sends a failed photo again, prepared as it was, with a fresh token. */
    retry: (key: string) => {
      const last = attempts.current.get(key);
      const item = items.find((other) => other.key === key);

      if (
        last &&
        item?.state.status === "failed" &&
        item.state.reason === "failed"
      ) {
        attempts.current.set(key, {
          ...last,
          controller: new AbortController(),
        });
        waiting.current = [...waiting.current, key];
        patch(key, { status: "waiting" });
        pump();
      }
    },
  };
}
