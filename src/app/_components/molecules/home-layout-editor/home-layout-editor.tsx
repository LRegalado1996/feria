"use client";

import { ArrowDown, ArrowUp, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useId } from "react";
import {
  type ArrayPath,
  type UseFormReturn,
  useFieldArray,
  useFormState,
  useWatch,
} from "react-hook-form";

import { Button } from "@/app/_components/atoms/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/app/_components/molecules/form";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  FEATURED_MAX,
  type HomeLayoutFormFields,
  type HomeSection,
  homeSectionKey,
  RANKING_MAX,
  type SaveHomeLayoutValues,
} from "@/lib/schemas/home";
import { cn } from "@/lib/utils";

/** What one entry of a list is called, and what it says beside its name. */
export interface HomeLayoutEntry {
  name: string;
  /** A quiet line under the name (a row that does not show), or `null`. */
  note: string | null;
  /** A warning beside it (an article that cannot be bought), or `null`. */
  warning: string | null;
}

/** An article the pickers offer: published, with its name. */
export interface HomeLayoutChoice {
  id: number;
  name: string;
}

export interface HomeLayoutEditorProps {
  /** The published articles the curated rows can take. */
  choices: readonly HomeLayoutChoice[];
  className?: string;
  describeArticle: (id: number) => HomeLayoutEntry;
  describeBanner: (id: number) => HomeLayoutEntry;
  describeSection: (section: HomeSection) => HomeLayoutEntry;
  /**
   * The form, made by the screen so its preview reads the order before it
   * is saved: `useForm` with `createHomeLayoutFormSchema`.
   */
  form: UseFormReturn<HomeLayoutFormFields, unknown, SaveHomeLayoutValues>;
  /** The form's id: the screen's save button, in its top bar, submits it. */
  id: string;
  /** Saves the order; answers whether it was saved. A failure keeps it. */
  onSave: (values: SaveHomeLayoutValues) => Promise<boolean>;
}

type LayoutForm = HomeLayoutEditorProps["form"];

const SELECT_CLASS =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base disabled:opacity-50 md:h-9 md:text-sm dark:bg-input/30";

/** One card of the editor, named by its heading. */
function LayoutCard({
  children,
  hint,
  testId,
  title,
}: {
  children: ReactNode;
  hint: string;
  testId: string;
  title: string;
}) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground md:p-5"
      data-testid={testId}
    >
      <div className="space-y-1">
        <h2 className="text-sm font-semibold" id={headingId}>
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * One entry of an ordered list: its name, its note or warning, and its
 * buttons, each named with the entry ("Subir: Anillos"). The first can't
 * go up nor the last down: those buttons are `aria-disabled` and ignore a
 * press, not `disabled`, so the one that moved an entry to an end keeps
 * focus.
 */
function LayoutItem({
  entry,
  index,
  last,
  onMove,
  onRemove,
  testId,
}: {
  entry: HomeLayoutEntry;
  index: number;
  last: number;
  onMove: (from: number, to: number) => void;
  onRemove?: () => void;
  testId: string;
}) {
  const copy = useDictionary().admin.home.layout;
  const named = (template: string) =>
    interpolate(template, { name: entry.name });

  return (
    <li
      className="flex min-w-0 items-center gap-2 py-2 first:pt-0 last:pb-0"
      data-testid={testId}
    >
      <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        {entry.note ? (
          <p className="text-xs text-muted-foreground">{entry.note}</p>
        ) : null}
        {entry.warning ? (
          <p
            className="mt-1 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
            data-testid="home-layout-warning"
          >
            <TriangleAlert
              aria-hidden="true"
              className="mt-px size-3.5 shrink-0"
            />
            {entry.warning}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          aria-disabled={index === 0 || undefined}
          aria-label={named(copy.up)}
          className="aria-disabled:opacity-50"
          onClick={() => {
            if (index > 0) {
              onMove(index, index - 1);
            }
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          aria-disabled={index === last || undefined}
          aria-label={named(copy.down)}
          className="aria-disabled:opacity-50"
          onClick={() => {
            if (index < last) {
              onMove(index, index + 1);
            }
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        {onRemove ? (
          <Button
            aria-label={named(copy.remove)}
            onClick={onRemove}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/** A list that is one card of rows divided by hairlines. */
function List({ children, empty }: { children: ReactNode[]; empty: string }) {
  return children.length === 0 ? (
    <p className="text-sm text-muted-foreground">{empty}</p>
  ) : (
    <ol className="divide-y">{children}</ol>
  );
}

/**
 * A curated row (the best sellers or the featured articles): its articles
 * in order, each with a warning when the storefront leaves it out, and a
 * picker of the published articles not in it yet, shut once the row is
 * full.
 */
function CuratedList({
  choices,
  describeArticle,
  form,
  max,
  name,
  pick,
  testId,
}: {
  choices: readonly HomeLayoutChoice[];
  describeArticle: (id: number) => HomeLayoutEntry;
  form: LayoutForm;
  max: number;
  name: Extract<ArrayPath<HomeLayoutFormFields>, "featured" | "ranking">;
  pick: "featuredPick" | "rankingPick";
  testId: string;
}) {
  const { admin } = useDictionary();
  const copy = admin.home.layout;
  const choose = admin.home.bannerForm.fields.choose;
  const { append, fields, move, remove } = useFieldArray({
    control: form.control,
    name,
  });
  const picked = useWatch({ control: form.control, name: pick });
  const chosen = new Set(fields.map((field) => field.productId));
  const offered = choices.filter((choice) => !chosen.has(choice.id));
  const full = fields.length >= max;

  return (
    <div className="flex flex-col gap-3">
      <List empty={copy.none}>
        {fields.map((field, index) => (
          <LayoutItem
            entry={describeArticle(field.productId)}
            index={index}
            key={field.id}
            last={fields.length - 1}
            onMove={(from, to) => {
              move(from, to);
            }}
            onRemove={() => {
              remove(index);
            }}
            testId={`${testId}-item`}
          />
        ))}
      </List>
      <div className="flex flex-wrap items-end gap-2">
        <FormField
          control={form.control}
          name={pick}
          render={({ field }) => (
            <FormItem className="min-w-0 flex-1 basis-48">
              <FormLabel>{copy.addArticle}</FormLabel>
              <FormControl>
                <select {...field} className={SELECT_CLASS} disabled={full}>
                  <option value="">{choose}</option>
                  {offered.map((choice) => (
                    <option key={choice.id} value={String(choice.id)}>
                      {choice.name}
                    </option>
                  ))}
                </select>
              </FormControl>
            </FormItem>
          )}
        />
        <Button
          disabled={full || picked === ""}
          onClick={() => {
            append({ productId: Number(picked) });
            form.setValue(pick, "");
          }}
          type="button"
          variant="outline"
        >
          {copy.add}
        </Button>
      </div>
      {full ? (
        <p className="text-xs text-muted-foreground">
          {interpolate(copy.full, { max: String(max) })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The home's order (FER-020), in the admin's cards: the cover's banners in
 * the carousel's order; the sequence under it (the categories' rows, the
 * best sellers, the featured articles and the banners between rows), each
 * moved up and down; and the two curated rows, picked from the published
 * articles, up to ten best sellers and none or two to four featured. Each
 * entry says when the storefront leaves it out. One form, saved whole from
 * the screen's top bar (`id`).
 */
function HomeLayoutEditor({
  choices,
  className,
  describeArticle,
  describeBanner,
  describeSection,
  form,
  id,
  onSave,
}: HomeLayoutEditorProps) {
  const copy = useDictionary().admin.home.layout;
  const cover = useFieldArray({ control: form.control, name: "cover" });
  const sections = useFieldArray({ control: form.control, name: "sections" });
  const { errors, isSubmitting } = useFormState({ control: form.control });
  const featuredError =
    errors.featured?.message ?? errors.featured?.root?.message;
  const coverError = errors.cover?.message ?? errors.cover?.root?.message;
  const sectionsError =
    errors.sections?.message ?? errors.sections?.root?.message;

  const submit = async (values: SaveHomeLayoutValues) => {
    if (await onSave(values)) {
      form.reset({
        cover: values.coverBannerIds.map((bannerId) => ({ bannerId })),
        featured: values.featuredProductIds.map((productId) => ({ productId })),
        featuredPick: "",
        ranking: values.rankingProductIds.map((productId) => ({ productId })),
        rankingPick: "",
        sections: values.sections.map((section) => ({ section })),
      });
    }
  };

  return (
    <Form {...form}>
      <form
        aria-label={copy.title}
        className={cn("flex flex-col gap-6", className)}
        data-slot="home-layout-editor"
        data-testid="home-layout-editor"
        id={id}
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
      >
        <fieldset
          className="flex min-w-0 flex-col gap-6"
          disabled={isSubmitting}
        >
          <LayoutCard
            hint={copy.coverHint}
            testId="home-layout-cover"
            title={copy.cover}
          >
            <List empty={copy.coverEmpty}>
              {cover.fields.map((field, index) => (
                <LayoutItem
                  entry={describeBanner(field.bannerId)}
                  index={index}
                  key={field.id}
                  last={cover.fields.length - 1}
                  onMove={(from, to) => {
                    cover.move(from, to);
                  }}
                  testId="home-layout-cover-item"
                />
              ))}
            </List>
            {coverError ? (
              <p className="text-sm text-destructive" role="alert">
                {coverError}
              </p>
            ) : null}
          </LayoutCard>
          <LayoutCard
            hint={`${copy.hint} ${copy.rowsHint}`}
            testId="home-layout-rows"
            title={copy.rows}
          >
            <List empty={copy.none}>
              {sections.fields.map((field, index) => (
                <LayoutItem
                  entry={describeSection(field.section)}
                  index={index}
                  key={homeSectionKey(field.section)}
                  last={sections.fields.length - 1}
                  onMove={(from, to) => {
                    sections.move(from, to);
                  }}
                  testId="home-layout-rows-item"
                />
              ))}
            </List>
            {sectionsError ? (
              <p className="text-sm text-destructive" role="alert">
                {sectionsError}
              </p>
            ) : null}
          </LayoutCard>
          <LayoutCard
            hint={copy.bestSellersHint}
            testId="home-layout-best-sellers"
            title={copy.bestSellers}
          >
            <CuratedList
              choices={choices}
              describeArticle={describeArticle}
              form={form}
              max={RANKING_MAX}
              name="ranking"
              pick="rankingPick"
              testId="home-layout-best-sellers"
            />
          </LayoutCard>
          <LayoutCard
            hint={copy.featuredHint}
            testId="home-layout-featured"
            title={copy.featured}
          >
            <CuratedList
              choices={choices}
              describeArticle={describeArticle}
              form={form}
              max={FEATURED_MAX}
              name="featured"
              pick="featuredPick"
              testId="home-layout-featured"
            />
            {featuredError ? (
              <p className="text-sm text-destructive" role="alert">
                {featuredError}
              </p>
            ) : null}
          </LayoutCard>
        </fieldset>
      </form>
    </Form>
  );
}

export { HomeLayoutEditor };
