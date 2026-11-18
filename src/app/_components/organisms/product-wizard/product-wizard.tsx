"use client";

import { arrayMove } from "@dnd-kit/sortable";
import { zodResolver } from "@hookform/resolvers/zod";
import { ORPCError } from "@orpc/client";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Trash2,
  Undo2,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type ReactNode,
  type Ref,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type FieldPath,
  type UseFormReturn,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { AdminPage } from "@/app/_components/molecules/admin-page";
import type {
  AttributeFormResult,
  AttributeFormSaved,
} from "@/app/_components/molecules/attribute-form";
import { ConfirmDialog } from "@/app/_components/molecules/confirm-dialog";
import { Form, FormField } from "@/app/_components/molecules/form";
import {
  ProductDetailsForm,
  type TextLanguage,
} from "@/app/_components/molecules/product-details-form";
import {
  ProductFilterChips,
  type ProductFilterChipsProps,
} from "@/app/_components/molecules/product-filter-chips";
import { ProductPhotoDrop } from "@/app/_components/molecules/product-photo-drop";
import { ProductPhotoGrid } from "@/app/_components/molecules/product-photo-grid";
import { ProductPublishGaps } from "@/app/_components/molecules/product-publish-gaps";
import { ProductPublishSuccess } from "@/app/_components/molecules/product-publish-success";
import {
  type ProductSaveState,
  ProductSaveStatus,
} from "@/app/_components/molecules/product-save-status";
import { ProductSeoPreview } from "@/app/_components/molecules/product-seo-preview";
import { ProductWizardSteps } from "@/app/_components/molecules/product-wizard-steps";
import type { StoreArticleMainData } from "@/app/_components/molecules/store-article-main";
import { StoreArticlePreview } from "@/app/_components/molecules/store-article-preview";
import type { Dictionary } from "@/content";
import {
  dropProductEdits,
  keepProductEdits,
  type RestoredEdits,
  restoreProductEdits,
} from "@/lib/admin/product-edits";
import {
  readWizardMode,
  wizardStepPath,
} from "@/lib/admin/product-wizard-mode";
import {
  newProductPath,
  productPath,
  productsPath,
  WIZARD_STEPS,
  type WizardStep,
} from "@/lib/admin/products";
import type { SaveQueueStatus } from "@/lib/admin/save-queue";
import { articlePath, categoryPath } from "@/lib/catalog/paths";
import {
  emptyProductForm,
  formPublishGaps,
  hasTexts,
  productFormValues,
  sameProduct,
  type StoreProduct,
  toProductValues,
} from "@/lib/catalog/product-form";
import { PUBLISH_GAPS, type PublishGap } from "@/lib/catalog/publish-gaps";
import { reportError } from "@/lib/errors/client";
import {
  useCreateAttributeValue,
  useStoreAttributes,
} from "@/lib/hooks/attribute";
import { useStoreCategories } from "@/lib/hooks/category";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import {
  useDeleteProduct,
  useProduct,
  useProductAutosave,
  usePublishProduct,
  useUnpublishProduct,
  useUpdateProduct,
} from "@/lib/hooks/product";
import { useHydrated } from "@/lib/hooks/ui";
import {
  type PhotoRefusal,
  type QueuedPhoto,
  usePhotoQueue,
} from "@/lib/hooks/upload";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import type { client } from "@/lib/orpc/client";
import {
  createProductFormSchema,
  PRICE_MINOR_UNITS,
  PRODUCT_IMAGES_MAX,
  type ProductFormValues,
} from "@/lib/schemas/catalog";
import type { UploadedImage } from "@/lib/schemas/upload";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/utils/format";

type WizardCopy = Dictionary["articles"]["wizard"];
type StoreCategory = Awaited<ReturnType<typeof client.category.list>>[number];
type ProductForm = UseFormReturn<ProductFormValues>;
type ConfirmKind = "discard" | "discardDraft" | "save" | "unpublish";

/** What the wizard knows of the store, read on the server. */
export interface ProductWizardStore {
  currencyCode: Currency;
  name: string;
  /** The store's tagline per language, a description's last default. */
  taglines: Record<TextLanguage, string | undefined>;
}

export interface ProductWizardProps {
  /** The article to edit, or `null` on a new one (nothing stored yet). */
  articleId: number | null;
  /**
   * The "fill with AI" button of FER-018, placed at the top of the details
   * step once that ticket hands it in. Nothing shows while it is left out.
   */
  assistant?: ReactNode;
  /**
   * Whether this server can store photos (a Blob store): without one the
   * photos' zone says so up front and takes none.
   */
  canUpload: boolean;
  /** This site's host, as a search result writes it. */
  host: string;
  store: ProductWizardStore;
}

/** Where each gap is filled: its step, its field and the field's language. */
const GAP_PLACES = {
  category: { field: "categoryId", step: "details" },
  englishTitle: { field: "en.title", language: "en", step: "details" },
  image: { step: "photos" },
  price: { field: "price", step: "details" },
  spanishTitle: { field: "es.title", language: "es", step: "details" },
} as const satisfies Record<
  PublishGap,
  {
    field?: FieldPath<ProductFormValues>;
    language?: TextLanguage;
    step: WizardStep;
  }
>;

/** Every field a check can fail, in the order the wizard shows them. */
const CHECKED_FIELDS = [
  "es.title",
  "es.description",
  "en.title",
  "en.description",
  "categoryId",
  "price",
] as const satisfies readonly FieldPath<ProductFormValues>[];

/** What a confirmation says and how its button looks. */
interface ConfirmWords {
  body: string;
  confirm: string;
  pending: string;
  title: string;
  variant: "default" | "destructive";
}

/** A confirmation's words, in the wizard's copy. */
function confirmWordsOf(copy: WizardCopy, kind: ConfirmKind): ConfirmWords {
  const { draft, published } = copy;
  const words: Record<ConfirmKind, ConfirmWords> = {
    discard: {
      body: published.discardBody,
      confirm: published.discardConfirm,
      pending: published.saving,
      title: published.discardTitle,
      variant: "destructive",
    },
    discardDraft: {
      body: draft.discardBody,
      confirm: draft.discard,
      pending: draft.discarding,
      title: draft.discardTitle,
      variant: "destructive",
    },
    save: {
      body: published.confirmBody,
      confirm: published.confirm,
      pending: published.saving,
      title: published.confirmTitle,
      variant: "default",
    },
    unpublish: {
      body: published.unpublishBody,
      confirm: published.unpublishConfirm,
      pending: published.unpublishing,
      title: published.unpublishTitle,
      variant: "default",
    },
  };

  return words[kind];
}

/** A save refused because publishing would leave a gap: which ones. */
function gapsOf(error: unknown): PublishGap[] | null {
  if (!(error instanceof ORPCError) || error.code !== "BAD_REQUEST") {
    return null;
  }

  const listed = /Missing: (.+)$/u.exec(error.message)?.[1];

  return listed
    ? PUBLISH_GAPS.filter((gap) => listed.split(", ").includes(gap))
    : null;
}

/** What the save line says, from where the article and its saves stand. */
function saveStateOf({
  autosave,
  dirty,
  hasId,
  invalid,
  published,
  uploading,
}: {
  autosave: SaveQueueStatus;
  dirty: boolean;
  hasId: boolean;
  invalid: boolean;
  published: boolean;
  uploading: boolean;
}): ProductSaveState {
  if (published) {
    return dirty ? "unsaved" : "clean";
  }

  if (invalid) {
    return "invalid";
  }

  if (!hasId) {
    return uploading ? "saving" : "notYet";
  }

  return autosave;
}

/** A name in the admin's language, else the Spanish one. */
function nameIn(
  row: { nameEn: string | null; nameEs: string },
  locale: Locale
) {
  return locale === "en" ? (row.nameEn ?? row.nameEs) : row.nameEs;
}

/** What the wizard shows of the article as the server last answered it. */
function factsOf(
  record: StoreProduct | null,
  storeCurrency: Currency,
  locale: Locale
) {
  return {
    currency: record?.currencyCode ?? storeCurrency,
    isPublished: record?.status === "published",
    slug: record?.slug ?? null,
    storePath: record ? localizePath(articlePath(record.slug), locale) : null,
    updatedAt: record?.updatedAt ?? null,
  };
}

/**
 * The article as the storefront will draw it, from the form: in the admin's
 * language as the storefront picks it (English texts, else the Spanish
 * ones), its photos drawn from this browser's files where it has them.
 */
function previewOf({
  categories,
  currency,
  locale,
  previews,
  untitled,
  values,
}: {
  categories: readonly StoreCategory[];
  currency: Currency;
  locale: Locale;
  previews: ReadonlyMap<string, string>;
  untitled: string;
  values: ProductFormValues;
}): StoreArticleMainData {
  const lang: TextLanguage =
    locale === "en" && hasTexts(values.en) ? "en" : "es";
  const texts = values[lang];
  const title = texts.title.trim() || untitled;
  const chosen = categories.find((row) => String(row.id) === values.categoryId);
  const group = categories.find((row) => row.id === chosen?.parentId) ?? null;

  return {
    category: chosen
      ? {
          group: group
            ? {
                name: nameIn(group, locale),
                path: categoryPath({ parentSlug: null, slug: group.slug }),
              }
            : null,
          name: nameIn(chosen, locale),
          path: categoryPath({
            parentSlug: group?.slug ?? null,
            slug: chosen.slug,
          }),
        }
      : null,
    currencyCode: currency,
    description: texts.description,
    images: values.images.map((image, index) => ({
      alt: title,
      height: image.height,
      id: index,
      url: previews.get(image.url) ?? image.url,
      width: image.width,
    })),
    isAvailable: values.isAvailable,
    lang,
    priceAmount: Math.round((values.price ?? 0) * PRICE_MINOR_UNITS),
    title,
  };
}

/**
 * The article wizard (FER-017). A new article is loaded in three steps,
 * photos, details, review, then published; an article opened from the list
 * is one screen with everything on it (Lucas, 2026-11-18). The address
 * decides which (`readWizardMode`): the journey's step lives in it
 * (`?step=details`), so back, forward and a reload land where the person
 * was. Each fresh visit to a new article starts blank (`bfcacheId`); an
 * article opens once its read arrived, and only once React owns the page,
 * since a published article's unsaved changes come from this browser's
 * storage.
 */
function ProductWizard(props: ProductWizardProps) {
  const { bfcacheId } = useRouter();
  const hydrated = useHydrated();
  const product = useProduct(props.articleId);
  const { articles, common } = useDictionary();
  const editing = props.articleId !== null;

  if (editing && product.isError) {
    return (
      <AdminPage title={articles.wizard.titleEdit}>
        <div
          className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
          role="alert"
        >
          <p className="text-sm">{articles.wizard.errors.load}</p>
          <Button
            onClick={() => {
              void product.refetch();
            }}
            size="sm"
            variant="outline"
          >
            {common.tryAgain}
          </Button>
        </div>
      </AdminPage>
    );
  }

  if (!hydrated || (editing && !product.data)) {
    return (
      <AdminPage
        title={editing ? articles.wizard.titleEdit : articles.wizard.titleNew}
      >
        <div
          aria-busy="true"
          className="space-y-4"
          data-testid="product-wizard-skeleton"
        >
          <span className="sr-only">{common.loading}</span>
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </div>
      </AdminPage>
    );
  }

  return (
    <WizardEditor
      article={product.data ?? null}
      assistant={props.assistant}
      canUpload={props.canUpload}
      host={props.host}
      // A new article starts blank on every fresh visit and keeps its state
      // across back and forward; an existing one is keyed by its id.
      key={props.articleId ?? bfcacheId}
      store={props.store}
    />
  );
}

/**
 * How the article shows and how to move through it: the mode its address
 * gives (`readWizardMode`), and for the journey a pushed history entry per
 * step (Next keeps its router in step with it) and the side the new step
 * slides in from.
 */
function useWizardMode({
  id,
  isNew,
  isPublished,
  locale,
}: {
  id: number | null;
  /**
   * The wizard opened on a new article: its journey goes on in steps once
   * the draft exists too, before the router has read the draft's address.
   */
  isNew: boolean;
  isPublished: boolean;
  locale: Locale;
}) {
  const searchParams = useSearchParams();
  const mode = readWizardMode({
    isNew,
    isPublished,
    step: searchParams.get("step"),
  });
  const step = mode.kind === "steps" ? mode.step : null;
  const [direction, setDirection] = useState<"back" | "next">("next");

  return {
    direction,
    goTo: (next: WizardStep) => {
      setDirection(
        step !== null && WIZARD_STEPS.indexOf(next) < WIZARD_STEPS.indexOf(step)
          ? "back"
          : "next"
      );
      window.history.pushState(null, "", wizardStepPath(id, locale, next));
    },
    mode,
    step,
  };
}

/**
 * A changed step brings focus to its heading, or to the field a gap or a
 * failed check led to (on another step, or in the other language), so a
 * keyboard and a screen reader start where the eye does. On the single
 * screen (`step` null) only the language moves.
 */
function useStepFocus({
  form,
  heading,
  language,
  step,
}: {
  form: ProductForm;
  heading: RefObject<HTMLHeadingElement | null>;
  language: TextLanguage;
  step: WizardStep | null;
}) {
  const shown = useRef({ language, step });
  const pending = useRef<FieldPath<ProductFormValues> | null>(null);

  useEffect(() => {
    const field = pending.current;
    const stepChanged = shown.current.step !== step;
    shown.current = { language, step };
    pending.current = null;

    if (field) {
      form.setFocus(field);
    } else if (stepChanged) {
      heading.current?.focus();
    }
  }, [form, heading, language, step]);

  /** Focuses `field` once the step or the language it waits for shows. */
  return (field: FieldPath<ProductFormValues>) => {
    pending.current = field;
  };
}

/** The form's values, read through `useWatch` so every change renders. */
function useFormValues(form: ProductForm): ProductFormValues {
  // Never `getValues` in render: the compiler would memoize a read off the
  // stable form and show stale values.
  const [attributeValueIds, categoryId, en, es, images, isAvailable, price] =
    useWatch({
      control: form.control,
      name: [
        "attributeValueIds",
        "categoryId",
        "en",
        "es",
        "images",
        "isAvailable",
        "price",
      ],
    });

  return { attributeValueIds, categoryId, en, es, images, isAvailable, price };
}

function WizardEditor({
  article,
  assistant,
  canUpload,
  host,
  store,
}: Omit<ProductWizardProps, "articleId"> & { article: StoreProduct | null }) {
  const { articles, storefront } = useDictionary();
  const copy = articles.wizard;
  const locale = useLocale();
  const router = useRouter();
  // A published article's unsaved changes, kept in this browser; once
  // saved or discarded, nothing is said about them any more.
  const [restored, setRestored] = useState<RestoredEdits>(() =>
    article?.status === "published"
      ? restoreProductEdits(article.id, article.updatedAt)
      : { kind: "none" }
  );
  // What the article holds on the server, as the form would hold it: a
  // published article's changes are those that differ from it.
  const [baseline, setBaseline] = useState(() =>
    article ? productFormValues(article) : emptyProductForm()
  );
  const schema = useMemo(
    () => createProductFormSchema(copy.errors),
    [copy.errors]
  );
  const form = useForm<ProductFormValues>({
    defaultValues: restored.kind === "restored" ? restored.values : baseline,
    mode: "onChange",
    resolver: zodResolver(schema),
  });
  const values = useFormValues(form);
  const [language, setLanguage] = useState<TextLanguage>("es");
  const [refusals, setRefusals] = useState<PhotoRefusal[]>([]);
  const [photoGap, setPhotoGap] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [dirty, setDirty] = useState(restored.kind === "restored");
  const [justPublished, setJustPublished] = useState(false);
  const [confirming, setConfirming] = useState<ConfirmKind | null>(null);
  const [busy, setBusy] = useState(false);
  // The photos uploaded from this browser, drawn from its own files until
  // the page is left, so a thumbnail never flashes while the store's copy
  // loads.
  const [previews, setPreviews] = useState<ReadonlyMap<string, string>>(
    () => new Map()
  );
  const shownPreviews = useRef(previews);
  const lastQueued = useRef<string | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const photosHeading = useRef<HTMLHeadingElement>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);
  const stepAtCreation = useRef<WizardStep>("photos");
  const categories = useStoreCategories();
  const attributes = useStoreAttributes();
  const createValue = useCreateAttributeValue();
  const update = useUpdateProduct();
  const publish = usePublishProduct();
  const unpublish = useUnpublishProduct();
  const remove = useDeleteProduct();
  const autosave = useProductAutosave({
    id: article?.id ?? null,
    onCreated: (created) => {
      // The draft has an address of its own now: a reload restores it. The
      // wizard stays mounted, and the photos still on their way go on.
      window.history.replaceState(
        null,
        "",
        wizardStepPath(created, locale, stepAtCreation.current)
      );
    },
  });
  const { flush, id, retry: retrySave, saveNow, schedule } = autosave;
  const { currency, isPublished, slug, storePath, updatedAt } = factsOf(
    useProduct(id).data ?? article,
    store.currencyCode,
    locale
  );
  const {
    direction,
    goTo: goToStep,
    mode,
    step,
  } = useWizardMode({ id, isNew: article === null, isPublished, locale });
  const categoryRows = categories.data ?? [];
  /** Says what happened to a photo, by its place ("Foto 2"). */
  const say = (
    template: string,
    index: number,
    place: { position?: number; total?: number } = {}
  ) => {
    setAnnouncement(
      interpolate(template, {
        photo: interpolate(copy.photos.photo, { position: index + 1 }),
        position: place.position ?? index + 1,
        total: place.total ?? 0,
      })
    );
  };
  const addPhoto = (image: UploadedImage) => {
    const held = form.getValues("images");
    form.setValue("images", [...held, image], { shouldDirty: true });
    setPhotoGap(false);
    say(copy.photos.announce.uploaded, held.length);
  };
  const queue = usePhotoQueue({
    onUploaded: ({ image, preview }) => {
      setPreviews((was) => new Map(was).set(image.url, preview));
      addPhoto(image);
    },
    purpose: "product",
  });
  const uploading = queue.items.some((item) => item.state.status !== "failed");
  const gaps = formPublishGaps(values);
  const canLeavePhotos = values.images.length > 0 || uploading;

  useEffect(() => {
    if (step !== null) {
      stepAtCreation.current = step;
    }
  }, [step]);

  const focusOnceShown = useStepFocus({
    form,
    heading: stepHeading,
    language,
    step,
  });

  // Every thumbnail drawn from this browser's files, freed on leaving.
  useEffect(() => {
    shownPreviews.current = previews;
  }, [previews]);
  useEffect(
    () => () => {
      for (const preview of shownPreviews.current.values()) {
        URL.revokeObjectURL(preview);
      }
    },
    []
  );

  useEffect(() => {
    if (justPublished) {
      successHeading.current?.focus();
    }
  }, [justPublished]);

  // Every change: a draft saves itself, a published article keeps it here.
  useEffect(
    () =>
      form.subscribe({
        callback: () => {
          const current = form.getValues();

          if (isPublished) {
            const changed = !sameProduct(current, baseline);
            setDirty(changed);

            if (id !== null && updatedAt !== null) {
              if (changed) {
                keepProductEdits(id, updatedAt, current);
              } else {
                dropProductEdits(id);
              }
            }

            return;
          }

          const valid = schema.safeParse(current).success;
          setInvalid(!valid);
          const payload = toProductValues(current);
          const text = JSON.stringify(payload);

          // Nothing is stored before the first photo: it creates the draft.
          if (
            !valid ||
            text ===
              (lastQueued.current ??
                JSON.stringify(toProductValues(baseline))) ||
            (id === null && payload.images.length === 0)
          ) {
            return;
          }

          lastQueued.current = text;

          if (id === null) {
            saveNow(payload);
          } else {
            schedule(payload);
          }
        },
        formState: { values: true },
      }),
    [
      baseline,
      form,
      id,
      isPublished,
      lastQueued,
      saveNow,
      schedule,
      schema,
      updatedAt,
    ]
  );

  const goTo = (next: WizardStep) => {
    setJustPublished(false);
    goToStep(next);
  };

  /**
   * Focuses `field`, on its step (the single screen shows them all) and in
   * its language, once it shows.
   */
  const focusField = (
    field: FieldPath<ProductFormValues>,
    target: WizardStep,
    fieldLanguage?: TextLanguage
  ) => {
    const shown = step === null || target === step;

    if (shown && (!fieldLanguage || fieldLanguage === language)) {
      form.setFocus(field);
      return;
    }

    focusOnceShown(field);

    if (fieldLanguage) {
      setLanguage(fieldLanguage);
    }

    if (!shown) {
      goTo(target);
    }
  };

  const jumpTo = (gap: PublishGap) => {
    const place = GAP_PLACES[gap];

    if ("field" in place) {
      focusField(
        place.field,
        place.step,
        "language" in place ? place.language : undefined
      );
    } else if (step === null) {
      photosHeading.current?.focus();
    } else {
      // Only the review lists what is missing: the photos are elsewhere.
      goTo(place.step);
    }
  };

  /** Marks each gap at its field, in the field's own words. */
  const markGaps = (marked: readonly PublishGap[]) => {
    for (const gap of marked) {
      const place = GAP_PLACES[gap];

      if ("field" in place) {
        form.setError(place.field, {
          message: copy.gapMessages[gap],
          type: "publish",
        });
      } else {
        setPhotoGap(true);
      }
    }
  };

  /** Checks every field; on a failure, takes the person to the first one. */
  const checkFields = async () => {
    if (await form.trigger()) {
      return true;
    }

    const failed = CHECKED_FIELDS.find(
      (field) => form.getFieldState(field).invalid
    );

    if (failed) {
      const [prefix] = failed.split(".");
      focusField(
        failed,
        "details",
        prefix === "en" || prefix === "es" ? prefix : undefined
      );
    }

    return false;
  };

  /** A write refused or failed: its gaps marked, or the failure reported. */
  const refused = (error: unknown, action: string, message: string) => {
    const missing = gapsOf(error);

    if (missing) {
      markGaps(missing);
    } else {
      reportError(error, { action });
    }

    toast.error(message);
  };

  const onPublish = async () => {
    if (!(await checkFields())) {
      return;
    }

    if (gaps.length > 0 || uploading || id === null) {
      markGaps(gaps);
      const [first] = gaps;

      // The review lists what is missing under its heading; the single
      // screen takes the person to the first field that misses.
      if (step !== null) {
        stepHeading.current?.focus();
      } else if (first) {
        jumpTo(first);
      }

      return;
    }

    setBusy(true);

    try {
      if ((await flush()) === "failed") {
        toast.error(copy.save.failed);
      } else {
        await publish.mutateAsync({ id });
        setBaseline(form.getValues());
        dropProductEdits(id);
        setJustPublished(true);
        // The journey ended: a reload opens the article's single screen.
        window.history.replaceState(null, "", productPath(id, locale));
      }
    } catch (error) {
      refused(error, "Product.publish", copy.errors.publishFailed);
    }

    setBusy(false);
  };

  const onSaveDraft = async () => {
    setBusy(true);
    const outcome = await flush();
    setBusy(false);

    if (outcome === "failed") {
      toast.error(copy.save.failed);
      return;
    }

    toast.success(copy.draft.savedAsDraft);
    router.push(productsPath(locale));
  };

  const onAskToSave = async () => {
    if (!(await checkFields())) {
      return;
    }

    const [first] = gaps;

    if (first) {
      markGaps(gaps);
      jumpTo(first);
      return;
    }

    setConfirming("save");
  };

  const onSaveChanges = async (articleId: number) => {
    setBusy(true);
    const typed = form.getValues();

    try {
      await update.mutateAsync({ ...toProductValues(typed), id: articleId });
      setBaseline(typed);
      dropProductEdits(articleId);
      setDirty(false);
      setRestored({ kind: "none" });
      toast.success(copy.published.saved);
    } catch (error) {
      refused(error, "Product.save_changes", copy.errors.generic);
    }

    setConfirming(null);
    setBusy(false);
  };

  const onDiscardChanges = (articleId: number) => {
    dropProductEdits(articleId);
    form.reset(baseline);
    setDirty(false);
    setRestored({ kind: "none" });
    setConfirming(null);
    toast.success(copy.published.discarded);
  };

  const onUnpublish = async (articleId: number) => {
    setBusy(true);

    try {
      await unpublish.mutateAsync({ id: articleId });
      const typed = form.getValues();
      dropProductEdits(articleId);
      setDirty(false);
      setRestored({ kind: "none" });

      // Its unsaved changes become the draft's, saved as a draft's are.
      if (!sameProduct(typed, baseline)) {
        const payload = toProductValues(typed);
        lastQueued.current = JSON.stringify(payload);
        saveNow(payload);
      }

      toast.success(copy.published.unpublished);
    } catch (error) {
      reportError(error, { action: "Product.unpublish" });
      toast.error(copy.errors.unpublishFailed);
    }

    setConfirming(null);
    setBusy(false);
  };

  const onDiscardDraft = async () => {
    setBusy(true);

    try {
      if (id !== null) {
        await remove.mutateAsync({ id });
        dropProductEdits(id);
      }

      toast.success(copy.draft.discarded);
      router.push(productsPath(locale));
    } catch (error) {
      reportError(error, { action: "Product.discard_draft" });
      toast.error(copy.errors.deleteFailed);
    }

    setConfirming(null);
    setBusy(false);
  };

  const onCreateValue = async (
    attributeId: number,
    names: AttributeFormSaved
  ): Promise<{ id?: number; result: AttributeFormResult }> => {
    try {
      const created = await createValue.mutateAsync({
        ...names,
        attributeId,
      });

      return { id: created.id, result: "saved" };
    } catch (error) {
      if (error instanceof ORPCError && error.code === "CONFLICT") {
        return { result: "duplicate" };
      }

      reportError(error, { action: "Attribute.create_value" });
      return { result: "failed" };
    }
  };

  const onConfirm = (kind: ConfirmKind) => {
    if (kind === "discardDraft") {
      void onDiscardDraft();
    } else if (id !== null && kind === "save") {
      void onSaveChanges(id);
    } else if (id !== null && kind === "unpublish") {
      void onUnpublish(id);
    } else if (id !== null) {
      onDiscardChanges(id);
    }
  };

  // Every way to move a photo offers only a real place: the first photo has
  // no "earlier", the last no "later", the main one no star, and a drop on
  // its own place moves nothing (`ProductPhotoGrid`).
  const movePhoto = (from: number, to: number) => {
    const held = form.getValues("images");
    form.setValue("images", arrayMove(held, from, to), { shouldDirty: true });
    say(
      to === 0 ? copy.photos.announce.main : copy.photos.announce.moved,
      from,
      { position: to + 1, total: held.length }
    );
  };

  const preview = previewOf({
    categories: categoryRows,
    currency,
    locale,
    previews,
    untitled: copy.titleNew,
    values,
  });
  // The search texts in the language on screen; the storefront in English
  // shows the Spanish ones while there are none.
  const searchLanguage: TextLanguage =
    language === "en" && !hasTexts(values.en) ? "es" : language;
  const searchTexts = values[searchLanguage];

  const photosSection = (
    <PhotosStep
      canLeave={canLeavePhotos}
      canUpload={canUpload}
      copy={copy}
      gap={photoGap}
      images={values.images}
      onAdd={(files) => {
        const refusedFiles = queue.add(files, values.images.length);
        setRefusals(refusedFiles);
        const left = refusedFiles.reduce(
          (sum, refusal) =>
            sum + (refusal.kind === "tooMany" ? refusal.count : 1),
          0
        );
        const taken = files.length - left;

        if (taken > 0) {
          setAnnouncement(
            taken === 1
              ? copy.photos.announce.addedOne
              : interpolate(copy.photos.announce.added, {
                  count: taken,
                })
          );
        }
      }}
      onMakeMain={(index) => {
        movePhoto(index, 0);
      }}
      onMove={movePhoto}
      onRemove={(index) => {
        const held = form.getValues("images");
        form.setValue(
          "images",
          held.filter((_, at) => at !== index),
          { shouldDirty: true }
        );
        say(copy.photos.announce.removed, index);
      }}
      onRemoveQueued={(key) => {
        const position = queue.items.findIndex((item) => item.key === key);
        queue.remove(key);
        say(copy.photos.announce.cancelled, values.images.length + position);
      }}
      onRetry={(key) => {
        queue.retry(key);
      }}
      previews={previews}
      queued={queue.items}
      refusals={refusals}
    />
  );
  const detailsSection = (
    <ProductDetailsForm
      assistant={assistant}
      categories={categoryRows}
      currency={currency}
      language={language}
      onLanguageChange={setLanguage}
    />
  );
  const filtersSection = (
    <FiltersField
      attributes={attributes.data ?? []}
      hint={copy.details.filtersHint}
      onCreateValue={onCreateValue}
    />
  );
  const searchSection = (
    <ProductSeoPreview
      copy={copy.details.seo}
      currency={currency}
      description={searchTexts.description}
      host={host}
      lang={searchLanguage}
      locale={locale}
      mainPhotoUrl={values.images[0]?.url ?? null}
      price={values.price}
      slug={slug}
      store={{ name: store.name, tagline: store.taglines[language] }}
      title={searchTexts.title}
    />
  );
  const discardDraft = isPublished ? null : (
    <div className="border-t pt-4">
      <Button
        className="text-destructive"
        onClick={() => {
          setConfirming("discardDraft");
        }}
        type="button"
        variant="ghost"
      >
        <Trash2 aria-hidden />
        {copy.draft.discard}
      </Button>
    </div>
  );
  const publishedNotice = isPublished ? (
    <PublishedNotice
      copy={copy}
      dirty={dirty}
      notice={restored.kind === "none" ? null : restored.kind}
      onAsk={setConfirming}
      storePath={storePath}
    />
  ) : null;

  /** The step on screen, under its heading. */
  const stepBody = (shown: WizardStep) => {
    if (shown === "photos") {
      return photosSection;
    }

    if (shown === "details") {
      return (
        <>
          {detailsSection}
          <WizardSection heading={copy.details.filters} level="h3">
            {filtersSection}
          </WizardSection>
          <WizardSection
            className="max-w-3xl"
            heading={copy.details.seo.heading}
            level="h3"
          >
            {searchSection}
          </WizardSection>
        </>
      );
    }

    return (
      <ReviewStep
        busy={busy}
        canSaveDraft={id !== null && !isPublished}
        copy={copy}
        gaps={gaps}
        locale={locale}
        onJump={jumpTo}
        onSaveDraft={() => {
          void onSaveDraft();
        }}
        preview={preview}
      />
    );
  };

  const body = () => {
    if (mode.kind === "steps") {
      return (
        <div className="grid gap-5">
          <ProductWizardSteps
            current={mode.step}
            isReachable={(target) => target === "photos" || canLeavePhotos}
            onSelect={goTo}
          />
          <div
            className={cn(
              "grid min-w-0 gap-5",
              direction === "next"
                ? "motion-safe:animate-wizard-step-next"
                : "motion-safe:animate-wizard-step-back"
            )}
            data-testid={`product-step-${mode.step}`}
            key={mode.step}
          >
            <h2
              className="text-base font-semibold outline-none md:text-lg"
              ref={stepHeading}
              tabIndex={-1}
            >
              {copy[mode.step].heading}
            </h2>
            {stepBody(mode.step)}
            {discardDraft}
          </div>
        </div>
      );
    }

    return (
      <ArticleScreen
        aside={
          <>
            <WizardCard
              heading={copy.review.card}
              testId="product-card-preview"
            >
              <StoreArticlePreview
                article={preview}
                className="mx-auto"
                copy={storefront}
                // Never the article's address: a draft's page would be
                // fetched ahead (a link prefetches) and kept as not found
                // once it is published.
                href="#preview"
                locale={locale}
                view="card"
              />
            </WizardCard>
            <WizardCard
              heading={copy.details.seo.heading}
              testId="product-search-preview"
            >
              {searchSection}
            </WizardCard>
          </>
        }
      >
        {publishedNotice ?? (
          <ProductPublishGaps gaps={gaps} headingLevel="h2" onJump={jumpTo} />
        )}
        <WizardCard
          heading={copy.photos.heading}
          headingRef={photosHeading}
          testId="product-section-photos"
        >
          {photosSection}
        </WizardCard>
        <WizardCard
          heading={copy.details.heading}
          testId="product-section-details"
        >
          {detailsSection}
        </WizardCard>
        <WizardCard
          heading={copy.details.filters}
          testId="product-section-filters"
        >
          {filtersSection}
        </WizardCard>
        {discardDraft}
      </ArticleScreen>
    );
  };

  return (
    <section data-slot="product-wizard" data-testid="product-wizard">
      <AdminPage
        actions={
          <ProductSaveStatus
            className="order-last basis-full md:order-none md:basis-auto"
            onRetry={() => {
              retrySave();
            }}
            state={saveStateOf({
              autosave: autosave.status,
              dirty,
              hasId: id !== null,
              invalid,
              published: isPublished,
              uploading,
            })}
          />
        }
        primaryAction={
          justPublished ? undefined : (
            <WizardActions
              busy={busy}
              canLeavePhotos={canLeavePhotos}
              copy={copy}
              dirty={dirty}
              gaps={gaps}
              onGoTo={goTo}
              onPublish={() => {
                void onPublish();
              }}
              onSave={() => {
                void onAskToSave();
              }}
              published={isPublished}
              step={step}
              uploading={uploading}
            />
          )
        }
        title={mode.kind === "steps" ? copy.titleNew : copy.titleEdit}
      >
        <output
          aria-live="polite"
          className="sr-only"
          data-testid="product-wizard-announcement"
        >
          {announcement}
        </output>
        {justPublished && storePath ? (
          <ProductPublishSuccess
            articlePath={storePath}
            headingRef={successHeading}
            listHref={productsPath(locale)}
            newHref={newProductPath(locale)}
            title={preview.title}
          />
        ) : (
          <Form {...form}>{body()}</Form>
        )}
      </AdminPage>
      <WizardConfirm
        busy={busy}
        copy={copy}
        kind={confirming}
        onClose={() => {
          setConfirming(null);
        }}
        onConfirm={onConfirm}
      />
    </section>
  );
}

/**
 * The main action, in the top bar from `md` up and under the thumb on a
 * phone (`AdminPage`). On the journey "Atrás" past the first step, then
 * "Continuar", "Publicar" on the review; on the single screen (`step`
 * null) "Publicar" for a draft and "Guardar cambios" for a published
 * article. Publishing waits, `aria-disabled` so it still says why when
 * pressed, while something is missing or a photo travels.
 */
function WizardActions({
  busy,
  canLeavePhotos,
  copy,
  dirty,
  gaps,
  onGoTo,
  onPublish,
  onSave,
  published,
  step,
  uploading,
}: {
  busy: boolean;
  canLeavePhotos: boolean;
  copy: WizardCopy;
  dirty: boolean;
  gaps: readonly PublishGap[];
  onGoTo: (step: WizardStep) => void;
  onPublish: () => void;
  onSave: () => void;
  published: boolean;
  step: WizardStep | null;
  uploading: boolean;
}) {
  const at = step === null ? -1 : WIZARD_STEPS.indexOf(step);
  const previous = at > 0 ? WIZARD_STEPS[at - 1] : undefined;
  const next = at === -1 ? undefined : WIZARD_STEPS[at + 1];
  let main: ReactNode;

  if (published) {
    main = (
      <Button
        className="flex-1 md:flex-none"
        data-testid="product-save-changes"
        disabled={!dirty || busy || uploading}
        onClick={onSave}
        type="button"
      >
        {busy ? copy.published.saving : copy.published.save}
      </Button>
    );
  } else if (next) {
    main = (
      <Button
        className="flex-1 md:flex-none"
        data-testid="product-next"
        disabled={step === "photos" && !canLeavePhotos}
        onClick={() => {
          onGoTo(next);
        }}
        type="button"
      >
        {copy.next}
        <ArrowRight aria-hidden />
      </Button>
    );
  } else {
    main = (
      <Button
        aria-disabled={gaps.length > 0 || uploading || busy || undefined}
        className="flex-1 aria-disabled:opacity-50 md:flex-none"
        data-testid="product-publish"
        onClick={() => {
          if (!busy) {
            onPublish();
          }
        }}
        type="button"
      >
        {busy ? copy.review.publishing : copy.review.publish}
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      {previous ? (
        <Button
          aria-label={copy.previous}
          onClick={() => {
            onGoTo(previous);
          }}
          type="button"
          variant="outline"
        >
          <ArrowLeft aria-hidden />
          <span aria-hidden className="hidden sm:inline">
            {copy.previous}
          </span>
        </Button>
      ) : null}
      {main}
    </div>
  );
}

/**
 * A published article's line above the steps: changes stay in this
 * browser until "Guardar cambios"; what was restored or dropped from an
 * earlier visit; and the way to the store, to discard the changes and to
 * take it back to draft.
 */
function PublishedNotice({
  copy,
  dirty,
  notice,
  onAsk,
  storePath,
}: {
  copy: WizardCopy;
  dirty: boolean;
  notice: "restored" | "stale" | null;
  onAsk: (kind: ConfirmKind) => void;
  storePath: string | null;
}) {
  return (
    <div
      // blue-900 on blue-50: 10:1; blue-100 on blue-950: 13:1.
      className="grid gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100"
      data-testid="product-published-notice"
    >
      <p>{copy.published.banner}</p>
      {notice ? (
        <output className="font-medium" data-testid="product-edits-notice">
          {copy.published[notice]}
        </output>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {storePath ? (
          <Button asChild size="sm" variant="outline">
            <a href={storePath} rel="noopener noreferrer" target="_blank">
              <ExternalLink aria-hidden />
              {copy.success.view}
            </a>
          </Button>
        ) : null}
        {dirty ? (
          <Button
            onClick={() => {
              onAsk("discard");
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <Undo2 aria-hidden />
            {copy.published.discard}
          </Button>
        ) : null}
        <Button
          onClick={() => {
            onAsk("unpublish");
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          {copy.published.unpublish}
        </Button>
      </div>
    </div>
  );
}

/** The photos: the drop zone, the main photo's question, the tiles. */
function PhotosStep({
  canLeave,
  canUpload,
  copy,
  gap,
  images,
  onAdd,
  onMakeMain,
  onMove,
  onRemove,
  onRemoveQueued,
  onRetry,
  previews,
  queued,
  refusals,
}: {
  canLeave: boolean;
  canUpload: boolean;
  copy: WizardCopy;
  gap: boolean;
  images: ProductFormValues["images"];
  onAdd: (files: File[]) => void;
  onMakeMain: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onRemoveQueued: (key: string) => void;
  onRetry: (key: string) => void;
  previews: ReadonlyMap<string, string>;
  queued: readonly QueuedPhoto[];
  refusals: readonly PhotoRefusal[];
}) {
  return (
    <>
      <ProductPhotoDrop
        count={images.length + queued.length}
        max={PRODUCT_IMAGES_MAX}
        onFiles={onAdd}
        refusals={refusals}
        unavailable={!canUpload}
      />
      {gap && images.length === 0 ? (
        <p className="text-sm text-destructive" role="alert">
          {copy.gapMessages.image}
        </p>
      ) : null}
      {images.length > 1 ? (
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold">{copy.photos.mainQuestion}</h3>
          <p className="text-xs text-muted-foreground">
            {copy.photos.mainHint}
          </p>
        </div>
      ) : null}
      {images.length + queued.length > 0 ? (
        <ProductPhotoGrid
          onMakeMain={onMakeMain}
          onMove={onMove}
          onRemove={onRemove}
          onRemoveQueued={onRemoveQueued}
          onRetry={onRetry}
          photos={images.map((image) => ({
            ...image,
            preview: previews.get(image.url) ?? image.url,
          }))}
          queued={queued}
        />
      ) : null}
      {canLeave ? null : (
        <p className="text-xs text-muted-foreground">{copy.photos.needOne}</p>
      )}
    </>
  );
}

/**
 * An article opened from the list (Lucas, 2026-11-18): everything on one
 * screen. On a phone its cards stack in the order a person fills them
 * (photos, details, filters), the store's previews last; from `lg` up the
 * form is on the left and the previews stay in view on the right.
 */
function ArticleScreen({
  aside,
  children,
}: {
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
      data-testid="product-screen"
    >
      <div className="grid min-w-0 gap-5">{children}</div>
      <div className="grid min-w-0 gap-5 lg:sticky lg:top-20">{aside}</div>
    </div>
  );
}

/** One of the single screen's cards: its heading, then what it holds. */
function WizardCard({
  children,
  heading,
  headingRef,
  testId,
}: {
  children: ReactNode;
  heading: string;
  /** Makes the heading a focus target (a missing photo leads to it). */
  headingRef?: Ref<HTMLHeadingElement>;
  testId: string;
}) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="grid min-w-0 gap-4 rounded-lg border bg-card p-4 text-card-foreground md:p-5"
      data-testid={testId}
    >
      <h2
        className="text-base font-semibold outline-none"
        id={headingId}
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
      >
        {heading}
      </h2>
      {children}
    </section>
  );
}

/** A part of a journey's step, under a heading of its own. */
function WizardSection({
  children,
  className,
  heading,
  level,
}: {
  children: ReactNode;
  className?: string;
  heading: string;
  level: "h3";
}) {
  const headingId = useId();
  const Heading = level;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("grid min-w-0 gap-3", className)}
    >
      <Heading className="text-sm font-semibold" id={headingId}>
        {heading}
      </Heading>
      {children}
    </section>
  );
}

/** The store's filters for the article, as chips, under their hint. */
function FiltersField({
  attributes,
  hint,
  onCreateValue,
}: {
  attributes: ProductFilterChipsProps["attributes"];
  hint: string;
  onCreateValue: ProductFilterChipsProps["onCreateValue"];
}) {
  const form = useFormContext<ProductFormValues>();

  return (
    <div className="grid min-w-0 gap-3">
      <p className="text-xs text-muted-foreground">{hint}</p>
      <FormField
        control={form.control}
        name="attributeValueIds"
        render={({ field }) => (
          <ProductFilterChips
            attributes={attributes}
            onChange={(ids) => {
              field.onChange(ids);
            }}
            onCreateValue={onCreateValue}
            value={field.value}
          />
        )}
      />
    </div>
  );
}

/**
 * The last step: what publishing still needs, each leading to its field,
 * then the article's card on its grey tile and the top of its page as the
 * storefront draws them, and "Guardar como borrador".
 */
function ReviewStep({
  busy,
  canSaveDraft,
  copy,
  gaps,
  locale,
  onJump,
  onSaveDraft,
  preview,
}: {
  busy: boolean;
  canSaveDraft: boolean;
  copy: WizardCopy;
  gaps: readonly PublishGap[];
  locale: Locale;
  onJump: (gap: PublishGap) => void;
  onSaveDraft: () => void;
  preview: StoreArticleMainData;
}) {
  const { storefront } = useDictionary();

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">{copy.review.hint}</p>
      <ProductPublishGaps gaps={gaps} onJump={onJump} />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">{copy.review.card}</h3>
          <StoreArticlePreview
            article={preview}
            copy={storefront}
            // Never the article's address: a draft's page would be fetched ahead
            // (a link prefetches) and kept as not found once it is published.
            href="#preview"
            locale={locale}
            view="card"
          />
        </section>
        <section className="grid min-w-0 gap-2">
          <h3 className="text-sm font-semibold">{copy.review.page}</h3>
          <StoreArticlePreview
            article={preview}
            className="rounded-lg border"
            copy={storefront}
            href="#preview"
            locale={locale}
            view="page"
          />
        </section>
      </div>
      {canSaveDraft ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={onSaveDraft}
            type="button"
            variant="outline"
          >
            {copy.review.saveDraft}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The confirmation of the moment: its words from `CONFIRMS`. */
function WizardConfirm({
  busy,
  copy,
  kind,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  copy: WizardCopy;
  kind: ConfirmKind | null;
  onClose: () => void;
  onConfirm: (kind: ConfirmKind) => void;
}) {
  const { common } = useDictionary();
  // The words stay while it closes, so it does not change as it fades.
  const [last, setLast] = useState<ConfirmKind>("save");

  if (kind !== null && kind !== last) {
    setLast(kind);
  }

  const words = confirmWordsOf(copy, kind ?? last);

  return (
    <ConfirmDialog
      cancelLabel={common.cancel}
      confirmLabel={words.confirm}
      confirmVariant={words.variant}
      description={words.body}
      isPending={busy}
      onConfirm={() => {
        if (kind !== null) {
          onConfirm(kind);
        }
      }}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={kind !== null}
      pendingLabel={words.pending}
      title={words.title}
    />
  );
}

export { ProductWizard };
