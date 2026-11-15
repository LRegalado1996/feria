"use client";

import { ORPCError } from "@orpc/client";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { type RefObject, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import {
  AttributeForm,
  type AttributeFormResult,
} from "@/app/_components/molecules/attribute-form";
import { ConfirmDialog } from "@/app/_components/molecules/confirm-dialog";
import { EmptyState } from "@/app/_components/molecules/empty-state";
import { reportError } from "@/lib/errors/client";
import {
  useCreateAttribute,
  useCreateAttributeValue,
  useDeleteAttribute,
  useDeleteAttributeValue,
  useRenameAttribute,
  useReorderAttributes,
  useReorderAttributeValues,
  useStoreAttributes,
  useUpdateAttributeValue,
} from "@/lib/hooks/attribute";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import type { client } from "@/lib/orpc/client";

type StoreAttribute = Awaited<ReturnType<typeof client.attribute.list>>[number];
type StoreAttributeValue = StoreAttribute["values"][number];

export interface FilterManagerProps {
  storeSlug: string;
}

/** A failed save, as the form shows it: a taken name, or anything else. */
function toFormResult(error: unknown, action: string): AttributeFormResult {
  if (error instanceof ORPCError && error.code === "CONFLICT") {
    return "duplicate";
  }

  reportError(error, { action });
  return "failed";
}

/** `ids` with the one at `from` moved to `to`, or `null` for no move. */
function moved(ids: number[], from: number, to: number) {
  const id = ids[from];
  const rest = ids.filter((other) => other !== id);

  // The first row's "up" and the last row's "down" are disabled, so this
  // only guards a call the screen cannot make.
  return id === undefined || to < 0 || to >= ids.length || from === to
    ? null
    : [...rest.slice(0, to), id, ...rest.slice(to)];
}

/** Puts focus on an element after a dialog closed (design.md § Focus). */
function focusOn(ref: RefObject<HTMLElement | null>) {
  return (event: Event) => {
    event.preventDefault();
    ref.current?.focus();
  };
}

/**
 * A store's filters on one screen (FER-033): add a filter, then its values
 * inline, each with an optional swatch and the number of articles that carry
 * it; rename, reorder with the buttons, and delete. Deleting asks first, and
 * a value in use says how many articles lose it.
 */
function FilterManager({ storeSlug }: FilterManagerProps) {
  const { admin, common } = useDictionary();
  const copy = admin.filters;
  const attributes = useStoreAttributes(storeSlug);
  const create = useCreateAttribute(storeSlug);
  const reorder = useReorderAttributes(storeSlug);
  const reorderValues = useReorderAttributeValues(storeSlug);
  const [announcement, setAnnouncement] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);

  const countLabel = (count: number) =>
    count === 1
      ? copy.countOne
      : interpolate(copy.count, { count: String(count) });

  /** Saves a new order and says where the row went; a failure is said too. */
  const announceMove = (
    save: () => Promise<unknown>,
    { name, position, total }: { name: string; position: number; total: number }
  ) => {
    void (async () => {
      try {
        await save();
      } catch (error) {
        reportError(error, { action: "Attribute.reorder" });
        toast.error(copy.errors.generic);
        setAnnouncement(copy.errors.generic);
      }
    })();
    setAnnouncement(
      interpolate(copy.move.moved, {
        name,
        position: String(position + 1),
        total: String(total),
      })
    );
  };

  const rows = attributes.data;

  return (
    <section
      className="space-y-6"
      data-slot="filter-manager"
      data-testid="filter-manager"
    >
      <div className="space-y-1">
        <h1
          className="text-2xl font-bold focus-visible:outline-none"
          ref={titleRef}
          tabIndex={-1}
        >
          {copy.title}
        </h1>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">{copy.add.title}</h2>
        <AttributeForm
          onSave={async ({ nameEn, nameEs }) => {
            try {
              await create.mutateAsync({ nameEn, nameEs, storeSlug });
              toast.success(copy.toasts.created);
              return "saved";
            } catch (error) {
              return toFormResult(error, "Attribute.create");
            }
          }}
          pendingLabel={copy.add.pending}
          submitLabel={copy.add.submit}
        />
      </div>
      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>
      {attributes.isPending ? (
        <div
          aria-busy="true"
          className="space-y-2"
          data-testid="filter-list-skeleton"
        >
          <span className="sr-only">{common.loading}</span>
          {["first", "second"].map((row) => (
            <Skeleton className="h-40 w-full" key={row} />
          ))}
        </div>
      ) : null}
      {attributes.isError ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm">{copy.errors.load}</p>
          <Button
            onClick={() => {
              void attributes.refetch();
            }}
            size="sm"
            variant="outline"
          >
            {common.tryAgain}
          </Button>
        </div>
      ) : null}
      {rows?.length === 0 ? <EmptyState message={copy.empty} /> : null}
      {rows && rows.length > 0 ? (
        <ul
          aria-label={copy.list}
          className="space-y-4"
          data-testid="filter-list"
        >
          {rows.map((row, index) => (
            <FilterCard
              countLabel={countLabel}
              first={index === 0}
              key={row.id}
              last={index === rows.length - 1}
              onMove={(offset) => {
                const ids = moved(
                  rows.map((other) => other.id),
                  index,
                  index + offset
                );

                if (ids) {
                  announceMove(
                    async () => await reorder.mutateAsync({ ids, storeSlug }),
                    {
                      name: row.nameEs,
                      position: index + offset,
                      total: rows.length,
                    }
                  );
                }
              }}
              onMoveValue={(value, from, to) => {
                const ids = moved(
                  row.values.map((other) => other.id),
                  from,
                  to
                );

                if (ids) {
                  announceMove(
                    async () =>
                      await reorderValues.mutateAsync({
                        attributeId: row.id,
                        ids,
                        storeSlug,
                      }),
                    {
                      name: value.nameEs,
                      position: to,
                      total: row.values.length,
                    }
                  );
                }
              }}
              row={row}
              storeSlug={storeSlug}
              titleRef={titleRef}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface FilterCardProps {
  countLabel: (count: number) => string;
  first: boolean;
  last: boolean;
  onMove: (offset: number) => void;
  onMoveValue: (value: StoreAttributeValue, from: number, to: number) => void;
  row: StoreAttribute;
  storeSlug: string;
  /** Where focus goes once the filter is deleted. */
  titleRef: RefObject<HTMLHeadingElement | null>;
}

function FilterCard({
  countLabel,
  first,
  last,
  onMove,
  onMoveValue,
  row,
  storeSlug,
  titleRef,
}: FilterCardProps) {
  const { admin } = useDictionary();
  const copy = admin.filters;
  const rename = useRenameAttribute(storeSlug);
  const remove = useDeleteAttribute(storeSlug);
  const createValue = useCreateAttributeValue(storeSlug);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  return (
    <li
      className="space-y-4 rounded-lg border p-3 sm:p-4"
      data-testid={`filter-card-${row.slug}`}
    >
      {editing ? (
        <AttributeForm
          onCancel={() => {
            setEditing(false);
          }}
          onSave={async ({ nameEn, nameEs }) => {
            try {
              await rename.mutateAsync({
                id: row.id,
                nameEn,
                nameEs,
                storeSlug,
              });
              setEditing(false);
              toast.success(copy.toasts.renamed);
              return "saved";
            } catch (error) {
              return toFormResult(error, "Attribute.rename");
            }
          }}
          pendingLabel={copy.edit.pending}
          submitLabel={copy.edit.submit}
          values={{ nameEn: row.nameEn, nameEs: row.nameEs, swatchColor: null }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2
              className="truncate text-lg font-semibold focus-visible:outline-none"
              data-testid="filter-name"
              ref={headingRef}
              tabIndex={-1}
            >
              {row.nameEs}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {row.nameEn ? <span lang="en">{row.nameEn} · </span> : null}
              <code>?{row.slug}=</code>
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
                setDeleting(true);
              }}
              size="icon"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      )}
      {row.values.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.emptyValues}</p>
      ) : (
        <ul
          aria-label={interpolate(copy.values, { name: row.nameEs })}
          className="divide-y rounded-md border"
        >
          {row.values.map((value, index) => (
            <ValueRow
              countLabel={countLabel(value.productCount)}
              first={index === 0}
              headingRef={headingRef}
              key={value.id}
              last={index === row.values.length - 1}
              onMove={(offset) => {
                onMoveValue(value, index, index + offset);
              }}
              storeSlug={storeSlug}
              value={value}
            />
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">
          {interpolate(copy.addValue.title, { name: row.nameEs })}
        </h3>
        <AttributeForm
          onSave={async (values) => {
            try {
              await createValue.mutateAsync({
                ...values,
                attributeId: row.id,
                storeSlug,
              });
              toast.success(copy.toasts.valueCreated);
              return "saved";
            } catch (error) {
              return toFormResult(error, "Attribute.create_value");
            }
          }}
          pendingLabel={copy.addValue.pending}
          submitLabel={copy.addValue.submit}
          withSwatch
        />
      </div>
      <ConfirmDialog
        confirmLabel={copy.delete.confirm}
        description={interpolate(copy.delete.description, {
          count: String(row.values.length),
          name: row.nameEs,
        })}
        isPending={remove.isPending}
        onCloseAutoFocus={focusOn(titleRef)}
        onConfirm={() => {
          void (async () => {
            try {
              // Awaited here: the list read after the deletion unmounts this
              // card, and TanStack runs no per-call callback once unmounted.
              await remove.mutateAsync({ id: row.id, storeSlug });
              setDeleting(false);
              toast.success(copy.toasts.deleted);
            } catch (error) {
              reportError(error, { action: "Attribute.delete" });
              toast.error(copy.errors.generic);
            }
          })();
        }}
        onOpenChange={setDeleting}
        open={deleting}
        title={copy.delete.title}
      />
    </li>
  );
}

interface ValueRowProps {
  countLabel: string;
  first: boolean;
  /** The filter's heading, where focus goes once the value is deleted. */
  headingRef: RefObject<HTMLHeadingElement | null>;
  last: boolean;
  onMove: (offset: number) => void;
  storeSlug: string;
  value: StoreAttributeValue;
}

function ValueRow({
  countLabel,
  first,
  headingRef,
  last,
  onMove,
  storeSlug,
  value,
}: ValueRowProps) {
  const { admin } = useDictionary();
  const copy = admin.filters;
  const update = useUpdateAttributeValue(storeSlug);
  const remove = useDeleteAttributeValue(storeSlug);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <li
      className="flex flex-wrap items-center gap-2 p-2 sm:p-3"
      data-testid={`filter-value-${value.slug}`}
    >
      {editing ? (
        <AttributeForm
          className="min-w-0 flex-1 basis-full"
          onCancel={() => {
            setEditing(false);
          }}
          onSave={async (values) => {
            try {
              await update.mutateAsync({ ...values, id: value.id, storeSlug });
              setEditing(false);
              toast.success(copy.toasts.valueUpdated);
              return "saved";
            } catch (error) {
              return toFormResult(error, "Attribute.update_value");
            }
          }}
          pendingLabel={copy.edit.pending}
          submitLabel={copy.edit.submit}
          values={{
            nameEn: value.nameEn,
            nameEs: value.nameEs,
            swatchColor: value.swatchColor,
          }}
          withSwatch
        />
      ) : (
        <>
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full ring-1 ring-foreground/30"
            data-testid="filter-value-swatch"
            style={
              value.swatchColor
                ? { backgroundColor: value.swatchColor }
                : { visibility: "hidden" }
            }
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <span className="font-semibold" data-testid="filter-value-name">
                {value.nameEs}
              </span>
              {value.nameEn ? (
                <span className="text-xs text-muted-foreground" lang="en">
                  {" "}
                  · {value.nameEn}
                </span>
              ) : null}
            </p>
            {/* Its own line, never cut: it is what the owner reads before
                deleting. */}
            <p
              className="text-xs text-muted-foreground"
              data-testid="filter-value-count"
            >
              {countLabel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              aria-label={interpolate(copy.move.up, { name: value.nameEs })}
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
              aria-label={interpolate(copy.move.down, { name: value.nameEs })}
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
              aria-label={interpolate(copy.edit.valueAction, {
                name: value.nameEs,
              })}
              onClick={() => {
                setEditing(true);
              }}
              size="icon"
              variant="ghost"
            >
              <Pencil aria-hidden="true" className="size-4" />
            </Button>
            <Button
              aria-label={interpolate(copy.deleteValue.action, {
                name: value.nameEs,
              })}
              onClick={() => {
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
      <ConfirmDialog
        confirmLabel={copy.deleteValue.confirm}
        description={
          value.productCount > 0
            ? interpolate(copy.deleteValue.inUse, {
                count: countLabel,
                name: value.nameEs,
              })
            : interpolate(copy.deleteValue.unused, { name: value.nameEs })
        }
        isPending={remove.isPending}
        onCloseAutoFocus={focusOn(headingRef)}
        onConfirm={() => {
          void (async () => {
            try {
              await remove.mutateAsync({ id: value.id, storeSlug });
              setDeleting(false);
              toast.success(copy.toasts.valueDeleted);
            } catch (error) {
              reportError(error, { action: "Attribute.delete_value" });
              toast.error(copy.errors.generic);
            }
          })();
        }}
        onOpenChange={setDeleting}
        open={deleting}
        title={copy.deleteValue.title}
      />
    </li>
  );
}

export { FilterManager };
