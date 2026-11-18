import { ORPCError } from "@orpc/client";
import { put } from "@vercel/blob/client";

import { ERROR_WHYS } from "@/lib/errors";
import type { PreparedImage } from "@/lib/upload/prepare-image";

/**
 * The server has no Blob store to sign for (FER-051): no retry can succeed
 * until someone configures it, so an uploader says so instead.
 */
export function isUploadsNotConfigured(error: unknown): boolean {
  if (!(error instanceof ORPCError) || error.code !== "SERVICE_UNAVAILABLE") {
    return false;
  }

  const data: unknown = error.data;

  return (
    typeof data === "object" &&
    data !== null &&
    "why" in data &&
    data.why === ERROR_WHYS.UPLOADS_NOT_CONFIGURED
  );
}

/**
 * Sends a prepared photo straight to the Blob store (FER-011) with the
 * client token the server signed for it, reporting its progress until the
 * transfer settles, and answers the file's address. The SDK can report
 * progress after the transfer settled, resolved or failed: those late
 * reports are dropped, or a finished photo would look under way again.
 */
export async function sendImage({
  onProgress,
  pathname,
  prepared,
  signal,
  token,
}: {
  onProgress: (percent: number) => void;
  pathname: string;
  prepared: PreparedImage;
  signal: AbortSignal;
  token: string;
}): Promise<string> {
  let settled = false;
  const uploaded = await put(pathname, prepared.blob, {
    abortSignal: signal,
    access: "public",
    contentType: prepared.contentType,
    onUploadProgress: ({ percentage }) => {
      if (!settled) {
        onProgress(percentage);
      }
    },
    token,
  }).finally(() => {
    settled = true;
  });

  return uploaded.url;
}
