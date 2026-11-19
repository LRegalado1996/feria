import { StoreSharePreview } from "@/app/_components/molecules/store-share-preview";
import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { PRICE_MINOR_UNITS } from "@/lib/schemas/catalog";
import { articleSearchTexts } from "@/lib/seo/article-metadata";
import { cn } from "@/lib/utils";
import { type Currency, formatPrice } from "@/lib/utils/format";

export interface ProductSeoPreviewProps {
  className?: string;
  copy: Dictionary["articles"]["wizard"]["details"]["seo"];
  currency: Currency;
  /** The article's description, as typed. */
  description: string;
  /** This site's host, as a search result writes it. */
  host: string;
  /** The language the texts are written in. */
  lang: string;
  locale: Locale;
  /** The address of the article's main photo, or `null` while it has none. */
  mainPhotoUrl: string | null;
  /** The price in whole units, as the form holds it, or `null`. */
  price: number | null;
  /** The article's address segment, once it has one. */
  slug: string | null;
  store: { name: string; tagline: string | undefined };
  /** The article's title, as typed. */
  title: string;
}

/**
 * How the article will look outside the store (FER-017): as a Google result
 * (the store's name, the address, the title and the description, cut where
 * a result cuts them) and as the card a chat draws for its link. Nothing to
 * fill in: both come from the title, the description and the main photo,
 * read through the same `articleSearchTexts` the article's page writes its
 * metadata with, so the preview says what the page will say.
 */
function ProductSeoPreview({
  className,
  copy,
  currency,
  description,
  host,
  lang,
  locale,
  mainPhotoUrl,
  price,
  slug,
  store,
  title,
}: ProductSeoPreviewProps) {
  // An untitled draft shows an ellipsis where its title will go.
  const search = articleSearchTexts(
    { description: description.trim(), title: title.trim() || "…" },
    store
  );
  // The card's renderer fetches only a photo on this site (`ownUrl()`).
  const sharePhotoUrl = mainPhotoUrl?.startsWith("/") ? mainPhotoUrl : null;

  return (
    <div
      className={cn("grid gap-4", className)}
      data-slot="product-seo-preview"
      data-testid="product-seo-preview"
    >
      <p className="text-xs text-muted-foreground">{copy.hint}</p>
      <figure className="grid min-w-0 content-start gap-2">
        <figcaption className="text-xs text-muted-foreground">
          {copy.google}
        </figcaption>
        <div
          className="grid min-w-0 gap-0.5 rounded-lg border bg-background p-3"
          data-testid="product-seo-preview-google"
          // The result is in the texts' language, its caption the admin's.
          lang={lang}
        >
          <p className="truncate text-xs">{store.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {`${host} › productos › ${slug ?? "…"}`}
          </p>
          <p className="mt-1 line-clamp-1 text-base font-medium text-blue-800 dark:text-blue-300">
            {search.pageTitle}
          </p>
          {search.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {search.description}
            </p>
          ) : null}
        </div>
      </figure>
      <figure className="grid min-w-0 content-start gap-2">
        <figcaption className="text-xs text-muted-foreground">
          {copy.share}
        </figcaption>
        <StoreSharePreview
          photoUrl={sharePhotoUrl}
          price={
            price === null
              ? null
              : formatPrice(
                  Math.round(price * PRICE_MINOR_UNITS),
                  currency,
                  locale
                )
          }
          storeName={store.name}
          title={search.title}
        />
        {mainPhotoUrl !== null && sharePhotoUrl === null ? (
          <p className="text-xs text-muted-foreground">{copy.shareNoPhoto}</p>
        ) : null}
      </figure>
    </div>
  );
}

export { ProductSeoPreview };
