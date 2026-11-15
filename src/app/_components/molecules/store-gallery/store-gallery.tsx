"use client";

import { ChevronLeft, ChevronRight, ImageOff, X, ZoomIn } from "lucide-react";
import Image from "next/image";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef, useState } from "react";

import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export interface StoreGalleryImage {
  alt: string;
  height: number;
  id: number;
  url: string;
  width: number;
}

export interface StoreGalleryProps {
  className?: string;
  images: StoreGalleryImage[];
  /** The article's name, for the gallery's own name. */
  title: string;
}

const BUTTON_CLASS =
  "inline-flex size-11 items-center justify-center bg-store-contrast text-store-background hover:bg-store-accent hover:text-store-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground aria-disabled:opacity-40";

/**
 * An article's photos (FER-024): swiped on a phone (native scroll with
 * snap), stepped with the buttons or the thumbnails, and opened full screen
 * to zoom, where the phone's own pinch works. The first photo loads first;
 * every photo is in the server's HTML, so it is read without the script.
 */
function StoreGallery({ className, images, title }: StoreGalleryProps) {
  const { storefront } = useDictionary();
  const copy = storefront.article;
  const track = useRef<HTMLDivElement>(null);
  // The photo a button or a thumbnail asked for, while the track is still
  // gliding to it: the photos it passes on the way are not where the visitor
  // is, so they neither move the counter nor become the next step's start.
  const target = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const current = images[index];

  const show = (next: number) => {
    if (next < 0 || next >= images.length) {
      return;
    }

    const width = track.current?.clientWidth ?? 0;
    target.current = next;
    // No `behavior`: the track's CSS glides, or not when motion is reduced.
    track.current?.scrollTo({ left: next * width });
    setIndex(next);
  };

  const shown = (element: HTMLDivElement) =>
    element.clientWidth > 0
      ? Math.round(element.scrollLeft / element.clientWidth)
      : 0;

  if (!current) {
    return (
      <div
        className={cn(
          "flex aspect-4/5 flex-col items-center justify-center gap-2 bg-store-line text-sm text-store-muted",
          className
        )}
        data-slot="store-gallery"
      >
        <ImageOff aria-hidden="true" className="size-12" />
        {storefront.articleCard.noImage}
      </div>
    );
  }

  return (
    <section
      aria-label={interpolate(copy.gallery, { title })}
      aria-roledescription="carousel"
      className={cn("flex flex-col gap-3", className)}
      data-slot="store-gallery"
      data-testid="store-gallery"
    >
      <div className="relative">
        <div
          data-testid="store-gallery-track"
          className="flex aspect-4/5 snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto scroll-smooth bg-store-line motion-reduce:scroll-auto"
          onScroll={(event) => {
            const next = shown(event.currentTarget);

            if (target.current !== null) {
              // Arrived: from here a swipe moves the counter again.
              if (next === target.current) {
                target.current = null;
              }

              return;
            }

            if (next !== index) {
              setIndex(next);
            }
          }}
          onScrollEnd={(event) => {
            // A swipe that interrupted the glide ends wherever it ends.
            target.current = null;
            const next = shown(event.currentTarget);

            if (next !== index) {
              setIndex(next);
            }
          }}
          ref={track}
        >
          {images.map((image, position) => (
            // Each photo is named by its alt text; the position is said by
            // the counter under the gallery.
            <div
              className="relative h-full w-full shrink-0 snap-center"
              key={image.id}
            >
              <Image
                alt={image.alt}
                className="object-cover"
                fill
                // The first photo is what the visitor came for.
                priority={position === 0}
                sizes="(min-width: 768px) 50vw, 100vw"
                src={image.url}
              />
            </div>
          ))}
        </div>
        <DialogPrimitive.Root onOpenChange={setZoomed} open={zoomed}>
          <DialogPrimitive.Trigger
            className={cn(BUTTON_CLASS, "absolute top-3 right-3")}
          >
            <ZoomIn aria-hidden="true" className="size-5" />
            <span className="sr-only">{copy.zoom}</span>
          </DialogPrimitive.Trigger>
          {/* In place, not in a portal: it keeps the store's palette. */}
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-50 bg-store-contrast"
            data-slot="dialog-overlay"
            data-testid="dialog-overlay"
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-0 z-50 flex items-center justify-center bg-store-contrast outline-none"
            data-slot="dialog-content"
            data-testid="store-gallery-zoom"
          >
            <DialogPrimitive.Title className="sr-only">
              {current.alt}
            </DialogPrimitive.Title>
            <Image
              alt={current.alt}
              className="h-auto max-h-dvh w-auto max-w-full object-contain"
              height={current.height}
              sizes="100vw"
              src={current.url}
              width={current.width}
            />
            <DialogPrimitive.Close
              className={cn(BUTTON_CLASS, "absolute top-3 right-3")}
            >
              <X aria-hidden="true" className="size-6" />
              <span className="sr-only">{copy.zoomClose}</span>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Root>
      </div>
      {images.length > 1 ? (
        <div className="flex items-center gap-3">
          {/* `aria-disabled`, not `disabled`: a button that disables itself
              under the finger drops keyboard focus on the floor. */}
          <button
            aria-disabled={index === 0}
            className={BUTTON_CLASS}
            onClick={() => {
              show(index - 1);
            }}
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
            <span className="sr-only">{copy.galleryPrevious}</span>
          </button>
          <p aria-live="polite" className="text-sm font-semibold tabular-nums">
            {interpolate(copy.galleryPosition, {
              current: index + 1,
              total: images.length,
            })}
          </p>
          <button
            aria-disabled={index === images.length - 1}
            className={BUTTON_CLASS}
            onClick={() => {
              show(index + 1);
            }}
            type="button"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
            <span className="sr-only">{copy.galleryNext}</span>
          </button>
        </div>
      ) : null}
      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto">
          {images.map((image, position) => (
            <li key={image.id}>
              <button
                aria-current={position === index ? "true" : undefined}
                aria-label={interpolate(copy.galleryShow, {
                  current: position + 1,
                })}
                className={cn(
                  "relative block size-16 shrink-0 bg-store-line focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground",
                  position === index && "ring-2 ring-store-foreground"
                )}
                onClick={() => {
                  show(position);
                }}
                type="button"
              >
                <Image
                  alt=""
                  className="object-cover"
                  fill
                  sizes="64px"
                  src={image.url}
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export { StoreGallery };
