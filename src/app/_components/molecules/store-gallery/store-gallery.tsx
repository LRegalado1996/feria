"use client";

import { ArrowLeft, ArrowRight, ImageOff, X, ZoomIn } from "lucide-react";
import Image from "next/image";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  useCarousel,
} from "@/app/_components/molecules/carousel";
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

/**
 * The round arrow, the counter a screen reader hears, and the zoom of the
 * photo in view: what moves the gallery besides a finger, a mouse, a
 * trackpad and the arrow keys.
 */
function GalleryControls({ images }: { images: StoreGalleryImage[] }) {
  const copy = useDictionary().storefront.article;
  const { canScrollNext, scrollNext, scrollTo, selectedIndex, snapCount } =
    useCarousel();
  const [zoomed, setZoomed] = useState(false);
  // The photo in view, or the last one while Embla measures fewer places
  // than photos (the end of a row of wide photos).
  const current = images[Math.min(selectedIndex, images.length - 1)];

  return (
    <>
      {snapCount > 1 ? (
        <>
          <StoreButton
            aria-label={canScrollNext ? copy.galleryNext : copy.galleryRestart}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 shadow-lg md:right-4.5"
            data-slot="store-gallery-arrow"
            onClick={() => {
              if (canScrollNext) {
                scrollNext();
              } else {
                scrollTo(0);
              }
            }}
            size="icon-lg"
          >
            {canScrollNext ? (
              <ArrowRight aria-hidden="true" />
            ) : (
              <ArrowLeft aria-hidden="true" />
            )}
          </StoreButton>
          <output aria-live="polite" className="sr-only">
            {interpolate(copy.galleryPosition, {
              current: selectedIndex + 1,
              total: images.length,
            })}
          </output>
        </>
      ) : null}
      {current ? (
        <DialogPrimitive.Root onOpenChange={setZoomed} open={zoomed}>
          <DialogPrimitive.Trigger asChild>
            <StoreButton
              aria-label={copy.zoom}
              className="absolute top-2.5 left-2.5 md:top-4.5 md:left-4.5"
              size="icon"
              variant="outline"
            >
              <ZoomIn aria-hidden="true" />
            </StoreButton>
          </DialogPrimitive.Trigger>
          {/* In place, not in a portal, like every storefront dialog. */}
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
            {/* Its own size, so the phone's pinch zooms into its detail. */}
            <Image
              alt={current.alt}
              className="h-auto max-h-dvh w-auto max-w-full object-contain"
              height={current.height}
              sizes="100vw"
              src={current.url}
              width={current.width}
            />
            <DialogPrimitive.Close asChild>
              <StoreButton
                aria-label={copy.zoomClose}
                className="absolute top-3 right-3"
                size="icon"
                variant="contrast"
              >
                <X aria-hidden="true" />
              </StoreButton>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Root>
      ) : null}
    </>
  );
}

/**
 * An article's photos (FER-024, FER-039): large, on the grey tile, in a
 * carousel that a finger or a mouse drags, a trackpad swipes, the arrow
 * keys step through and the round arrow pages; the photo in view opens full
 * screen, where the phone's own pinch zooms. The first photo loads first;
 * every photo is in the server's HTML, so it is read without the script.
 */
function StoreGallery({ className, images, title }: StoreGalleryProps) {
  const { storefront } = useDictionary();
  const copy = storefront.article;

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "flex aspect-square flex-col items-center justify-center gap-2 bg-store-surface text-sm text-store-muted",
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
    <Carousel
      aria-label={interpolate(copy.gallery, { title })}
      className={cn("min-w-0", className)}
      data-slot="store-gallery"
      data-testid="store-gallery"
      opts={{ align: "start", containScroll: "trimSnaps" }}
    >
      <CarouselContent className="-ml-1.5">
        {images.map((image, position) => (
          <CarouselItem
            className={cn(
              "pl-1.5",
              // Most of a phone's width, so the next photo peeks in; about
              // two thirds of the column on a computer. One photo fills it.
              images.length > 1 && "basis-[88%] md:basis-[62%]"
            )}
            index={position}
            key={image.id}
            total={images.length}
          >
            {/* Square on a phone; on a computer as tall as most screens
                hold beside the article's name and price. */}
            <div className="relative aspect-square bg-store-surface md:aspect-auto md:h-160">
              <Image
                alt={image.alt}
                className="object-cover"
                fill
                // The first photo is what the visitor came for.
                priority={position === 0}
                sizes={
                  images.length > 1
                    ? "(min-width: 768px) 40vw, 88vw"
                    : "(min-width: 1024px) 70vw, 100vw"
                }
                src={image.url}
              />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <GalleryControls images={images} />
    </Carousel>
  );
}

export { StoreGallery };
