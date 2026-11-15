"use client";

import { useId, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/_components/molecules/dialog";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";

interface CategoryOption {
  id: number;
  name: string;
}

export interface DeleteCategoryDialogProps {
  /** The category to delete, with how many articles it holds. */
  category: CategoryOption & { productCount: number; countLabel: string };
  /** Shown when the deletion failed; the dialog stays open. */
  error: string | null;
  isPending: boolean;
  /** A destination was chosen: an error about the previous try is stale. */
  onChoose?: () => void;
  /** Runs the deletion; `moveToId` is `null` when there are no articles. */
  onConfirm: (moveToId: number | null) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** The store's other categories, where the articles can move. */
  others: CategoryOption[];
}

/**
 * Confirms a deletion. A category with articles asks first which category
 * they move to, so none is ever left without one (FER-016); with no other
 * category to move them to, it says so and cannot be confirmed.
 */
function DeleteCategoryDialog({
  category,
  error,
  isPending,
  onChoose,
  onConfirm,
  onOpenChange,
  open,
  others,
}: DeleteCategoryDialogProps) {
  const { admin, common } = useDictionary();
  const copy = admin.categories.delete;
  const selectId = useId();
  const errorId = useId();
  const [moveToId, setMoveToId] = useState("");
  const [missing, setMissing] = useState(false);
  const hasArticles = category.productCount > 0;
  const blocked = hasArticles && others.length === 0;

  const confirm = () => {
    if (!hasArticles) {
      onConfirm(null);
      return;
    }

    const chosen = others.find((other) => String(other.id) === moveToId);

    if (!chosen) {
      setMissing(true);
      return;
    }

    onConfirm(chosen.id);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent data-testid="delete-category-dialog">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {hasArticles
              ? interpolate(copy.withArticles, {
                  count: category.countLabel,
                  name: category.name,
                })
              : interpolate(copy.description, { name: category.name })}
          </DialogDescription>
        </DialogHeader>
        {blocked ? (
          <p className="text-sm" role="alert">
            {copy.onlyOne}
          </p>
        ) : null}
        {hasArticles && !blocked ? (
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor={selectId}>
              {copy.moveLabel}
            </label>
            <select
              aria-describedby={missing ? errorId : undefined}
              aria-invalid={missing || undefined}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-base md:h-9 md:text-sm"
              id={selectId}
              onChange={(event) => {
                setMoveToId(event.currentTarget.value);
                setMissing(false);
                onChoose?.();
              }}
              value={moveToId}
            >
              <option value="">{copy.movePlaceholder}</option>
              {others.map((other) => (
                <option key={other.id} value={String(other.id)}>
                  {other.name}
                </option>
              ))}
            </select>
            {missing ? (
              <p className="text-sm text-destructive" id={errorId} role="alert">
                {copy.moveRequired}
              </p>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            onClick={() => {
              onOpenChange(false);
            }}
            variant="outline"
          >
            {common.cancel}
          </Button>
          <Button
            disabled={isPending || blocked}
            onClick={confirm}
            variant="destructive"
          >
            {isPending ? common.deleting : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { DeleteCategoryDialog };
