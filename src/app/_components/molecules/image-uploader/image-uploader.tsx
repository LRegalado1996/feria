"use client";

import { ImageIcon, ImageUp, RotateCcw, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useId, useRef, useState } from "react";
import type * as React from "react";

import { Button } from "@/app/_components/atoms/button";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { type ImageUploadState, useImageUpload } from "@/lib/hooks/upload";
import { interpolate } from "@/lib/i18n/interpolate";
import type { ImagePurpose, UploadedImage } from "@/lib/schemas/upload";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/utils/format";

export type ImageUploaderProps = Omit<
  React.ComponentProps<"fieldset">,
  "children" | "onChange"
> & {
  /** A line under the label; the accepted formats when omitted. */
  description?: string;
  /** What the photo is for, shown above it and naming every control. */
  label: string;
  /** Told when a photo starts being prepared or sent, and when it stops. */
  onBusyChange?: (busy: boolean) => void;
  /** The uploaded image to save, or `null` once removed. */
  onChange: (image: UploadedImage | null) => void;
  /** Decides the store's folder and size cap (`IMAGE_PURPOSES`). */
  purpose: ImagePurpose;
  /** The preview's widths for `next/image`, as the form lays it out. */
  sizes?: string;
  value: UploadedImage | null;
};

/**
 * One photo of a form, uploaded from the browser straight to the store
 * (FER-011): choose it (a phone offers the camera and the library), watch
 * it shrink and travel with its progress, cancel it, retry a failed one, or
 * remove it. The form receives the image to save through `onChange`, with
 * its size in pixels. Every control is a button named with the field's
 * label, the progress and the outcome are said in a polite live region, a
 * failure in an alert. Inside a `FormControl`, the ids it passes land on the
 * group.
 */
function ImageUploader({
  "aria-describedby": describedBy,
  className,
  description,
  disabled,
  label,
  onBusyChange,
  onChange,
  purpose,
  sizes = "(min-width: 768px) 24rem, 100vw",
  value,
  ...props
}: ImageUploaderProps) {
  const { admin } = useDictionary();
  const copy = admin.imageUpload;
  const locale = useLocale();
  const id = useId();
  const hintId = `${id}-hint`;
  const input = useRef<HTMLInputElement>(null);
  const [removed, setRemoved] = useState(false);
  const { cancel, retry, start, state } = useImageUpload({
    onBusyChange,
    onUploaded: onChange,
    purpose,
  });
  const busy = state.status === "preparing" || state.status === "uploading";
  const named = (action: string) => interpolate(copy.named, { action, label });

  // What the live region says in each state. A failure has its own alert,
  // and idle has nothing to say.
  const said = {
    cancelled: copy.cancelled,
    done: copy.uploaded,
    failed: "",
    idle: "",
    preparing: copy.preparing,
    uploading:
      state.status === "uploading"
        ? interpolate(copy.uploading, {
            percent: formatPercent(state.percent, locale),
          })
        : "",
  } satisfies Record<ImageUploadState["status"], string>;
  const status = removed ? copy.removed : said[state.status];

  return (
    <fieldset
      aria-busy={busy || undefined}
      aria-describedby={cn(hintId, describedBy)}
      className={cn("grid min-w-0 gap-2", className)}
      data-slot="image-uploader"
      data-status={state.status}
      data-testid="image-uploader"
      {...props}
      // A photo on its way keeps its cancel even once the field is shut:
      // nothing else could stop it, and the form waits for it.
      disabled={disabled === true && !busy}
    >
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <p className="text-xs text-muted-foreground" id={hintId}>
        {description ?? copy.hint}
      </p>
      <div className="overflow-hidden rounded-md border bg-muted">
        {value ? (
          <Image
            alt={interpolate(copy.preview, { label })}
            className="h-auto max-h-64 w-full object-contain"
            height={value.height}
            sizes={sizes}
            src={value.url}
            width={value.width}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center text-muted-foreground">
            <ImageIcon aria-hidden className="size-12" />
          </div>
        )}
      </div>
      {busy ? (
        // No value while the photo is prepared: the bar is indeterminate.
        <progress
          aria-label={interpolate(copy.progress, { label })}
          className="h-2 w-full appearance-none overflow-hidden rounded-full bg-secondary [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary"
          max={100}
          value={state.status === "uploading" ? state.percent : undefined}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {busy ? (
          <Button
            aria-label={named(copy.cancel)}
            onClick={() => {
              cancel();
            }}
            type="button"
            variant="outline"
          >
            <X aria-hidden />
            {copy.cancel}
          </Button>
        ) : (
          <>
            <Button
              aria-label={named(value ? copy.replace : copy.choose)}
              onClick={() => input.current?.click()}
              type="button"
              variant="outline"
            >
              <ImageUp aria-hidden />
              {value ? copy.replace : copy.choose}
            </Button>
            {state.status === "failed" && state.reason === "failed" ? (
              <Button
                aria-label={named(copy.retry)}
                onClick={() => {
                  // A retry is a new try: a removal made meantime is not news.
                  setRemoved(false);
                  retry();
                }}
                type="button"
              >
                <RotateCcw aria-hidden />
                {copy.retry}
              </Button>
            ) : null}
            {value ? (
              <Button
                aria-label={named(copy.remove)}
                onClick={() => {
                  setRemoved(true);
                  onChange(null);
                }}
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden />
                {copy.remove}
              </Button>
            ) : null}
          </>
        )}
      </div>
      {/* Reached through its button, which names it: the native control
          cannot be styled or named per field. `image/*` lets an iPhone
          hand over a JPEG of a HEIC photo. */}
      <input
        accept="image/*"
        aria-hidden
        className="sr-only"
        data-testid="image-uploader-input"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // The same file can be chosen again after a failure or a removal.
          event.currentTarget.value = "";

          if (file) {
            setRemoved(false);
            start(file);
          }
        }}
        ref={input}
        tabIndex={-1}
        type="file"
      />
      <output aria-live="polite" className="sr-only">
        {status}
      </output>
      {state.status === "failed" ? (
        <p className="text-sm text-destructive" role="alert">
          {copy.errors[state.reason]}
        </p>
      ) : null}
    </fieldset>
  );
}

export { ImageUploader };
