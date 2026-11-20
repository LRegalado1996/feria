"use client";

import { AlertCircle, Check, CircleDot, LoaderCircle } from "lucide-react";

import { Button } from "@/app/_components/atoms/button";
import { useDictionary } from "@/lib/hooks/i18n";
import { cn } from "@/lib/utils";

/** What the wizard's save line says (FER-017). */
export type ProductSaveState =
  | "clean"
  | "failed"
  | "idle"
  | "invalid"
  | "notYet"
  | "saved"
  | "saving"
  | "unsaved";

export interface ProductSaveStatusProps {
  className?: string;
  /** Sends the failed save again; offered only once it failed. */
  onRetry: () => void;
  state: ProductSaveState;
}

/**
 * The article's quiet save line (FER-017): a draft's "Guardando…" while its
 * autosave travels and "Guardado" once it landed, or why it did not with a
 * retry; a new article's note that it saves itself from its first photo; a
 * published article's "Cambios sin guardar" until they are saved. Said in
 * one polite live region, failures included, so a screen reader hears it
 * without losing its place.
 */
function ProductSaveStatus({
  className,
  onRetry,
  state,
}: ProductSaveStatusProps) {
  const { articles } = useDictionary();
  const copy = articles.wizard;
  const said = {
    clean: copy.published.noChanges,
    failed: copy.save.failed,
    idle: "",
    invalid: copy.save.invalid,
    notYet: copy.save.notYet,
    saved: copy.save.saved,
    saving: copy.save.saving,
    unsaved: copy.published.unsaved,
  } satisfies Record<ProductSaveState, string>;
  const alarming = state === "failed" || state === "invalid";

  return (
    <div
      className={cn(
        "flex min-h-11 min-w-0 items-center gap-2 text-xs md:min-h-9",
        alarming ? "text-destructive" : "text-muted-foreground",
        className
      )}
      data-slot="product-save-status"
      data-state={state}
      data-testid="product-save-status"
    >
      {state === "saving" ? (
        <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
      ) : null}
      {state === "saved" ? <Check aria-hidden className="size-3.5" /> : null}
      {state === "unsaved" ? (
        <CircleDot aria-hidden className="size-3.5" />
      ) : null}
      {alarming ? <AlertCircle aria-hidden className="size-3.5" /> : null}
      <output aria-live="polite" className="min-w-0">
        {said[state]}
      </output>
      {state === "failed" ? (
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          {copy.save.retry}
        </Button>
      ) : null}
    </div>
  );
}

export { ProductSaveStatus };
