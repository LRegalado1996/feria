"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ORPCError } from "@orpc/client";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import {
  type DeepPartial,
  useForm,
  useFormState,
  useWatch,
} from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { AdminPage } from "@/app/_components/molecules/admin-page";
import {
  AnnouncementForm,
  announcementFields,
} from "@/app/_components/molecules/announcement-form";
import {
  BannerForm,
  type BannerFormBanner,
  type BannerFormOutcome,
} from "@/app/_components/molecules/banner-form";
import { ConfirmDialog } from "@/app/_components/molecules/confirm-dialog";
import {
  PageLayoutEditor,
  type PageLayoutEntry,
} from "@/app/_components/molecules/page-layout-editor";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/_components/molecules/sheet";
import { SpotlightForm } from "@/app/_components/molecules/spotlight-form";
import { StorePagePreview } from "@/app/_components/molecules/store-page-preview";
import { reportError } from "@/lib/errors/client";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import {
  type PageCurationData,
  useCreateBanner,
  useCreateSpotlight,
  useDeleteBanner,
  useDeleteSpotlight,
  usePageCuration,
  useSaveAnnouncement,
  useSavePageLayout,
  useUpdateBanner,
  useUpdateSpotlight,
} from "@/lib/hooks/page";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { followServerLayout, sameLayoutList } from "@/lib/page/layout";
import { previewPageContent } from "@/lib/page/preview";
import { scheduleStatus } from "@/lib/page/schedule";
import {
  type AnnouncementFormFields,
  type BannerFormValues,
  createAnnouncementFormSchema,
  createPageLayoutFormSchema,
  type PageLayoutFormFields,
  type PageSection,
  type SaveAnnouncementValues,
  type SavePageLayoutValues,
  type SpotlightFormValues,
} from "@/lib/schemas/page";
import type { UploadedImage } from "@/lib/schemas/upload";

type Banner = PageCurationData["banners"][number];
type Spotlight = PageCurationData["spotlights"][number];
type Article = PageCurationData["articles"][number];

/** The cards the screen fills, as their skeleton holds their place. */
const SKELETON_CARDS = [
  ["announcement", "h-72"],
  ["banners", "h-48"],
  ["spotlights", "h-32"],
  ["layout", "h-96"],
] as const;

/** The order form's fields for what the server holds. */
function layoutFieldsOf(data: PageCurationData): PageLayoutFormFields {
  return {
    cover: data.coverBannerIds.map((bannerId) => ({ bannerId })),
    featured: data.featuredProductIds.map((productId) => ({ productId })),
    featuredPick: "",
    ranking: data.rankingProductIds.map((productId) => ({ productId })),
    rankingPick: "",
    sections: data.sections.map((section) => ({ section })),
  };
}

/** A list as typed when it reads, else as saved. */
function typedOrSaved<T>(list: z.ZodType<T>, typed: unknown, saved: T): T {
  const read = list.safeParse(typed);

  return read.success ? read.data : saved;
}

/**
 * The order the preview shows, each list on its own: as typed when it
 * reads, else as saved, even when the saved one does not read either (an
 * article deleted since leaves one featured), so one list waiting for a
 * fix never hides a reordered other. Saving still checks the whole order.
 */
function previewLayout(
  schema: ReturnType<typeof createPageLayoutFormSchema>,
  draft: DeepPartial<PageLayoutFormFields>,
  data: PageCurationData
): SavePageLayoutValues {
  const lists = schema.in.shape;
  const saved = layoutFieldsOf(data);

  return schema.out.parse({
    ...saved,
    cover: typedOrSaved(lists.cover, draft.cover, saved.cover),
    featured: typedOrSaved(lists.featured, draft.featured, saved.featured),
    ranking: typedOrSaved(lists.ranking, draft.ranking, saved.ranking),
    sections: typedOrSaved(lists.sections, draft.sections, saved.sections),
  });
}

/** A text in `locale`, else the Spanish one. */
function textIn(texts: { en: string | null; es: string }, locale: Locale) {
  return locale === "en" && texts.en !== null ? texts.en : texts.es;
}

/**
 * A spotlight's label in `locale`, else in the other language with the
 * language it is in, as the storefront falls back (FER-059); `null` when
 * it has none.
 */
function labelIn(
  spotlight: Pick<Spotlight, "labelEn" | "labelEs">,
  locale: Locale
): { lang: Locale; text: string } | null {
  const labels = { en: spotlight.labelEn, es: spotlight.labelEs };
  const other: Locale = locale === "en" ? "es" : "en";
  const own = labels[locale];
  const fallback = labels[other];

  if (own !== null) {
    return { lang: locale, text: own };
  }

  return fallback === null ? null : { lang: other, text: fallback };
}

/** Whether two images are the same file (or both none). */
function sameImage(one: UploadedImage | null, other: UploadedImage | null) {
  return one?.url === other?.url;
}

/**
 * A banner of the list: its photo, its title, where it goes, whether it
 * shows today, a warning when its article is not published, and its edit
 * and delete buttons, named with its title.
 */
function BannerRow({
  banner,
  locale,
  onDelete,
  onEdit,
  today,
  unpublishedLink,
}: {
  banner: Banner;
  locale: Locale;
  onDelete: (opener: HTMLButtonElement) => void;
  onEdit: (opener: HTMLButtonElement) => void;
  today: string;
  unpublishedLink: boolean;
}) {
  const copy = useDictionary().admin.home;
  const title = textIn({ en: banner.titleEn, es: banner.titleEs }, locale);
  const status = scheduleStatus(banner, today);

  return (
    <li
      className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0"
      data-testid="home-banner-row"
    >
      <div className="relative aspect-[3/2] w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="5rem"
          src={banner.image.url}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {banner.placement
              ? copy.banners.placements[banner.placement]
              : copy.banners.notOnPage}
          </span>
          <span
            className={
              status === "showing"
                ? "rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
            }
            data-testid="home-banner-status"
          >
            {copy.status[status]}
          </span>
        </p>
        {unpublishedLink ? (
          <p
            className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
            data-testid="home-layout-warning"
          >
            <TriangleAlert
              aria-hidden="true"
              className="mt-px size-3.5 shrink-0"
            />
            {copy.banners.linkUnpublished}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          aria-label={interpolate(copy.banners.edit, { title })}
          onClick={(event) => {
            onEdit(event.currentTarget);
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Pencil aria-hidden="true" />
        </Button>
        <Button
          aria-label={interpolate(copy.banners.delete, { title })}
          onClick={(event) => {
            onDelete(event.currentTarget);
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

/**
 * Why the storefront leaves an article out (FER-020's rule for the curated
 * rows, FER-059's for a spotlight), or `null` when it shows.
 */
function articleWarning(
  article: Article | undefined,
  warnings: { unavailable: string; unpublished: string }
): string | null {
  if (article?.status !== "published") {
    return warnings.unpublished;
  }

  return article.isAvailable ? null : warnings.unavailable;
}

/**
 * An article spotlight of the list (FER-059): its article's photo and
 * name, its label, whether it is on this page, a warning when the
 * storefront leaves it out, and its edit and delete buttons, named with
 * the article.
 */
function SpotlightRow({
  article,
  name,
  onDelete,
  onEdit,
  spotlight,
}: {
  article: Article | undefined;
  name: string;
  onDelete: (opener: HTMLButtonElement) => void;
  onEdit: (opener: HTMLButtonElement) => void;
  spotlight: Spotlight;
}) {
  const { admin } = useDictionary();
  const locale = useLocale();
  const copy = admin.home;
  const warning = articleWarning(article, copy.layout.warnings);
  const label = labelIn(spotlight, locale);

  return (
    <li
      className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0"
      data-testid="home-spotlight-row"
    >
      <div className="relative aspect-square w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
        {article?.image ? (
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="3.5rem"
            src={article.image.url}
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {label ? (
            <span
              data-testid="home-spotlight-label"
              // The screen's language needs no mark; the other one does,
              // so a screen reader says it in its own voice.
              lang={label.lang === locale ? undefined : label.lang}
            >
              {label.text}
            </span>
          ) : null}
          <span
            className={
              warning === null && spotlight.onPage
                ? "rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
            }
            data-testid="home-spotlight-status"
          >
            {spotlight.onPage ? copy.spotlights.onPage : copy.banners.notOnPage}
          </span>
        </p>
        {warning ? (
          <p
            className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
            data-testid="home-layout-warning"
          >
            <TriangleAlert
              aria-hidden="true"
              className="mt-px size-3.5 shrink-0"
            />
            {warning}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        <Button
          aria-label={interpolate(copy.spotlights.edit, { name })}
          onClick={(event) => {
            onEdit(event.currentTarget);
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Pencil aria-hidden="true" />
        </Button>
        <Button
          aria-label={interpolate(copy.spotlights.delete, { name })}
          onClick={(event) => {
            onDelete(event.currentTarget);
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

/**
 * The article spotlights' card (FER-059): their list, the side sheet that
 * adds or edits one and the question before deleting one. Focus goes back
 * to what opened the sheet or the question, or to "Nueva vidriera" once
 * the spotlight it was on is gone.
 */
function SpotlightsManager({
  articleName,
  data,
  describeSection,
}: {
  articleName: (id: number) => string;
  data: PageCurationData;
  describeSection: (section: PageSection) => PageLayoutEntry;
}) {
  const copy = useDictionary().admin.home;
  const headingId = useId();
  const createSpotlight = useCreateSpotlight();
  const updateSpotlight = useUpdateSpotlight();
  const deleteSpotlight = useDeleteSpotlight();
  // `null` closed; `{ spotlight: null }` a new spotlight.
  const [spotlighting, setSpotlighting] = useState<{
    spotlight: Spotlight | null;
  } | null>(null);
  // The sheet open now, by identity, as the banners' (`openSheet`).
  const openSpotlightSheet = useRef<{ spotlight: Spotlight | null } | null>(
    null
  );
  // Each opening of the question is its own object, as the sheet's: a
  // deletion that ends after the staff asked about another spotlight leaves
  // that question open.
  const [unspotlighting, setUnspotlighting] = useState<{
    spotlight: Spotlight;
  } | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const addSpotlightButton = useRef<HTMLButtonElement>(null);
  const articles = new Map(data.articles.map((row) => [row.id, row]));
  // The sequence under the cover, the spotlight being edited left out:
  // where it can go.
  const placesFor = (spotlight: Spotlight | null) => {
    const sections = data.sections.filter(
      (section) =>
        section.kind !== "spotlight" || section.spotlightId !== spotlight?.id
    );
    const at = spotlight
      ? data.sections.findIndex(
          (section) =>
            section.kind === "spotlight" && section.spotlightId === spotlight.id
        )
      : -1;

    return {
      names: sections.map((section) => describeSection(section).name),
      rowsIndex: at === -1 ? null : at,
    };
  };

  const showSpotlightSheet = (sheet: { spotlight: Spotlight | null }) => {
    openSpotlightSheet.current = sheet;
    setSpotlighting(sheet);
  };

  const closeSpotlightSheet = () => {
    openSpotlightSheet.current = null;
    setSpotlighting(null);
  };

  const saveSpotlight = async (values: SpotlightFormValues) => {
    // Each opening of the sheet is its own object: a save that lands after
    // the staff closed this sheet and opened another closes only its own.
    const sheet = spotlighting;
    const spotlight = sheet?.spotlight ?? null;

    try {
      if (spotlight) {
        await updateSpotlight.mutateAsync({
          ...values,
          id: spotlight.id,
          pageId: data.pageId,
        });
        toast.success(copy.spotlightForm.saved);
      } else {
        await createSpotlight.mutateAsync({ ...values, pageId: data.pageId });
        toast.success(copy.spotlightForm.created);
      }

      if (openSpotlightSheet.current === sheet) {
        closeSpotlightSheet();
      }

      return true;
    } catch (error) {
      reportError(error, {
        action: spotlight ? "Home.update_spotlight" : "Home.create_spotlight",
      });
      return false;
    }
  };

  // Its question closes either way: a refused deletion says why in a toast.
  const removeSpotlight = async (asked: { spotlight: Spotlight }) => {
    try {
      await deleteSpotlight.mutateAsync({ id: asked.spotlight.id });
      toast.success(copy.spotlights.deleted);
    } catch (error) {
      reportError(error, { action: "Home.delete_spotlight" });
      toast.error(copy.spotlights.errors.delete);
    }

    setUnspotlighting((open) => (open === asked ? null : open));
  };

  const spotlightPlaces = placesFor(spotlighting?.spotlight ?? null);
  const spotlightChoice = spotlighting?.spotlight?.productId;

  return (
    <>
      <section
        aria-labelledby={headingId}
        className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground md:p-5"
        data-testid="home-spotlights"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-60 space-y-1">
            <h2 className="text-sm font-semibold" id={headingId}>
              {copy.spotlights.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {copy.spotlights.hint}
            </p>
          </div>
          <Button
            data-testid="home-spotlight-add"
            onClick={(event) => {
              opener.current = event.currentTarget;
              showSpotlightSheet({ spotlight: null });
            }}
            ref={addSpotlightButton}
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" />
            {copy.spotlights.add}
          </Button>
        </div>
        {data.spotlights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {copy.spotlights.empty}
          </p>
        ) : (
          <ul className="divide-y">
            {data.spotlights.map((spotlight) => (
              <SpotlightRow
                article={articles.get(spotlight.productId)}
                key={spotlight.id}
                name={articleName(spotlight.productId)}
                onDelete={(button) => {
                  opener.current = button;
                  setUnspotlighting({ spotlight });
                }}
                onEdit={(button) => {
                  opener.current = button;
                  showSpotlightSheet({ spotlight });
                }}
                spotlight={spotlight}
              />
            ))}
          </ul>
        )}
      </section>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            closeSpotlightSheet();
          }
        }}
        open={spotlighting !== null}
      >
        <SheetContent
          data-testid="home-spotlight-sheet"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (opener.current ?? addSpotlightButton.current)?.focus();
          }}
        >
          <SheetHeader closeLabel={copy.spotlightForm.close}>
            <SheetTitle>
              {spotlighting?.spotlight
                ? copy.spotlightForm.editTitle
                : copy.spotlightForm.createTitle}
            </SheetTitle>
            <SheetDescription>
              {copy.spotlightForm.description}
            </SheetDescription>
          </SheetHeader>
          {spotlighting ? (
            <SpotlightForm
              // The published articles, and the one it features already.
              articles={data.articles
                .filter(
                  (row) =>
                    row.status === "published" || row.id === spotlightChoice
                )
                .map((row) => ({ id: row.id, label: articleName(row.id) }))}
              key={spotlighting.spotlight?.id ?? "new"}
              onCancel={() => {
                closeSpotlightSheet();
              }}
              onSave={saveSpotlight}
              rows={spotlightPlaces.names}
              rowsIndex={spotlightPlaces.rowsIndex}
              spotlight={spotlighting.spotlight}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        confirmLabel={copy.spotlights.deleteConfirm}
        description={interpolate(copy.spotlights.deleteDescription, {
          name: unspotlighting
            ? articleName(unspotlighting.spotlight.productId)
            : "",
        })}
        isPending={deleteSpotlight.isPending}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // The deleted spotlight's button is gone: the list's own button.
          const target = opener.current?.isConnected
            ? opener.current
            : addSpotlightButton.current;
          target?.focus();
        }}
        onConfirm={() => {
          // The dialog only asks while a spotlight is chosen.
          if (unspotlighting) {
            void removeSpotlight(unspotlighting);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setUnspotlighting(null);
          }
        }}
        open={unspotlighting !== null}
        pendingLabel={copy.spotlights.deletePending}
        title={copy.spotlights.deleteTitle}
      />
    </>
  );
}

/**
 * The screen once the home is read: the announcement's card, the banners'
 * card with its side sheet, the order's cards and the preview, which reads
 * both forms as they are typed.
 */
function CurationScreen({ data }: { data: PageCurationData }) {
  const { admin, storefront } = useDictionary();
  const locale = useLocale();
  const copy = admin.home;
  const layoutId = useId();
  // Before React owns the page, a press would submit the form the
  // browser's way, its fields in the address.
  const hydrated = useHydrated();
  const saveAnnouncement = useSaveAnnouncement();
  const saveLayout = useSavePageLayout();
  const createBanner = useCreateBanner();
  const updateBanner = useUpdateBanner();
  const deleteBanner = useDeleteBanner();
  const announcementForm = useForm<
    AnnouncementFormFields,
    unknown,
    SaveAnnouncementValues
  >({
    defaultValues: announcementFields(data.announcement),
    resolver: zodResolver(
      createAnnouncementFormSchema(copy.announcement.errors)
    ),
  });
  const layoutSchema = createPageLayoutFormSchema(copy.layout.errors);
  const layoutForm = useForm<
    PageLayoutFormFields,
    unknown,
    SavePageLayoutValues
  >({
    defaultValues: layoutFieldsOf(data),
    resolver: zodResolver(layoutSchema),
  });
  // The page the order form last followed.
  const followed = useRef(data);
  const savingLayout = saveLayout.isPending;

  // The server's page changed under the form (a banner added, moved or
  // deleted from the side sheet): its order becomes the form's defaults,
  // and an order moved and not saved yet is kept over it, less what is gone.
  // A save in flight owns the form until it settles: a reset now would
  // unlock its lists, and the save's own reset would then undo any move.
  useEffect(() => {
    const previous = followed.current;

    if (previous === data || savingLayout) {
      return;
    }

    followed.current = data;
    const next = layoutFieldsOf(data);
    const lists = followServerLayout(
      {
        draft: layoutForm.getValues(),
        next,
        previous: layoutFieldsOf(previous),
      },
      new Set(data.articles.map((row) => row.id))
    );

    layoutForm.reset(next);

    // The draft goes in by a reset too: a `setValue` right after a reset
    // never reaches the lists on screen, whose field arrays register again
    // only on their next render.
    if (
      (["cover", "featured", "ranking", "sections"] as const).some(
        (name) => !sameLayoutList(lists[name], next[name])
      )
    ) {
      layoutForm.reset({ ...next, ...lists }, { keepDefaultValues: true });
    }
  }, [data, layoutForm, savingLayout]);

  const { isDirty: announcementDirty } = useFormState({
    control: announcementForm.control,
  });
  // The announcement the form last followed.
  const followedAnnouncement = useRef(data.announcement);
  const savingAnnouncement = saveAnnouncement.isPending;

  // The saved announcement changed (another tab, another admin): an
  // untouched form shows it; one with edits keeps them until they are saved
  // or undone. Not while a save is in flight, which resets the form itself.
  useEffect(() => {
    if (
      followedAnnouncement.current === data.announcement ||
      announcementDirty ||
      savingAnnouncement
    ) {
      return;
    }

    followedAnnouncement.current = data.announcement;
    announcementForm.reset(announcementFields(data.announcement));
  }, [
    announcementDirty,
    announcementForm,
    data.announcement,
    savingAnnouncement,
  ]);
  // `null` closed; `{ banner: null }` a new banner.
  const [editing, setEditing] = useState<{ banner: Banner | null } | null>(
    null
  );
  // The sheet open now, by identity: a save that ends after its sheet was
  // closed, or another one opened, leaves the open one alone.
  const openSheet = useRef<{ banner: Banner | null } | null>(null);
  // Each opening of the question is its own object, as the sheet's: a
  // deletion that ends after the owner asked about another banner leaves
  // that question open.
  const [deleting, setDeleting] = useState<{ banner: Banner } | null>(null);
  // What opened the sheet or the dialog: focus goes back to it, or to the
  // "new banner" button once its banner is gone.
  const opener = useRef<HTMLButtonElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const articles = new Map(data.articles.map((row) => [row.id, row]));
  const banners = new Map(data.banners.map((row) => [row.id, row]));
  const categories = new Map(data.categories.map((row) => [row.id, row]));
  const spotlights = new Map(data.spotlights.map((row) => [row.id, row]));
  const articleName = (id: number) => {
    const article = articles.get(id);
    const name = article
      ? textIn({ en: article.titleEn, es: article.titleEs }, locale)
      : "";

    return name.trim() === "" ? copy.layout.untitled : name;
  };
  const bannerTitle = (id: number) => {
    const banner = banners.get(id);

    return banner
      ? textIn({ en: banner.titleEn, es: banner.titleEs }, locale)
      : copy.layout.untitled;
  };
  const bannerNote = (id: number) => {
    const banner = banners.get(id);
    const status = banner ? scheduleStatus(banner, data.today) : "off";

    return status === "showing" ? null : copy.status[status];
  };
  const publishedIn = new Set(
    data.articles.flatMap((row) =>
      row.status === "published" && row.categoryId !== null
        ? [row.categoryId]
        : []
    )
  );
  const describeArticle = (id: number): PageLayoutEntry => ({
    name: articleName(id),
    note: null,
    warning: articleWarning(articles.get(id), copy.layout.warnings),
  });
  const describeSection = (section: PageSection): PageLayoutEntry => {
    if (section.kind === "category") {
      const category = categories.get(section.categoryId);

      return {
        name: category
          ? textIn({ en: category.nameEn, es: category.nameEs }, locale)
          : copy.layout.untitled,
        note: publishedIn.has(section.categoryId)
          ? null
          : copy.layout.categoryEmpty,
        warning: null,
      };
    }

    if (section.kind === "banner") {
      return {
        name: interpolate(copy.layout.bannerRow, {
          title: bannerTitle(section.bannerId),
        }),
        note: bannerNote(section.bannerId),
        warning: null,
      };
    }

    if (section.kind === "spotlight") {
      const productId = spotlights.get(section.spotlightId)?.productId ?? 0;

      return {
        name: interpolate(copy.layout.spotlightRow, {
          name: articleName(productId),
        }),
        note: null,
        warning: articleWarning(articles.get(productId), copy.layout.warnings),
      };
    }

    return {
      name:
        section.kind === "best_sellers"
          ? copy.layout.bestSellers
          : copy.layout.featured,
      note: null,
      warning: null,
    };
  };
  const announcementDraft = useWatch({ control: announcementForm.control });
  const layoutDraft = useWatch({ control: layoutForm.control });
  const announcementRead = createAnnouncementFormSchema(
    copy.announcement.errors
  ).safeParse(announcementDraft);
  const preview = previewPageContent(
    data,
    {
      announcement: announcementRead.success ? announcementRead.data : null,
      layout: previewLayout(layoutSchema, layoutDraft, data),
    },
    locale
  );
  // The sequence under the cover, the banner being edited left out: where a
  // banner between rows can go.
  const rowsFor = (banner: Banner | null) => {
    const sections = data.sections.filter(
      (section) => section.kind !== "banner" || section.bannerId !== banner?.id
    );
    const at = banner
      ? data.sections.findIndex(
          (section) =>
            section.kind === "banner" && section.bannerId === banner.id
        )
      : -1;

    return {
      names: sections.map((section) => describeSection(section).name),
      rowsIndex: at === -1 ? null : at,
    };
  };

  const showSheet = (sheet: { banner: Banner | null }) => {
    openSheet.current = sheet;
    setEditing(sheet);
  };

  const closeSheet = () => {
    openSheet.current = null;
    setEditing(null);
  };

  const saveBanner = async (
    values: BannerFormValues
  ): Promise<BannerFormOutcome> => {
    const sheet = editing;
    const banner = sheet?.banner ?? null;

    try {
      if (banner) {
        await updateBanner.mutateAsync({
          ...values,
          id: banner.id,
          pageId: data.pageId,
          image: sameImage(values.image, banner.image)
            ? undefined
            : values.image,
          imagePhone: sameImage(values.imagePhone, banner.imagePhone)
            ? undefined
            : values.imagePhone,
        });
        toast.success(copy.bannerForm.saved);
      } else {
        await createBanner.mutateAsync({ ...values, pageId: data.pageId });
        toast.success(copy.bannerForm.created);
      }

      if (openSheet.current === sheet) {
        closeSheet();
      }

      return "saved";
    } catch (error) {
      // A full cover is the owner's to fix, not a failure to report.
      if (error instanceof ORPCError && error.code === "CONFLICT") {
        return "coverFull";
      }

      reportError(error, {
        action: banner ? "Home.update_banner" : "Home.create_banner",
      });
      return "failed";
    }
  };

  // Its question closes either way: a refused deletion says why in a toast.
  const removeBanner = async (asked: { banner: Banner }) => {
    try {
      await deleteBanner.mutateAsync({ id: asked.banner.id });
      toast.success(copy.banners.deleted);
    } catch (error) {
      reportError(error, { action: "Home.delete_banner" });
      toast.error(copy.banners.errors.delete);
    }

    setDeleting((open) => (open === asked ? null : open));
  };

  const editingRows = rowsFor(editing?.banner ?? null);
  const formBanner: BannerFormBanner | null = editing?.banner ?? null;

  return (
    <AdminPage
      primaryAction={
        <Button
          className="w-full md:w-auto"
          data-testid="home-layout-submit"
          disabled={!hydrated || saveLayout.isPending}
          form={layoutId}
          type="submit"
        >
          {saveLayout.isPending ? copy.layout.pending : copy.layout.submit}
        </Button>
      }
      title={copy.title}
    >
      <p className="text-sm text-muted-foreground">{copy.description}</p>
      <AnnouncementForm
        form={announcementForm}
        onSave={async (values) => {
          try {
            await saveAnnouncement.mutateAsync(values);
            toast.success(copy.announcement.saved);
            return true;
          } catch (error) {
            reportError(error, { action: "Home.save_announcement" });
            toast.error(copy.announcement.errors.save);
            return false;
          }
        }}
      />
      <section
        aria-labelledby={`${layoutId}-banners`}
        className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground md:p-5"
        data-testid="home-banners"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-60 space-y-1">
            <h2 className="text-sm font-semibold" id={`${layoutId}-banners`}>
              {copy.banners.title}
            </h2>
            <p className="text-xs text-muted-foreground">{copy.banners.hint}</p>
          </div>
          <Button
            data-testid="home-banner-add"
            onClick={(event) => {
              opener.current = event.currentTarget;
              showSheet({ banner: null });
            }}
            ref={addButton}
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" />
            {copy.banners.add}
          </Button>
        </div>
        {data.banners.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.banners.empty}</p>
        ) : (
          <ul className="divide-y">
            {data.banners.map((banner) => (
              <BannerRow
                banner={banner}
                key={banner.id}
                locale={locale}
                onDelete={(button) => {
                  opener.current = button;
                  setDeleting({ banner });
                }}
                onEdit={(button) => {
                  opener.current = button;
                  showSheet({ banner });
                }}
                today={data.today}
                unpublishedLink={
                  banner.link.kind === "product" && banner.href === null
                }
              />
            ))}
          </ul>
        )}
      </section>
      <SpotlightsManager
        articleName={articleName}
        data={data}
        describeSection={describeSection}
      />
      <PageLayoutEditor
        choices={data.articles
          .filter((row) => row.status === "published")
          .map((row) => ({ id: row.id, name: articleName(row.id) }))}
        describeArticle={describeArticle}
        describeBanner={(id) => ({
          name: bannerTitle(id),
          note: bannerNote(id),
          warning: null,
        })}
        describeSection={describeSection}
        form={layoutForm}
        id={layoutId}
        onSave={async (values) => {
          try {
            await saveLayout.mutateAsync({ ...values, pageId: data.pageId });
            toast.success(copy.layout.saved);
            return true;
          } catch (error) {
            reportError(error, { action: "Home.save_layout" });
            toast.error(copy.layout.errors.save);
            return false;
          }
        }}
      />
      <section
        aria-labelledby={`${layoutId}-preview`}
        className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground md:p-5"
        data-testid="home-preview"
      >
        <div className="space-y-1">
          <h2 className="text-sm font-semibold" id={`${layoutId}-preview`}>
            {copy.preview.title}
          </h2>
          <p className="text-xs text-muted-foreground">{copy.preview.hint}</p>
        </div>
        <StorePagePreview
          className="rounded-md border"
          content={preview}
          copy={storefront}
          locale={locale}
          words={{
            coverMore: copy.preview.coverMore,
            empty: copy.preview.empty,
          }}
        />
      </section>
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            closeSheet();
          }
        }}
        open={editing !== null}
      >
        <SheetContent
          data-testid="home-banner-sheet"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (opener.current ?? addButton.current)?.focus();
          }}
        >
          <SheetHeader closeLabel={copy.bannerForm.close}>
            <SheetTitle>
              {editing?.banner
                ? copy.bannerForm.editTitle
                : copy.bannerForm.createTitle}
            </SheetTitle>
            <SheetDescription>{copy.bannerForm.description}</SheetDescription>
          </SheetHeader>
          {editing ? (
            <BannerForm
              articles={data.articles.map((row) => ({
                id: row.id,
                label: articleName(row.id),
              }))}
              banner={formBanner}
              categories={data.categories.map((row) => ({
                id: row.id,
                label: textIn({ en: row.nameEn, es: row.nameEs }, locale),
              }))}
              key={editing.banner?.id ?? "new"}
              onCancel={closeSheet}
              onSave={saveBanner}
              rows={editingRows.names}
              rowsIndex={editingRows.rowsIndex}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        confirmLabel={copy.banners.deleteConfirm}
        description={interpolate(copy.banners.deleteDescription, {
          title: deleting ? bannerTitle(deleting.banner.id) : "",
        })}
        isPending={deleteBanner.isPending}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // The deleted banner's button is gone: the list's own button.
          const target = opener.current?.isConnected
            ? opener.current
            : addButton.current;
          target?.focus();
        }}
        onConfirm={() => {
          // The dialog only asks while a banner is chosen.
          if (deleting) {
            void removeBanner(deleting);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
          }
        }}
        open={deleting !== null}
        pendingLabel={copy.banners.deletePending}
        title={copy.banners.deleteTitle}
      />
    </AdminPage>
  );
}

export interface HomeCurationProps {
  /** The page the store shows at `/` (FER-058), which the screen edits. */
  pageId: number;
}

/**
 * The home's curation screen (FER-020) in the admin's shell and cards: the
 * announcement bar, the photo banners, the order of the home page's blocks
 * (FER-058) and a preview of it with what is chosen, before it is saved.
 * Reads the page with `page.get` (prefetched by the route), shows its
 * skeleton while it comes and a retry when it fails.
 */
function HomeCuration({ pageId }: HomeCurationProps) {
  const { admin, common } = useDictionary();
  const copy = admin.home;
  const curation = usePageCuration(pageId);

  if (curation.data) {
    return (
      <section data-slot="home-curation" data-testid="home-curation">
        <CurationScreen data={curation.data} />
      </section>
    );
  }

  return (
    <section data-slot="home-curation" data-testid="home-curation">
      <AdminPage title={copy.title}>
        {curation.isError ? (
          <div
            className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
            role="alert"
          >
            <p className="text-sm">{copy.errors.load}</p>
            <Button
              onClick={() => {
                void curation.refetch();
              }}
              size="sm"
              variant="outline"
            >
              {common.tryAgain}
            </Button>
          </div>
        ) : (
          <div
            aria-busy="true"
            className="space-y-6"
            data-testid="home-curation-skeleton"
          >
            <span className="sr-only">{common.loading}</span>
            {SKELETON_CARDS.map(([card, height]) => (
              <Skeleton className={`${height} w-full rounded-lg`} key={card} />
            ))}
          </div>
        )}
      </AdminPage>
    </section>
  );
}

export { HomeCuration };
