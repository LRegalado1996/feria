"use client";

import { Check, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import {
  AttributeForm,
  type AttributeFormResult,
  type AttributeFormSaved,
} from "@/app/_components/molecules/attribute-form";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import type { client } from "@/lib/orpc/client";
import { cn } from "@/lib/utils";

type StoreAttribute = Awaited<ReturnType<typeof client.attribute.list>>[number];

export interface ProductFilterChipsProps {
  attributes: readonly StoreAttribute[];
  className?: string;
  onChange: (ids: number[]) => void;
  /**
   * Adds a value to a filter and chooses it, in the choice as it is when
   * the store answers (the person may have tapped chips meanwhile, even on
   * another screen); answers how it went.
   */
  onCreateValue: (
    attributeId: number,
    values: AttributeFormSaved
  ) => Promise<AttributeFormResult>;
  /** The chosen values' ids. */
  value: readonly number[];
}

/** A filter's or a value's name in the page's language, else Spanish. */
function nameIn(row: { nameEn: string | null; nameEs: string }, en: boolean) {
  return en ? (row.nameEn ?? row.nameEs) : row.nameEs;
}

/**
 * The store's filters (FER-033) for one article (FER-017): each filter a
 * group of chips, one per value, a color's with its swatch; a tap chooses
 * or drops one (`aria-pressed`), several per filter. A value the store
 * lacks is added right there, with the filters screen's own form, and
 * chosen at once by the owner (`onCreateValue`); focus then returns to the
 * button that opened it.
 */
function ProductFilterChips({
  attributes,
  className,
  onChange,
  onCreateValue,
  value,
}: ProductFilterChipsProps) {
  const { articles } = useDictionary();
  const copy = articles.wizard.details;
  const en = useLocale() === "en";
  // The form open now, and which opening of it: a save from an earlier
  // opening (the person reopened it meanwhile) closes nothing.
  const [adding, setAdding] = useState<{
    attributeId: number;
    opening: number;
  } | null>(null);
  const openings = useRef(0);
  const formTitle = useId();
  const openers = useRef(new Map<number, HTMLButtonElement>());
  // The form open now: a save that ends after another was opened, or after
  // this one was opened again, closes nothing and takes no focus.
  const open = useRef(adding);

  useEffect(() => {
    open.current = adding;
  }, [adding]);

  if (attributes.length === 0) {
    return (
      <p
        className={cn("text-sm text-muted-foreground", className)}
        data-slot="product-filter-chips"
      >
        {copy.filtersEmpty}
      </p>
    );
  }

  const toggle = (id: number) => {
    onChange(
      value.includes(id)
        ? value.filter((chosen) => chosen !== id)
        : [...value, id]
    );
  };

  const close = (attributeId: number, opening: number) => {
    if (open.current?.opening !== opening) {
      return;
    }

    setAdding(null);
    openers.current.get(attributeId)?.focus();
  };

  return (
    <div
      className={cn("grid gap-5", className)}
      data-slot="product-filter-chips"
    >
      {attributes.map((attribute) => {
        const filterName = nameIn(attribute, en);

        return (
          <fieldset
            className="grid min-w-0 gap-2"
            data-testid={`product-filter-${attribute.slug}`}
            key={attribute.id}
          >
            <legend className="mb-2 text-sm font-medium">{filterName}</legend>
            <div className="flex flex-wrap gap-2">
              {attribute.values.map((option) => {
                const chosen = value.includes(option.id);

                return (
                  <button
                    aria-pressed={chosen}
                    className={cn(
                      "inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:min-h-9",
                      chosen
                        ? "border-foreground bg-foreground text-background"
                        : "bg-card hover:bg-accent"
                    )}
                    key={option.id}
                    onClick={() => {
                      toggle(option.id);
                    }}
                    type="button"
                  >
                    {option.swatchColor ? (
                      <span
                        aria-hidden
                        className="size-3.5 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: option.swatchColor }}
                      />
                    ) : null}
                    <span className="truncate">{nameIn(option, en)}</span>
                    {chosen ? <Check aria-hidden className="size-3.5" /> : null}
                  </button>
                );
              })}
              <Button
                aria-expanded={adding?.attributeId === attribute.id}
                onClick={() => {
                  openings.current += 1;
                  setAdding(
                    adding?.attributeId === attribute.id
                      ? null
                      : {
                          attributeId: attribute.id,
                          opening: openings.current,
                        }
                  );
                }}
                ref={(node) => {
                  if (node) {
                    openers.current.set(attribute.id, node);
                  } else {
                    openers.current.delete(attribute.id);
                  }
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Plus aria-hidden />
                {interpolate(copy.addValue, { filter: filterName })}
              </Button>
            </div>
            {adding?.attributeId === attribute.id ? (
              <div
                className="grid gap-3 rounded-lg border bg-muted/40 p-3"
                key={adding.opening}
              >
                <p className="text-sm font-medium" id={formTitle}>
                  {interpolate(copy.addValueName, { filter: filterName })}
                </p>
                <AttributeForm
                  focusOnOpen
                  labelledBy={formTitle}
                  onCancel={() => {
                    close(attribute.id, adding.opening);
                  }}
                  onSave={async (values) => {
                    const result = await onCreateValue(attribute.id, values);

                    if (result === "saved") {
                      close(attribute.id, adding.opening);
                    }

                    return result;
                  }}
                  pendingLabel={copy.addValuePending}
                  submitLabel={copy.addValueSubmit}
                  withSwatch
                />
              </div>
            ) : null}
          </fieldset>
        );
      })}
    </div>
  );
}

export { ProductFilterChips };
