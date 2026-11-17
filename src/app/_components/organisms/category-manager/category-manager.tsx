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
import {
  ArrowDown,
  ArrowUp,
  FileText,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { type RefObject, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { AdminPage } from "@/app/_components/molecules/admin-page";
import {
  CategoryForm,
  type CategoryFormResult,
} from "@/app/_components/molecules/category-form";
import { CategoryPageForm } from "@/app/_components/molecules/category-page-form";
import { DeleteCategoryDialog } from "@/app/_components/molecules/delete-category-dialog";
import { EmptyState } from "@/app/_components/molecules/empty-state";
import { focusFirstField } from "@/lib/admin/focus-first-field";
import { reportError } from "@/lib/errors/client";
import {
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
  useReorderCategories,
  useStoreCategories,
  useUpdateCategoryPage,
} from "@/lib/hooks/category";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import type { client } from "@/lib/orpc/client";
import { cn } from "@/lib/utils";

type StoreCategory = Awaited<ReturnType<typeof client.category.list>>[number];

/** A failed save, as the form shows it: a taken name, or anything else. */
function toFormResult(error: unknown, action: string): CategoryFormResult {
  if (error instanceof ORPCError && error.code === "CONFLICT") {
    return "duplicate";
  }

  reportError(error, { action });
  return "failed";
}

/**
 * The store's categories on one screen (FER-016): add inline, rename in both
 * languages, reorder by dragging (or with the buttons, or the keyboard on the
 * handle), and delete, moving the articles of a category that has some.
 */
function CategoryManager() {
  const { admin, common } = useDictionary();
  const copy = admin.categories;
  const categories = useStoreCategories();
  const create = useCreateCategory();
  const reorder = useReorderCategories();
  const [announcement, setAnnouncement] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const addForm = useRef<HTMLDivElement>(null);

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
    <section data-slot="category-manager" data-testid="category-manager">
      <AdminPage
        primaryAction={
          <Button
            className="w-full md:w-auto"
            onClick={() => {
              focusFirstField(addForm.current);
            }}
            type="button"
          >
            <Plus aria-hidden="true" />
            {copy.add.title}
          </Button>
        }
        title={copy.title}
        titleRef={titleRef}
      >
        <p className="text-sm text-muted-foreground">{copy.description}</p>
        <div
          className="scroll-mt-24 space-y-3 rounded-lg border bg-card p-4 text-card-foreground md:p-5"
          ref={addForm}
        >
          <h2 className="text-sm font-semibold">{copy.add.title}</h2>
          <CategoryForm
            onSave={async (names) => {
              try {
                await create.mutateAsync(names);
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
              <Skeleton className="h-16 w-full rounded-lg" key={row} />
            ))}
          </div>
        ) : null}
        {categories.isError ? (
          <div
            className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
            role="alert"
          >
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
          <EmptyState
            className="rounded-lg border bg-card px-6"
            message={copy.empty}
          />
        ) : null}
        {categories.data && categories.data.length > 0 ? (
          <CategoryList
            countLabel={countLabel}
            move={move}
            rows={categories.data}
            titleRef={titleRef}
          />
        ) : null}
      </AdminPage>
    </section>
  );
}

function CategoryList({
  countLabel,
  move,
  rows,
  titleRef,
}: {
  countLabel: (count: number) => string;
  move: (rows: StoreCategory[], from: number, to: number) => void;
  rows: StoreCategory[];
  titleRef: RefObject<HTMLHeadingElement | null>;
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
        {/* A card per category on a phone; one card of rows from `md` up. */}
        <ul
          aria-label={admin.categories.list}
          className="space-y-2 md:space-y-0 md:divide-y md:rounded-lg md:border"
          data-testid="category-list"
        >
          {rows.map((row, index) => (
            <CategoryRow
              countLabel={countLabel(row.productCount)}
              first={index === 0}
              groups={rows
                .filter(
                  (other) => other.parentId === null && other.id !== row.id
                )
                .map((other) => ({ id: other.id, name: other.nameEs }))}
              holds={rows.filter((other) => other.parentId === row.id).length}
              inGroup={
                rows.find((other) => other.id === row.parentId)?.nameEs ?? null
              }
              key={row.id}
              last={index === rows.length - 1}
              onMove={(offset) => {
                move(rows, index, index + offset);
              }}
              others={rows.filter((other) => other.id !== row.id)}
              row={row}
              titleRef={titleRef}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Where a category stands among the groups (FER-043): in one, holding some,
 * or neither.
 */
function groupCaption(
  copy: { holds: string; holdsOne: string; inGroup: string },
  inGroup: string | null,
  holds: number
): string | null {
  if (inGroup !== null) {
    return interpolate(copy.inGroup, { group: inGroup });
  }

  if (holds === 0) {
    return null;
  }

  return holds === 1
    ? copy.holdsOne
    : interpolate(copy.holds, { count: String(holds) });
}

function CategoryRow({
  countLabel,
  first,
  groups,
  holds,
  inGroup,
  last,
  onMove,
  others,
  row,
  titleRef,
}: {
  countLabel: string;
  first: boolean;
  /** The groups it can join (FER-043). */
  groups: { id: number; name: string }[];
  /** How many categories it holds, as a group. */
  holds: number;
  /** The name of the group it is in, or `null`. */
  inGroup: string | null;
  last: boolean;
  onMove: (offset: number) => void;
  others: StoreCategory[];
  row: StoreCategory;
  /** Where focus goes once the category is deleted and its row is gone. */
  titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { admin } = useDictionary();
  const copy = admin.categories;
  const rename = useRenameCategory();
  const updatePage = useUpdateCategoryPage();
  const groupLabel = groupCaption(copy.page, inGroup, holds);
  const [paging, setPaging] = useState(false);
  const pageButton = useRef<HTMLButtonElement>(null);
  const remove = useDeleteCategory();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
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
        "flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-card-foreground md:rounded-none md:border-0 md:first:rounded-t-lg md:last:rounded-b-lg",
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
              await rename.mutateAsync({ ...names, id: row.id });
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
          {/* The rest of the first line on a phone, so the buttons take
              the next one; beside them from `md` up. */}
          <div className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] md:basis-0">
            <p
              className="truncate text-base font-semibold md:text-sm"
              data-testid="category-name"
            >
              {row.nameEs}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {row.nameEn ? <span lang="en">{row.nameEn} · </span> : null}
              <span data-testid="category-count">{countLabel}</span>
            </p>
            {groupLabel ? (
              <p
                className="truncate text-xs font-medium"
                data-testid="category-group"
              >
                {groupLabel}
              </p>
            ) : null}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
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
              aria-expanded={paging}
              aria-label={interpolate(copy.page.action, { name: row.nameEs })}
              // While a save is on its way the page stays as it is: closing and
              // reopening it would let that save close a newer editor.
              disabled={updatePage.isPending}
              onClick={() => {
                setPaging((was) => !was);
              }}
              ref={pageButton}
              size="icon"
              variant="ghost"
            >
              <FileText aria-hidden="true" className="size-4" />
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
              ref={deleteButton}
              size="icon"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </>
      )}
      {/* Kept while the names are being renamed: what was typed in the page
          stays. */}
      {paging ? (
        <CategoryPageForm
          category={row}
          className="min-w-0 basis-full border-t pt-4 md:px-12"
          groups={groups}
          isGroup={holds > 0}
          onCancel={() => {
            setPaging(false);
            pageButton.current?.focus();
          }}
          onSave={async (values) => {
            try {
              await updatePage.mutateAsync(values);
              setPaging(false);
              toast.success(copy.toasts.pageSaved);
              pageButton.current?.focus();
              return "saved";
            } catch (error) {
              reportError(error, { action: "Category.update_page" });
              return "failed";
            }
          }}
        />
      ) : null}
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
                await remove.mutateAsync({ id: row.id, moveToId });
                // Closed first: while open, the dialog's focus trap would pull
                // focus back into it.
                flushSync(() => {
                  setDeleting(false);
                });
                titleRef.current?.focus();
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
          // It has no trigger of its own, so it only ever reports closing.
          // It is unmounted as it closes and cannot give focus back itself:
          // the delete button that opened it takes it.
          onOpenChange={() => {
            flushSync(() => {
              setDeleting(false);
            });
            deleteButton.current?.focus();
          }}
          open={deleting}
          others={others.map((other) => ({ id: other.id, name: other.nameEs }))}
        />
      ) : null}
    </li>
  );
}

export { CategoryManager };
