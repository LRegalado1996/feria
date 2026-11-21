"use client";

import {
  closestCenter,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  RotateCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import { useId } from "react";

import { Button } from "@/app/_components/atoms/button";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import type { QueuedPhoto } from "@/lib/hooks/upload";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/utils/format";

/** A photo the article holds, with what its thumbnail is drawn from. */
export interface ProductPhoto {
  height: number;
  /** A local address while this browser has the file, else `url`. */
  preview: string;
  url: string;
  width: number;
}

export interface ProductPhotoGridProps {
  className?: string;
  /** Takes the photo at `index` to the first place: the main one. */
  onMakeMain: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onRemoveQueued: (key: string) => void;
  onRetry: (key: string) => void;
  photos: readonly ProductPhoto[];
  /** Photos chosen and still on their way, after the article's own. */
  queued: readonly QueuedPhoto[];
}

/** The widths a thumbnail is drawn at: two columns on a phone, four wide. */
const TILE_SIZES = "(min-width: 1024px) 12rem, (min-width: 768px) 30vw, 45vw";

// One column that may shrink to the tile's width (`grid-cols-1` is
// `minmax(0, 1fr)`): an `auto` column grows to its widest line, and a long
// failure once pushed the photo and its buttons out of the tile.
const TILE_CLASS =
  "grid min-w-0 grid-cols-1 content-start gap-2 overflow-hidden rounded-lg border bg-card p-2 text-card-foreground";

/** The photo's square, its picture held inside it whatever its shape. */
const FRAME_CLASS =
  "relative aspect-square min-w-0 overflow-hidden rounded-md bg-muted";

/**
 * An article's photos as tiles in their order (FER-017), the first one the
 * main photo, marked as such: the one the store's cards show. Each can be
 * dragged to another place (a short press on a phone; on a computer the
 * mouse, or the keyboard on the photo: space, the arrows, space), moved one
 * place either way with its buttons, made the main photo with its star,
 * which takes it to the first place, or removed. Photos still on their way
 * follow, with their progress, and can be cancelled; a failed one says why
 * and offers a retry when one can help. Every control is named with its
 * photo ("Mover después: Foto 2"); dnd-kit's words are the page's language.
 */
function ProductPhotoGrid({
  className,
  onMakeMain,
  onMove,
  onRemove,
  onRemoveQueued,
  onRetry,
  photos,
  queued,
}: ProductPhotoGridProps) {
  const { admin, articles } = useDictionary();
  const copy = articles.wizard.photos;
  const locale = useLocale();
  // dnd-kit numbers its accessibility ids per page load, so the server's and
  // the browser's would differ: React's id is the same on both.
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // A short press first, so a swipe still scrolls the page on a phone.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  /** What a photo on its way says about itself. */
  const queuedSays = (state: QueuedPhoto["state"]) => {
    if (state.status === "failed") {
      return admin.imageUpload.errors[state.reason];
    }

    if (state.status === "uploading") {
      return interpolate(copy.uploading, {
        percent: formatPercent(state.percent, locale),
      });
    }

    return state.status === "preparing" ? copy.preparing : copy.waiting;
  };
  const nameAt = (index: number) =>
    interpolate(copy.photo, { position: index + 1 });
  const nameOf = (id: UniqueIdentifier) =>
    nameAt(photos.findIndex((photo) => photo.url === id));
  const accessibility = {
    announcements: {
      onDragCancel: ({ active }: DragCancelEvent) =>
        interpolate(copy.move.cancelled, { photo: nameOf(active.id) }),
      // A drop that moved the photo is said by the wizard, with its place.
      onDragEnd: ({ active, over }: DragEndEvent) =>
        over && over.id !== active.id
          ? undefined
          : interpolate(copy.move.stayed, { photo: nameOf(active.id) }),
      onDragOver: ({ active, over }: DragOverEvent) =>
        over && over.id !== active.id
          ? interpolate(copy.move.over, {
              over: nameOf(over.id),
              photo: nameOf(active.id),
            })
          : undefined,
      onDragStart: ({ active }: DragStartEvent) =>
        interpolate(copy.move.picked, { photo: nameOf(active.id) }),
    },
    screenReaderInstructions: { draggable: copy.move.instructions },
  };

  return (
    <div className={cn("grid gap-3", className)} data-slot="product-photo-grid">
      <DndContext
        accessibility={accessibility}
        collisionDetection={closestCenter}
        id={dndId}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) {
            return;
          }

          onMove(
            photos.findIndex((photo) => photo.url === active.id),
            photos.findIndex((photo) => photo.url === over.id)
          );
        }}
        sensors={sensors}
      >
        <SortableContext
          items={photos.map((photo) => photo.url)}
          strategy={rectSortingStrategy}
        >
          <ul
            aria-label={copy.list}
            className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4"
            data-testid="product-photo-grid"
          >
            {photos.map((photo, index) => (
              <PhotoTile
                first={index === 0}
                key={photo.url}
                last={index === photos.length - 1}
                name={nameAt(index)}
                onMakeMain={() => {
                  onMakeMain(index);
                }}
                onMove={(offset) => {
                  onMove(index, index + offset);
                }}
                onRemove={() => {
                  onRemove(index);
                }}
                photo={photo}
              />
            ))}
            {queued.map((item, index) => (
              <QueuedTile
                item={item}
                key={item.key}
                name={nameAt(photos.length + index)}
                onRemove={() => {
                  onRemoveQueued(item.key);
                }}
                onRetry={() => {
                  onRetry(item.key);
                }}
                says={queuedSays(item.state)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function PhotoTile({
  first,
  last,
  name,
  onMakeMain,
  onMove,
  onRemove,
  photo,
}: {
  first: boolean;
  last: boolean;
  name: string;
  onMakeMain: () => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
  photo: ProductPhoto;
}) {
  const copy = useDictionary().articles.wizard.photos;
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: photo.url });

  return (
    <li
      className={cn(
        TILE_CLASS,
        "motion-safe:animate-wizard-settle",
        first && "border-foreground",
        isDragging && "relative z-10 shadow-sm"
      )}
      data-main={first}
      data-testid="product-photo"
      data-url={photo.url}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className={FRAME_CLASS}>
        {/* The photo is the handle: a short press drags it on a phone, and
            the keyboard picks it up with space. */}
        <button
          aria-label={interpolate(copy.drag, { photo: name })}
          className="absolute inset-0 cursor-grab touch-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
        >
          <Image
            alt=""
            className="object-contain"
            fill
            sizes={TILE_SIZES}
            src={photo.preview}
            unoptimized={photo.preview.startsWith("blob:")}
          />
        </button>
        {first ? (
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
            <Star aria-hidden className="size-3 fill-current" />
            {copy.main}
          </span>
        ) : null}
        <Button
          aria-label={interpolate(copy.remove, { photo: name })}
          className="absolute top-1 right-1 rounded-full bg-background/90"
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-between">
        {/* `aria-disabled`, never `disabled`, at either end: a move that
            lands a photo there would disable the focused button and drop
            focus to the page, as the main photo's star avoids too. */}
        <Button
          aria-disabled={first || undefined}
          aria-label={interpolate(copy.moveEarlier, { photo: name })}
          className="aria-disabled:opacity-50"
          onClick={() => {
            if (!first) {
              onMove(-1);
            }
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowLeft aria-hidden />
        </Button>
        <Button
          aria-disabled={first || undefined}
          aria-label={interpolate(first ? copy.isMain : copy.makeMain, {
            photo: name,
          })}
          onClick={() => {
            if (!first) {
              onMakeMain();
            }
          }}
          size="icon"
          type="button"
          variant={first ? "secondary" : "ghost"}
        >
          <Star aria-hidden className={cn(first && "fill-current")} />
        </Button>
        <Button
          aria-disabled={last || undefined}
          aria-label={interpolate(copy.moveLater, { photo: name })}
          className="aria-disabled:opacity-50"
          onClick={() => {
            if (!last) {
              onMove(1);
            }
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </li>
  );
}

/**
 * A photo on its way: its thumbnail, dimmed until it arrives, with its
 * progress; what it is doing, or why it stopped, in words that wrap inside
 * the tile; cancel or discard on the photo's corner, as a stored photo's
 * remove; a retry under the words when one can help.
 */
function QueuedTile({
  item,
  name,
  onRemove,
  onRetry,
  says,
}: {
  item: QueuedPhoto;
  name: string;
  onRemove: () => void;
  onRetry: () => void;
  says: string;
}) {
  const copy = useDictionary().articles.wizard.photos;
  const { state } = item;
  const failed = state.status === "failed";

  return (
    <li
      className={cn(TILE_CLASS, failed && "border-destructive/50")}
      data-status={state.status}
      data-testid="product-photo-queued"
    >
      <div className={FRAME_CLASS} data-testid="product-photo-queued-frame">
        <Image
          alt={name}
          className={cn("object-contain", failed ? "opacity-40" : "opacity-60")}
          fill
          sizes={TILE_SIZES}
          src={item.preview}
          unoptimized
        />
        {failed ? (
          <CircleAlert
            aria-hidden
            className="absolute top-2 left-2 size-6 rounded-full bg-background text-destructive"
          />
        ) : (
          <progress
            aria-label={interpolate(copy.progress, { photo: name })}
            className="absolute inset-x-2 bottom-2 h-1.5 w-[calc(100%-1rem)] appearance-none overflow-hidden rounded-full bg-secondary [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:bg-primary"
            max={100}
            value={state.status === "uploading" ? state.percent : undefined}
          />
        )}
        <Button
          aria-label={interpolate(failed ? copy.discard : copy.cancel, {
            photo: name,
          })}
          className="absolute top-1 right-1 rounded-full bg-background/90"
          onClick={onRemove}
          size="icon"
          type="button"
          variant="ghost"
        >
          {failed ? <Trash2 aria-hidden /> : <X aria-hidden />}
        </Button>
      </div>
      <p
        className={cn(
          "min-w-0 text-xs wrap-break-word",
          failed ? "text-destructive" : "text-muted-foreground"
        )}
        data-testid="product-photo-queued-status"
        role={failed ? "alert" : undefined}
      >
        {says}
      </p>
      {failed && state.reason === "failed" ? (
        <Button
          aria-label={interpolate(copy.retry, { photo: name })}
          className="w-full"
          onClick={onRetry}
          size="sm"
          type="button"
          variant="outline"
        >
          <RotateCcw aria-hidden />
          {copy.retryShort}
        </Button>
      ) : null}
    </li>
  );
}

export { ProductPhotoGrid };
