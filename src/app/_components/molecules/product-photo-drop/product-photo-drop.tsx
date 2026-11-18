"use client";

import { ImagePlus } from "lucide-react";
import { useId, useRef, useState } from "react";

import { useDictionary } from "@/lib/hooks/i18n";
import type { PhotoRefusal } from "@/lib/hooks/upload";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export interface ProductPhotoDropProps {
  className?: string;
  /** How many photos the article holds or has on their way. */
  count: number;
  max: number;
  /** The files chosen or dropped, in their order. */
  onFiles: (files: File[]) => void;
  /** The files refused last time, and why. */
  refusals: readonly PhotoRefusal[];
}

/**
 * Where an article's photos come in (FER-017): one large button that opens
 * the device's picker, several at once (a phone offers its camera or its
 * library), and on a computer a drop zone for photos dragged onto it. It
 * says how many there are of how many fit, and shrinks once there are
 * some; full, it says why it takes no more. A refused file is named with
 * its reason in an alert under it.
 */
function ProductPhotoDrop({
  className,
  count,
  max,
  onFiles,
  refusals,
}: ProductPhotoDropProps) {
  const copy = useDictionary().articles.wizard.photos;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const hintId = useId();
  const full = count >= max;

  const said = (refusal: PhotoRefusal) => {
    if (refusal.kind === "tooMany") {
      return refusal.count === 1
        ? copy.refused.tooManyOne
        : interpolate(copy.refused.tooMany, { count: refusal.count });
    }

    return interpolate(copy.refused[refusal.kind], { name: refusal.name });
  };

  return (
    <div className={cn("grid gap-2", className)} data-slot="product-photo-drop">
      <button
        aria-describedby={hintId}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-card px-4 text-center transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
          count === 0 ? "min-h-56 md:min-h-64" : "min-h-24",
          over && "border-foreground bg-accent"
        )}
        data-testid="product-photo-drop"
        disabled={full}
        onClick={() => input.current?.click()}
        onDragLeave={() => {
          setOver(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          onFiles([...event.dataTransfer.files]);
        }}
        type="button"
      >
        <ImagePlus
          aria-hidden
          className={cn(
            "text-muted-foreground",
            count === 0 ? "size-12" : "size-6"
          )}
        />
        <span className="text-base font-medium">
          {full ? (
            copy.full
          ) : (
            <>
              <span className="md:hidden">{copy.drop}</span>
              <span className="hidden md:inline">{copy.dropDesktop}</span>
            </>
          )}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {interpolate(copy.count, { count, max })}
        </span>
      </button>
      <p className="text-xs text-muted-foreground" id={hintId}>
        {copy.hint}
      </p>
      {/* Reached through the button, which names it. `image/*` lets a phone
          offer its camera and its library, and an iPhone hand over a JPEG
          of a HEIC photo. */}
      <input
        accept="image/*"
        aria-hidden
        className="sr-only"
        data-testid="product-photo-input"
        multiple
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          // The same photos can be chosen again after a removal.
          event.currentTarget.value = "";

          if (files.length > 0) {
            onFiles(files);
          }
        }}
        ref={input}
        tabIndex={-1}
        type="file"
      />
      {refusals.length > 0 ? (
        <ul
          className="grid gap-1 text-sm text-destructive"
          data-testid="product-photo-refusals"
          role="alert"
        >
          {refusals.map((refusal) => (
            <li key={said(refusal)}>{said(refusal)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { ProductPhotoDrop };
