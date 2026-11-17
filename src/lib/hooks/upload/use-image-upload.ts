import { useMutation } from "@tanstack/react-query";
import { put } from "@vercel/blob/client";
import { useEffect, useRef, useState } from "react";

import { reportError } from "@/lib/errors/client";
import { orpc } from "@/lib/orpc/client";
import {
  IMAGE_PURPOSE_MAX_BYTES,
  type ImagePurpose,
  type UploadedImage,
} from "@/lib/schemas/upload";
import {
  type PreparedImage,
  prepareImage,
  UnreadableImageError,
} from "@/lib/upload/prepare-image";

/** Why an upload stopped: only `failed` is worth retrying as it is. */
export type ImageUploadFailure = "failed" | "tooLarge" | "unreadable";

export type ImageUploadState =
  | { status: "cancelled" }
  | { status: "done" }
  | { status: "failed"; reason: ImageUploadFailure }
  | { status: "idle" }
  | { percent: number; status: "uploading" }
  | { status: "preparing" };

/** One try at one file; a newer one (another file, a retry) supersedes it. */
interface Attempt {
  controller: AbortController;
  file: Blob;
  prepared: PreparedImage | null;
}

/**
 * Uploads one photo straight to the Blob store (FER-011): downscales it in
 * the browser, asks the server for a client token (an admin's only), then
 * sends the file with its progress. `retry()` sends the same prepared file
 * again with a fresh token after a failure; `cancel()` stops it wherever it
 * is, and so does leaving the form. A finished upload is handed to
 * `onUploaded` with its size in pixels, for the form to save, and
 * `onBusyChange` hears when a photo is on its way and when it no longer
 * is, for the form to wait. A failure is reported once, here; a file the
 * browser cannot read is the user's to change, not a defect.
 */
export function useImageUpload({
  onBusyChange,
  onUploaded,
  purpose,
}: {
  /** Told when a photo starts being prepared or sent, and when it stops. */
  onBusyChange?: (busy: boolean) => void;
  onUploaded: (image: UploadedImage) => void;
  purpose: ImagePurpose;
}) {
  const [state, setState] = useState<ImageUploadState>({ status: "idle" });
  const current = useRef<Attempt | null>(null);
  const busy = useRef(false);
  // Every change of state goes through here, so the form hears of a photo
  // on its way as it happens, not on a later render.
  const update = (next: ImageUploadState) => {
    setState(next);
    const nowBusy = next.status === "preparing" || next.status === "uploading";

    if (nowBusy !== busy.current) {
      busy.current = nowBusy;
      onBusyChange?.(nowBusy);
    }
  };
  const tokenRequest = useMutation({
    ...orpc.upload.createToken.mutationOptions(),
    // Reported below with the upload's own action, once.
    meta: { suppressGlobalErrorReport: true },
  });

  const isCurrent = (attempt: Attempt) =>
    current.current === attempt && !attempt.controller.signal.aborted;

  // Leaving the form stops its upload: a token that arrives later sends
  // nothing, and a transfer under way is aborted, handing nothing over.
  useEffect(
    () => () => {
      current.current?.controller.abort();
      current.current = null;
    },
    []
  );

  async function send(attempt: Attempt, prepared: PreparedImage) {
    if (prepared.blob.size > IMAGE_PURPOSE_MAX_BYTES[purpose]) {
      update({ reason: "tooLarge", status: "failed" });

      return;
    }

    update({ percent: 0, status: "uploading" });
    const { pathname, token } = await tokenRequest.mutateAsync({
      contentType: prepared.contentType,
      purpose,
      size: prepared.blob.size,
    });

    if (!isCurrent(attempt)) {
      return;
    }

    // The SDK can report progress after the transfer settled, resolved or
    // failed: once it has, a report would take the photo back to
    // "uploading", hiding Retry and keeping the form's Save shut.
    let settled = false;
    const uploaded = await put(pathname, prepared.blob, {
      abortSignal: attempt.controller.signal,
      access: "public",
      contentType: prepared.contentType,
      onUploadProgress: ({ percentage }) => {
        if (!settled && isCurrent(attempt)) {
          update({ percent: percentage, status: "uploading" });
        }
      },
      token,
    }).finally(() => {
      settled = true;
    });

    if (!isCurrent(attempt)) {
      return;
    }

    update({ status: "done" });
    onUploaded({
      height: prepared.height,
      url: uploaded.url,
      width: prepared.width,
    });
  }

  async function run(attempt: Attempt) {
    try {
      let { prepared } = attempt;

      if (!prepared) {
        update({ status: "preparing" });
        prepared = await prepareImage(attempt.file);
        attempt.prepared = prepared;
      }

      if (isCurrent(attempt)) {
        await send(attempt, prepared);
      }
    } catch (error) {
      // A cancelled or superseded try already left the state to its successor.
      if (!isCurrent(attempt)) {
        return;
      }

      if (error instanceof UnreadableImageError) {
        update({ reason: "unreadable", status: "failed" });

        return;
      }

      reportError(error, {
        action: "Upload.upload_image",
        context: { prepared: attempt.prepared !== null, purpose },
      });
      update({ reason: "failed", status: "failed" });
    }
  }

  function begin(file: Blob, prepared: PreparedImage | null) {
    current.current?.controller.abort();
    const attempt: Attempt = {
      controller: new AbortController(),
      file,
      prepared,
    };
    current.current = attempt;
    void run(attempt);
  }

  return {
    cancel: () => {
      const attempt = current.current;

      if (attempt && !attempt.controller.signal.aborted) {
        attempt.controller.abort();
        update({ status: "cancelled" });
      }
    },
    retry: () => {
      const last = current.current;

      if (last && state.status === "failed" && state.reason === "failed") {
        begin(last.file, last.prepared);
      }
    },
    start: (file: Blob) => {
      begin(file, null);
    },
    state,
  };
}
