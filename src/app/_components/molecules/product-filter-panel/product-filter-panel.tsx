"use client";

import { SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { Form, FormField } from "@/app/_components/molecules/form";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/app/_components/molecules/sheet";
import {
  applyFilterForm,
  EMPTY_FILTER_FORM,
  type FilterFormValues,
  filterFormValues,
  type ListAttribute,
  type ListCategory,
  nameIn,
  valueToken,
} from "@/lib/admin/product-filters";
import {
  EMPTY_PRODUCTS_QUERY,
  type ProductsQuery,
  productsListInput,
  productsPath,
} from "@/lib/admin/products";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useProducts } from "@/lib/hooks/product";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  CATALOG_FILTER_VALUES_MAX,
  CATALOG_FILTERS_MAX,
  PRODUCT_AVAILABILITIES,
  PRODUCT_STATUSES,
} from "@/lib/schemas/catalog";
import { cn } from "@/lib/utils";
import { formatInteger } from "@/lib/utils/format";

export interface ProductFilterPanelProps {
  /** How many filter values narrow the list now (`activeFilterChips`). */
  activeCount: number;
  /**
   * The store's filters and categories, `undefined` while not read (or
   * failed): the address's own selection then stays as it is on "Aplicar".
   */
  attributes: readonly ListAttribute[] | undefined;
  /**
   * Whether the store's filters' read failed (`attributes` is then
   * `undefined`): the panel says so with a retry instead of showing none.
   */
  attributesFailed: boolean;
  categories: readonly ListCategory[] | undefined;
  /**
   * Whether the categories' read failed (`categories` is then
   * `undefined`): the panel says so with a retry, never "no categories".
   */
  categoriesFailed: boolean;
  className?: string;
  /** Reads the store's filters again after a failure. */
  onRetryAttributes: () => void;
  /** Reads the categories again after a failure. */
  onRetryCategories: () => void;
  /** The list's selection in the address, already read. */
  query: ProductsQuery;
  /** The "Filtros" button, for focus to come back to. */
  ref?: Ref<HTMLButtonElement>;
}

/** The ring a chosen pill or row draws while its hidden control has focus. */
const FOCUS_WITHIN =
  "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50";

/** One choice of a segmented control: a pill around a hidden radio. */
function Segment({
  checked,
  children,
  name,
  onChange,
  value,
}: {
  checked: boolean;
  children: ReactNode;
  name: string;
  onChange: () => void;
  value: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-md px-3 text-sm transition-colors md:min-h-8",
        checked
          ? "bg-background font-medium text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground",
        FOCUS_WITHIN
      )}
    >
      <input
        checked={checked}
        className="sr-only"
        name={name}
        onChange={onChange}
        type="radio"
        value={value}
      />
      {children}
    </label>
  );
}

/** A group of choices under its name, a fieldset with its legend. */
function Section({
  children,
  legend,
}: {
  children: ReactNode;
  legend: string;
}) {
  return (
    <fieldset className="grid min-w-0 gap-2.5">
      <legend className="mb-2.5 text-xs font-medium text-muted-foreground">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

/** Why no more can be chosen in a section, under its choices. */
function LimitNote({ children }: { children: string }) {
  return (
    <p className="text-xs text-muted-foreground" data-testid="filter-limit">
      {children}
    </p>
  );
}

/** A read that failed, said where its choices would be, with a retry. */
function ReadFailed({
  children,
  onRetry,
  testId,
}: {
  children: string;
  onRetry: () => void;
  testId: string;
}) {
  const { common } = useDictionary();
  const messageId = useId();

  return (
    <div
      className="grid justify-items-start gap-2"
      data-testid={testId}
      role="alert"
    >
      <p className="text-sm" id={messageId}>
        {children}
      </p>
      {/* Described by its message: the categories' retry and the filters'
          can both be on the sheet, with the same name. */}
      <Button
        aria-describedby={messageId}
        onClick={() => {
          onRetry();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        {common.tryAgain}
      </Button>
    </div>
  );
}

/** `list` with `item` in it or out of it. */
function toggled(list: readonly string[], item: string): string[] {
  return list.includes(item)
    ? list.filter((other) => other !== item)
    : [...list, item];
}

/** The open panel: its fields from the address, its count, its actions. */
function PanelForm({
  attributes,
  attributesFailed,
  categories,
  categoriesFailed,
  onApplied,
  onRetryAttributes,
  onRetryCategories,
  query,
}: Pick<
  ProductFilterPanelProps,
  | "attributes"
  | "attributesFailed"
  | "categories"
  | "categoriesFailed"
  | "onRetryAttributes"
  | "onRetryCategories"
  | "query"
> & {
  onApplied: () => void;
}) {
  const { articles, common } = useDictionary();
  const copy = articles.list;
  const locale = useLocale();
  const router = useRouter();
  const form = useForm<FilterFormValues>({
    defaultValues: filterFormValues(query),
  });
  // The address changed under the open sheet (back, forward): the choice
  // starts again from it, or "Aplicar" would write the old one back.
  const address = productsPath(locale, query);
  const startedFrom = useRef(address);

  useEffect(() => {
    if (startedFrom.current !== address) {
      startedFrom.current = address;
      form.reset(filterFormValues(query));
    }
  }, [address, form, query]);
  const [status, availability, chosenCategories, chosenValues] = useWatch({
    control: form.control,
    name: ["status", "availability", "categories", "values"],
  });
  const values: FilterFormValues = {
    availability,
    categories: chosenCategories,
    status,
    values: chosenValues,
  };
  const draft = applyFilterForm(query, values, { attributes, categories });
  // How many the draft would show: one row read, its total kept. The order
  // changes no count, so it is read in the default one: one cache entry
  // whatever the list's sort, and no sort key looked up per row.
  const counted = useProducts(
    productsListInput(
      {
        ...draft,
        dir: EMPTY_PRODUCTS_QUERY.dir,
        sort: EMPTY_PRODUCTS_QUERY.sort,
      },
      locale,
      1
    )
  );
  const listedCategories = categories ?? [];
  const groups = listedCategories.filter(
    (category) => category.parentId === null
  );

  let matches = copy.filters.matches;

  if (counted.data?.totalCapped) {
    matches = copy.filters.matchesCapped;
  } else if (counted.data?.total === 0) {
    matches = copy.filters.matchesNone;
  } else if (counted.data?.total === 1) {
    matches = copy.filters.matchesOne;
  }

  // The last choice's count is not this one's: nothing shows while it
  // comes, and a count that failed says so (Apply still works).
  let said: string | null = null;

  if (counted.isPlaceholderData) {
    said = null;
  } else if (counted.data) {
    said = interpolate(matches, {
      count: formatInteger(counted.data.total, locale),
    });
  } else if (counted.isError) {
    said = copy.filters.matchesUnavailable;
  }

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit((submitted) => {
            router.push(
              productsPath(
                locale,
                applyFilterForm(query, submitted, { attributes, categories })
              ),
              { scroll: false }
            );
            onApplied();
          })(event);
        }}
      >
        <SheetBody className="grid content-start gap-7">
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <Section legend={copy.filters.status}>
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  {(["", ...PRODUCT_STATUSES] as const).map((status) => (
                    <Segment
                      checked={field.value === status}
                      key={status || "all"}
                      name={field.name}
                      onChange={() => {
                        field.onChange(status);
                      }}
                      value={status}
                    >
                      {status === "" ? copy.filters.all : copy.status[status]}
                    </Segment>
                  ))}
                </div>
              </Section>
            )}
          />
          <FormField
            control={form.control}
            name="availability"
            render={({ field }) => (
              <Section legend={copy.filters.availability}>
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  {(["", ...PRODUCT_AVAILABILITIES] as const).map(
                    (availability) => (
                      <Segment
                        checked={field.value === availability}
                        key={availability || "all"}
                        name={field.name}
                        onChange={() => {
                          field.onChange(availability);
                        }}
                        value={availability}
                      >
                        {availability === ""
                          ? copy.filters.all
                          : copy.availability[availability]}
                      </Segment>
                    )
                  )}
                </div>
              </Section>
            )}
          />
          <FormField
            control={form.control}
            name="categories"
            render={({ field }) => {
              // The address keeps this many (`readProductsQuery`): past it a
              // choice is refused here, never dropped on "Aplicar". Once the
              // categories are read, a slug the store no longer has is not
              // one of them: "Aplicar" drops it anyway.
              const chosen =
                categories === undefined
                  ? field.value
                  : field.value.filter((slug) =>
                      categories.some((category) => category.slug === slug)
                    );
              const categoriesFull = chosen.length >= CATALOG_FILTER_VALUES_MAX;
              let unlisted: ReactNode = null;

              if (categoriesFailed) {
                unlisted = (
                  <ReadFailed
                    onRetry={onRetryCategories}
                    testId="filter-categories-failed"
                  >
                    {copy.filters.categoriesFailed}
                  </ReadFailed>
                );
              } else if (categories === undefined) {
                unlisted = (
                  <div
                    aria-busy="true"
                    className="grid gap-2"
                    data-testid="filter-categories-pending"
                  >
                    <span className="sr-only">{common.loading}</span>
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                );
              } else if (categories.length === 0) {
                unlisted = (
                  <p className="text-sm text-muted-foreground">
                    {copy.filters.noCategories}
                  </p>
                );
              }

              return (
                <Section legend={copy.filters.category}>
                  {unlisted ?? (
                    <ul className="grid gap-0.5">
                      {groups.map((group) => {
                        const inside = listedCategories.filter(
                          (category) => category.parentId === group.id
                        );

                        return (
                          <li key={group.id}>
                            {[group, ...inside].map((category) => (
                              <label
                                className={cn(
                                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-accent has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 md:min-h-9",
                                  category !== group && "ml-6",
                                  FOCUS_WITHIN
                                )}
                                data-testid={`filter-category-${category.slug}`}
                                key={category.id}
                              >
                                <input
                                  checked={field.value.includes(category.slug)}
                                  className="size-4 shrink-0 accent-primary"
                                  disabled={
                                    categoriesFull &&
                                    !field.value.includes(category.slug)
                                  }
                                  name={field.name}
                                  onChange={() => {
                                    field.onChange(
                                      toggled(field.value, category.slug)
                                    );
                                  }}
                                  type="checkbox"
                                  value={category.slug}
                                />
                                <span
                                  className={cn(
                                    "min-w-0 flex-1 truncate",
                                    inside.length > 0 &&
                                      category === group &&
                                      "font-medium"
                                  )}
                                >
                                  {nameIn(category, locale)}
                                </span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {formatInteger(
                                    category === group
                                      ? inside.reduce(
                                          (sum, one) => sum + one.productCount,
                                          group.productCount
                                        )
                                      : category.productCount,
                                    locale
                                  )}
                                </span>
                              </label>
                            ))}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {categoriesFull ? (
                    <LimitNote>
                      {interpolate(copy.filters.limitCategories, {
                        count: formatInteger(CATALOG_FILTER_VALUES_MAX, locale),
                      })}
                    </LimitNote>
                  ) : null}
                </Section>
              );
            }}
          />
          <FormField
            control={form.control}
            name="values"
            render={({ field }) => {
              if (attributesFailed) {
                return (
                  <ReadFailed
                    onRetry={onRetryAttributes}
                    testId="filter-attributes-failed"
                  >
                    {copy.filters.attributesFailed}
                  </ReadFailed>
                );
              }

              const listed = (attributes ?? []).filter(
                (attribute) => attribute.values.length > 0
              );
              const chosenIn = (attribute: ListAttribute) =>
                attribute.values.filter((option) =>
                  field.value.includes(valueToken(attribute.slug, option.slug))
                ).length;
              // The address keeps this many filters and values of each.
              const filtersFull =
                listed.filter((attribute) => chosenIn(attribute) > 0).length >=
                CATALOG_FILTERS_MAX;

              return (
                <>
                  {listed.map((attribute) => {
                    const chosenHere = chosenIn(attribute);
                    const valuesFull = chosenHere >= CATALOG_FILTER_VALUES_MAX;
                    const filterClosed = filtersFull && chosenHere === 0;

                    return (
                      <Section
                        key={attribute.id}
                        legend={nameIn(attribute, locale)}
                      >
                        <div
                          className="flex flex-wrap gap-2"
                          data-testid={`filter-attribute-${attribute.slug}`}
                        >
                          {attribute.values.map((option) => {
                            const token = valueToken(
                              attribute.slug,
                              option.slug
                            );
                            const chosen = field.value.includes(token);

                            return (
                              <label
                                className={cn(
                                  "inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 md:min-h-8",
                                  chosen
                                    ? "border-foreground bg-foreground text-background"
                                    : "bg-card hover:bg-accent",
                                  FOCUS_WITHIN
                                )}
                                key={option.id}
                              >
                                <input
                                  checked={chosen}
                                  className="sr-only"
                                  disabled={
                                    !chosen && (valuesFull || filterClosed)
                                  }
                                  name={field.name}
                                  onChange={() => {
                                    field.onChange(toggled(field.value, token));
                                  }}
                                  type="checkbox"
                                  value={token}
                                />
                                {option.swatchColor ? (
                                  <span
                                    aria-hidden
                                    className="size-3.5 shrink-0 rounded-full border border-border"
                                    style={{
                                      backgroundColor: option.swatchColor,
                                    }}
                                  />
                                ) : null}
                                <span className="truncate">
                                  {nameIn(option, locale)}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        {valuesFull || filterClosed ? (
                          <LimitNote>
                            {interpolate(
                              valuesFull
                                ? copy.filters.limitValues
                                : copy.filters.limitFilters,
                              {
                                count: formatInteger(
                                  valuesFull
                                    ? CATALOG_FILTER_VALUES_MAX
                                    : CATALOG_FILTERS_MAX,
                                  locale
                                ),
                              }
                            )}
                          </LimitNote>
                        ) : null}
                      </Section>
                    );
                  })}
                </>
              );
            }}
          />
        </SheetBody>
        <SheetFooter className="grid gap-3">
          <output
            aria-busy={counted.isFetching || undefined}
            aria-live="polite"
            className="text-xs text-muted-foreground"
            data-testid="filter-matches"
          >
            {said}
          </output>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => {
                form.reset(EMPTY_FILTER_FORM);
              }}
              type="button"
              variant="outline"
            >
              {copy.filters.clear}
            </Button>
            <Button type="submit">{copy.filters.apply}</Button>
          </div>
        </SheetFooter>
      </form>
    </Form>
  );
}

/**
 * The article list's filters (FER-019): a compact outlined "Filtros" button
 * with the count of active values, opening a side sheet (`molecules/sheet`)
 * with the status and the availability as segmented controls, the
 * categories as checkboxes (a group above the categories in it, each with
 * its count of articles, a group's counting the ones in it) and the store's own filters as pills, a color's
 * with its swatch, several values each. Nothing changes while choosing: the
 * foot says how many articles the choice would show, "Limpiar" empties the
 * choice and "Aplicar" puts it in the address (one history entry) and
 * closes the sheet; closing it otherwise drops the choice. Each opening
 * starts from the address.
 */
function ProductFilterPanel({
  activeCount,
  attributes,
  attributesFailed,
  categories,
  categoriesFailed,
  className,
  onRetryAttributes,
  onRetryCategories,
  query,
  ref,
}: ProductFilterPanelProps) {
  const copy = useDictionary().articles.list.filters;
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  let label = copy.button;

  if (activeCount === 1) {
    label = copy.buttonActiveOne;
  } else if (activeCount > 1) {
    label = interpolate(copy.buttonActive, {
      count: formatInteger(activeCount, locale),
    });
  }

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button
          aria-label={label}
          className={className}
          data-testid="product-filters-button"
          ref={ref}
          size="sm"
          type="button"
          variant="outline"
        >
          <SlidersHorizontal aria-hidden="true" />
          {copy.button}
          {activeCount > 0 ? (
            <span
              aria-hidden="true"
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-medium text-background tabular-nums"
              data-testid="product-filters-count"
            >
              {formatInteger(activeCount, locale)}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent data-testid="product-filters-sheet">
        <SheetHeader closeLabel={copy.close}>
          <SheetTitle>{copy.title}</SheetTitle>
          <SheetDescription>{copy.description}</SheetDescription>
        </SheetHeader>
        <PanelForm
          attributes={attributes}
          attributesFailed={attributesFailed}
          categories={categories}
          categoriesFailed={categoriesFailed}
          onApplied={() => {
            setOpen(false);
          }}
          onRetryAttributes={onRetryAttributes}
          onRetryCategories={onRetryCategories}
          query={query}
        />
      </SheetContent>
    </Sheet>
  );
}

export { ProductFilterPanel };
