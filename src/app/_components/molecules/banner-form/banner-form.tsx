"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useId, useState } from "react";
import { useForm, useFormState, useWatch } from "react-hook-form";

import { Button } from "@/app/_components/atoms/button";
import { Input } from "@/app/_components/atoms/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/_components/molecules/form";
import { ImageUploader } from "@/app/_components/molecules/image-uploader";
import { SheetBody, SheetFooter } from "@/app/_components/molecules/sheet";
import { DEFAULT_ROWS_INDEX } from "@/lib/home/layout";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  BANNER_LINK_KINDS,
  BANNER_PLACEMENTS,
  type BannerFormFields,
  type BannerFormValues,
  type BannerLink,
  type BannerPlacement,
  COVER_BANNERS_MAX,
  createBannerFormSchema,
} from "@/lib/schemas/home";
import type { UploadedImage } from "@/lib/schemas/upload";

/** A banner as `home.get` reads it: what the form starts from. */
export interface BannerFormBanner {
  ctaLabelEn: string | null;
  ctaLabelEs: string | null;
  endsOn: string | null;
  id: number;
  image: UploadedImage;
  imagePhone: UploadedImage | null;
  isActive: boolean;
  link: BannerLink;
  placement: BannerPlacement;
  startsOn: string | null;
  titleEn: string | null;
  titleEs: string;
}

/** One choice of a list: its id and what it is called. */
export interface BannerFormChoice {
  id: number;
  label: string;
}

/**
 * How a save ended: saved; refused because the cover is full (a banner
 * placed in a cover that holds `COVER_BANNERS_MAX`); or failed otherwise.
 */
export type BannerFormOutcome = "coverFull" | "failed" | "saved";

export interface BannerFormProps {
  /** The store's articles a banner can lead to. */
  articles: readonly BannerFormChoice[];
  /** The banner to edit, or `null` for a new one. */
  banner: BannerFormBanner | null;
  /** The store's categories a banner can lead to. */
  categories: readonly BannerFormChoice[];
  onCancel: () => void;
  /**
   * Saves the banner; answers how it ended. A failure keeps everything
   * typed and the form says why under itself.
   */
  onSave: (values: BannerFormValues) => Promise<BannerFormOutcome>;
  /**
   * The home's sequence under the cover, this banner left out, by name: a
   * banner between rows goes after one of them.
   */
  rows: readonly string[];
  /** The banner's place in `rows` when it is between rows already. */
  rowsIndex: number | null;
}

const SELECT_CLASS =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base disabled:opacity-50 md:h-9 md:text-sm dark:bg-input/30";

/** A link's four fields, as the form holds them. */
function linkFieldsOf(link: BannerLink) {
  return {
    linkCategoryId: link.kind === "category" ? String(link.categoryId) : "",
    linkKind: link.kind,
    linkProductId: link.kind === "product" ? String(link.productId) : "",
    linkUrl: link.kind === "url" ? link.url : "",
  };
}

/** A new banner's fields: in the cover, shown, with no link. */
const NEW_BANNER: Omit<BannerFormFields, "rowsIndex"> = {
  ctaLabelEn: "",
  ctaLabelEs: "",
  endsOn: "",
  image: null,
  imagePhone: null,
  isActive: true,
  ...linkFieldsOf({ kind: "none" }),
  placement: "cover",
  startsOn: "",
  titleEn: "",
  titleEs: "",
};

/** The form's fields for `banner`, or a new banner's. */
function fieldsOf(
  banner: BannerFormBanner | null,
  rowsIndex: number
): BannerFormFields {
  if (!banner) {
    return { ...NEW_BANNER, rowsIndex: String(rowsIndex) };
  }

  return {
    ctaLabelEn: banner.ctaLabelEn ?? "",
    ctaLabelEs: banner.ctaLabelEs ?? "",
    endsOn: banner.endsOn ?? "",
    image: banner.image,
    imagePhone: banner.imagePhone,
    isActive: banner.isActive,
    ...linkFieldsOf(banner.link),
    placement: banner.placement,
    rowsIndex: String(rowsIndex),
    startsOn: banner.startsOn ?? "",
    titleEn: banner.titleEn ?? "",
    titleEs: banner.titleEs,
  };
}

/**
 * How a photo is cropped where the storefront shows it (FER-020): the
 * banner fills the window's width at a fixed height, so a computer shows a
 * wide strip of it and a phone a tall middle. The phone shows its own photo
 * when there is one.
 */
function CropPreview({
  image,
  imagePhone,
  labels,
}: {
  image: UploadedImage;
  imagePhone: UploadedImage | null;
  labels: { computer: string; hint: string; phone: string; title: string };
}) {
  const phone = imagePhone ?? image;

  return (
    <figure
      className="grid min-w-0 gap-2"
      data-testid="banner-form-crop-preview"
    >
      <figcaption className="text-sm font-medium">{labels.title}</figcaption>
      <p className="text-xs text-muted-foreground">{labels.hint}</p>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)] items-end gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="relative aspect-[1440/520] overflow-hidden rounded-md border bg-muted">
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="(min-width: 640px) 20rem, 70vw"
              src={image.url}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {labels.computer}
          </span>
        </div>
        <div className="grid min-w-0 gap-1">
          <div className="relative aspect-[390/472] overflow-hidden rounded-md border bg-muted">
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="(min-width: 640px) 7rem, 25vw"
              src={phone.url}
            />
          </div>
          <span className="text-xs text-muted-foreground">{labels.phone}</span>
        </div>
      </div>
    </figure>
  );
}

/**
 * A banner's form in the home screen's side sheet (FER-020): its photo for
 * a computer and for a phone, uploaded through `ImageUploader` (FER-011,
 * purpose `banner`) with how each screen crops it; its title and button in
 * both languages; where it leads (nowhere, an article, a category or an
 * address); the switch and its days; and its place: the cover, or between
 * two rows after the one chosen. A phone photo needs a computer one, so
 * removing the computer photo removes both. Save waits while a photo is on
 * its way. A failure keeps everything typed and says why: a full cover,
 * or anything else.
 */
function BannerForm({
  articles,
  banner,
  categories,
  onCancel,
  onSave,
  rows,
  rowsIndex,
}: BannerFormProps) {
  const { admin } = useDictionary();
  const copy = admin.home.bannerForm;
  const fields = copy.fields;
  const formId = useId();
  const [failure, setFailure] = useState<Exclude<
    BannerFormOutcome,
    "saved"
  > | null>(null);
  const [uploading, setUploading] = useState({ image: false, phone: false });
  const waiting = uploading.image || uploading.phone;
  const form = useForm<BannerFormFields, unknown, BannerFormValues>({
    defaultValues: fieldsOf(
      banner,
      Math.min(rowsIndex ?? DEFAULT_ROWS_INDEX, rows.length)
    ),
    resolver: zodResolver(createBannerFormSchema(copy.errors)),
  });
  const { isSubmitting } = useFormState({ control: form.control });
  const image = useWatch({ control: form.control, name: "image" });
  const imagePhone = useWatch({ control: form.control, name: "imagePhone" });
  const linkKind = useWatch({ control: form.control, name: "linkKind" });
  const placement = useWatch({ control: form.control, name: "placement" });

  const submit = async (values: BannerFormValues) => {
    setFailure(null);
    const outcome = await onSave(values);
    setFailure(outcome === "saved" ? null : outcome);
  };

  return (
    <Form {...form}>
      <form
        aria-label={banner ? copy.editTitle : copy.createTitle}
        className="flex min-h-0 flex-1 flex-col"
        data-slot="banner-form"
        data-testid="banner-form"
        id={formId}
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit(submit)(event);
        }}
      >
        <SheetBody>
          <fieldset
            className="flex min-w-0 flex-col gap-5"
            disabled={isSubmitting}
          >
            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormControl>
                    <ImageUploader
                      description={fields.imageHint}
                      label={fields.image}
                      onBusyChange={(busy) => {
                        setUploading((was) => ({ ...was, image: busy }));
                      }}
                      onChange={(uploaded) => {
                        field.onChange(uploaded);

                        if (uploaded === null) {
                          form.setValue("imagePhone", null);
                        }
                      }}
                      purpose="banner"
                      sizes="(min-width: 640px) 24rem, 100vw"
                      value={field.value}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="imagePhone"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormControl>
                    <ImageUploader
                      description={
                        image
                          ? fields.imagePhoneHint
                          : fields.imagePhoneNeedsComputer
                      }
                      disabled={!image}
                      label={fields.imagePhone}
                      onBusyChange={(busy) => {
                        setUploading((was) => ({ ...was, phone: busy }));
                      }}
                      onChange={(uploaded) => {
                        // One that lands after the computer photo was
                        // removed is dropped: the shut field could not.
                        if (
                          uploaded !== null &&
                          form.getValues("image") === null
                        ) {
                          return;
                        }

                        field.onChange(uploaded);
                      }}
                      purpose="banner"
                      sizes="(min-width: 640px) 24rem, 100vw"
                      value={field.value}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {image ? (
              <CropPreview
                image={image}
                imagePhone={imagePhone}
                labels={{
                  computer: fields.cropComputer,
                  hint: fields.cropHint,
                  phone: fields.cropPhone,
                  title: fields.cropTitle,
                }}
              />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["titleEs", "es"],
                  ["titleEn", "en"],
                  ["ctaLabelEs", "es"],
                  ["ctaLabelEn", "en"],
                ] as const
              ).map(([name, lang]) => (
                <FormField
                  control={form.control}
                  key={name}
                  name={name}
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel required={name === "titleEs"}>
                        {fields[name]}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          autoComplete="off"
                          lang={lang}
                          required={name === "titleEs"}
                        />
                      </FormControl>
                      {name.startsWith("cta") ? (
                        <FormDescription>{fields.ctaHint}</FormDescription>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <FormField
              control={form.control}
              name="linkKind"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel>{fields.linkKind}</FormLabel>
                  <FormControl>
                    <select {...field} className={SELECT_CLASS}>
                      {BANNER_LINK_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {fields.linkKinds[kind]}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {linkKind === "product" || linkKind === "category" ? (
              <FormField
                control={form.control}
                name={
                  linkKind === "product" ? "linkProductId" : "linkCategoryId"
                }
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel required>
                      {linkKind === "product"
                        ? fields.linkProductId
                        : fields.linkCategoryId}
                    </FormLabel>
                    <FormControl>
                      <select {...field} className={SELECT_CLASS} required>
                        <option value="">{fields.choose}</option>
                        {(linkKind === "product" ? articles : categories).map(
                          (choice) => (
                            <option key={choice.id} value={String(choice.id)}>
                              {choice.label}
                            </option>
                          )
                        )}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {linkKind === "url" ? (
              <FormField
                control={form.control}
                name="linkUrl"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel required>{fields.linkUrl}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        autoComplete="off"
                        inputMode="url"
                        required
                      />
                    </FormControl>
                    <FormDescription>{fields.linkUrlHint}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name="isActive"
              render={({ field: { onChange, value, ...field } }) => (
                <FormItem className="min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
                  <FormControl>
                    <input
                      {...field}
                      checked={value}
                      className="size-5 accent-primary"
                      onChange={(event) => {
                        onChange(event.currentTarget.checked);
                      }}
                      type="checkbox"
                    />
                  </FormControl>
                  {/* 44 px to tap on a phone: the label is the target. */}
                  <FormLabel className="min-h-11 md:min-h-9">
                    {fields.isActive}
                  </FormLabel>
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {(["startsOn", "endsOn"] as const).map((name) => (
                <FormField
                  control={form.control}
                  key={name}
                  name={name}
                  render={({ field }) => (
                    <FormItem className="min-w-0">
                      <FormLabel>{fields[name]}</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {fields.daysHint}
              </p>
            </div>
            <FormField
              control={form.control}
              name="placement"
              render={({ field }) => (
                <FormItem className="min-w-0">
                  <FormLabel>{fields.placement}</FormLabel>
                  <FormControl>
                    <select {...field} className={SELECT_CLASS}>
                      {BANNER_PLACEMENTS.map((place) => (
                        <option key={place} value={place}>
                          {fields.placements[place]}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {placement === "rows" ? (
              <FormField
                control={form.control}
                name="rowsIndex"
                render={({ field }) => (
                  <FormItem className="min-w-0">
                    <FormLabel>{fields.rowsIndex}</FormLabel>
                    <FormControl>
                      <select {...field} className={SELECT_CLASS}>
                        <option value="0">{fields.rowsFirst}</option>
                        {rows.map((row, index) => (
                          <option
                            // A row's name can repeat (two categories
                            // named alike); its place cannot.
                            key={`${String(index)}:${row}`}
                            value={String(index + 1)}
                          >
                            {row}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            {failure ? (
              <p className="text-sm text-destructive" role="alert">
                {failure === "coverFull"
                  ? interpolate(copy.errors.coverFull, {
                      max: String(COVER_BANNERS_MAX),
                    })
                  : copy.errors.save}
              </p>
            ) : null}
          </fieldset>
        </SheetBody>
        <SheetFooter className="flex flex-wrap gap-2">
          <Button
            data-testid="banner-form-submit"
            disabled={isSubmitting || waiting}
            type="submit"
          >
            {isSubmitting ? copy.pending : copy.submit}
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={() => {
              onCancel();
            }}
            type="button"
            variant="ghost"
          >
            {copy.cancel}
          </Button>
          {waiting ? (
            <p className="basis-full text-xs text-muted-foreground">
              {copy.waitUpload}
            </p>
          ) : null}
        </SheetFooter>
      </form>
    </Form>
  );
}

export { BannerForm };
