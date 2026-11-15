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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ORPCError } from "@orpc/client";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import {
  CategoryForm,
  type CategoryFormResult,
} from "@/app/_components/molecules/category-form";
import { DeleteCategoryDialog } from "@/app/_components/molecules/delete-category-dialog";
import { EmptyState } from "@/app/_components/molecules/empty-state";
import { reportError } from "@/lib/errors/client";
import {
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
  useReorderCategories,
  useStoreCategories,
} from "@/lib/hooks/category";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import type { client } from "@/lib/orpc/client";
import { cn } from "@/lib/utils";

type StoreCategory = Awaited<ReturnType<typeof client.category.list>>[number];

export interface CategoryManagerProps {
  storeSlug: string;
}

/** A failed save, as the form shows it: a taken name, or anything else. */
function toFormResult(error: unknown, action: string): CategoryFormResult {
  if (error instanceof ORPCError && error.code === "CONFLICT") {
    return "duplicate";
  }

  reportError(error, { action });
  return "failed";
}

/**
 * A store's categories on one screen (FER-016): add inline, rename in both
 * languages, reorder by dragging (or with the buttons, or the keyboard on the
 * handle), and delete, moving the articles of a category that has some.
 */
function CategoryManager({ storeSlug }: CategoryManagerProps) {
  const { admin, common } = useDictionary();
  const copy = admin.categories;
  const categories = useStoreCategories(storeSlug);
  const create = useCreateCategory(storeSlug);
  const reorder = useReorderCategories(storeSlug);
  const [announcement, setAnnouncement] = useState("");

  const countLabel = (count: number) =>
    count === 1
      ? copy.countOne
      : interpolate(copy.count, { count: String(count) });

  const move = (rows: StoreCategory[], from: number, to: number) => {
    const moved = rows[from];

    if (!moved || to < 0 || to >= rows.length || from === to) {
      return;
    }

    const next = arrayMove(rows, from, to);
    // Awaited, not a per-call callback: those run only for the latest call
    // and only while mounted, so a failed first move of two would go unsaid.
    void (async () => {
      try {
        await reorder.mutateAsync({
          ids: next.map((row) => row.id),
          storeSlug,
        });
      } catch (error) {
        reportError(error, { action: "Category.reorder" });
        toast.error(copy.errors.generic);
        // The list went back to its order: say so where the move was said.
        setAnnouncement(copy.errors.generic);
      }
    })();
    setAnnouncement(
      interpolate(copy.move.moved, {
        name: moved.nameEs,
        position: String(to + 1),
        total: String(rows.length),
      })
    );
  };

  return (
    <section
      className="space-y-6"
      data-slot="category-manager"
      data-testid="category-manager"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{copy.add.title}</h2>
        <CategoryForm
          onSave={async (names) => {
            try {
              await create.mutateAsync({ ...names, storeSlug });
              toast.success(copy.toasts.created);
              return "saved";
            } catch (error) {
              return toFormResult(error, "Category.create");
            }
          }}
          pendingLabel={copy.add.pending}
          submitLabel={copy.add.submit}
        />
      </div>
      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>
      {categories.isPending ? (
        <div
          aria-busy="true"
          className="space-y-2"
          data-testid="category-list-skeleton"
        >
          <span className="sr-only">{common.loading}</span>
          {["first", "second", "third"].map((row) => (
            <Skeleton className="h-14 w-full" key={row} />
          ))}
        </div>
      ) : null}
      {categories.isError ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm">{copy.errors.load}</p>
          <Button
            onClick={() => {
              void categories.refetch();
            }}
            size="sm"
            variant="outline"
          >
            {common.tryAgain}
          </Button>
        </div>
      ) : null}
      {categories.data?.length === 0 ? (
        <EmptyState message={copy.empty} />
      ) : null}
      {categories.data && categories.data.length > 0 ? (
        <CategoryList
          countLabel={countLabel}
          move={move}
          rows={categories.data}
          storeSlug={storeSlug}
        />
      ) : null}
    </section>
  );
}

function CategoryList({
  countLabel,
  move,
  rows,
  storeSlug,
}: {
  countLabel: (count: number) => string;
  move: (rows: StoreCategory[], from: number, to: number) => void;
  rows: StoreCategory[];
  storeSlug: string;
}) {
  const { admin } = useDictionary();
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

  const copy = admin.categories.move;
  const nameOf = (id: UniqueIdentifier) =>
    rows.find((row) => row.id === id)?.nameEs ?? "";
  // dnd-kit's own words are English and read the row's id: these are the
  // page's language and say the category's name.
  const accessibility = {
    announcements: {
      onDragCancel: ({ active }: DragCancelEvent) =>
        interpolate(copy.cancelled, { name: nameOf(active.id) }),
      // A drop that moved the row is announced by `move`, with its place.
      onDragEnd: ({ active, over }: DragEndEvent) =>
        over && over.id !== active.id
          ? undefined
          : interpolate(copy.stayed, { name: nameOf(active.id) }),
      // Over its own place says nothing: dnd-kit reports that right after
      // the pick-up, and it would replace "Picked up" with a row over itself.
      onDragOver: ({ active, over }: DragOverEvent) =>
        over && over.id !== active.id
          ? interpolate(copy.over, {
              name: nameOf(active.id),
              over: nameOf(over.id),
            })
          : undefined,
      onDragStart: ({ active }: DragStartEvent) =>
        interpolate(copy.picked, { name: nameOf(active.id) }),
    },
    screenReaderInstructions: { draggable: copy.instructions },
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }

    move(
      rows,
      rows.findIndex((row) => row.id === active.id),
      rows.findIndex((row) => row.id === over.id)
    );
  };

  return (
    <DndContext
      accessibility={accessibility}
      collisionDetection={closestCenter}
      id={dndId}
      onDragEnd={onDragEnd}
      sensors={sensors}
    >
      <SortableContext
        items={rows.map((row) => row.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul
          aria-label={admin.categories.list}
          className="divide-y rounded-lg border"
          data-testid="category-list"
        >
          {rows.map((row, index) => (
            <CategoryRow
              countLabel={countLabel(row.productCount)}
              first={index === 0}
              key={row.id}
              last={index === rows.length - 1}
              onMove={(offset) => {
                move(rows, index, index + offset);
              }}
              others={rows.filter((other) => other.id !== row.id)}
              row={row}
              storeSlug={storeSlug}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function CategoryRow({
  countLabel,
  first,
  last,
  onMove,
  others,
  row,
  storeSlug,
}: {
  countLabel: string;
  first: boolean;
  last: boolean;
  onMove: (offset: number) => void;
  others: StoreCategory[];
  row: StoreCategory;
  storeSlug: string;
}) {
  const { admin } = useDictionary();
  const copy = admin.categories;
  const rename = useRenameCategory(storeSlug);
  const remove = useDeleteCategory(storeSlug);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: row.id });

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-2 bg-background p-3",
        isDragging && "relative z-10 shadow-sm"
      )}
      data-testid={`category-row-${row.slug}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        aria-label={interpolate(copy.move.drag, { name: row.nameEs })}
        className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:size-9"
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-4" />
      </button>
      {editing ? (
        <CategoryForm
          className="min-w-0 flex-1 basis-full sm:basis-0"
          onCancel={() => {
            setEditing(false);
          }}
          onSave={async (names) => {
            try {
              await rename.mutateAsync({ ...names, id: row.id, storeSlug });
              setEditing(false);
              toast.success(copy.toasts.renamed);
              return "saved";
            } catch (error) {
              return toFormResult(error, "Category.rename");
            }
          }}
          pendingLabel={copy.edit.pending}
          submitLabel={copy.edit.submit}
          values={{ nameEn: row.nameEn, nameEs: row.nameEs }}
        />
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-semibold"
              data-testid="category-name"
            >
              {row.nameEs}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {row.nameEn ? <span lang="en">{row.nameEn} · </span> : null}
              <span data-testid="category-count">{countLabel}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              aria-label={interpolate(copy.move.up, { name: row.nameEs })}
              disabled={first}
              onClick={() => {
                onMove(-1);
              }}
              size="icon"
              variant="ghost"
            >
              <ArrowUp aria-hidden="true" className="size-4" />
            </Button>
            <Button
              aria-label={interpolate(copy.move.down, { name: row.nameEs })}
              disabled={last}
              onClick={() => {
                onMove(1);
              }}
              size="icon"
              variant="ghost"
            >
              <ArrowDown aria-hidden="true" className="size-4" />
            </Button>
            <Button
              aria-label={interpolate(copy.edit.action, { name: row.nameEs })}
              onClick={() => {
                setEditing(true);
              }}
              size="icon"
              variant="ghost"
            >
              <Pencil aria-hidden="true" className="size-4" />
            </Button>
            <Button
              aria-label={interpolate(copy.delete.action, { name: row.nameEs })}
              onClick={() => {
                setDeleteError(null);
                setDeleting(true);
              }}
              size="icon"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </>
      )}
      {deleting ? (
        <DeleteCategoryDialog
          category={{
            countLabel,
            id: row.id,
            name: row.nameEs,
            productCount: row.productCount,
          }}
          error={deleteError}
          isPending={remove.isPending}
          onChoose={() => {
            setDeleteError(null);
          }}
          onConfirm={(moveToId) => {
            // A retry starts without the previous try's error.
            setDeleteError(null);
            void (async () => {
              try {
                // Awaited here, not in a per-call callback: the list read
                // after the deletion unmounts this row, and TanStack runs no
                // per-call callback for an unmounted component.
                await remove.mutateAsync({ id: row.id, moveToId, storeSlug });
                setDeleting(false);
                toast.success(copy.toasts.deleted);
              } catch (error) {
                // Refused because it gained articles since it was loaded:
                // the list is read again and the dialog asks where they go.
                if (
                  error instanceof ORPCError &&
                  error.code === "BAD_REQUEST"
                ) {
                  setDeleteError(copy.delete.moveRequired);
                  return;
                }

                reportError(error, { action: "Category.delete" });
                setDeleteError(copy.errors.generic);
              }
            })();
          }}
          onOpenChange={setDeleting}
          open={deleting}
          others={others.map((other) => ({ id: other.id, name: other.nameEs }))}
        />
      ) : null}
    </li>
  );
}

export { CategoryManager };
