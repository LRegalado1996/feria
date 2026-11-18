import { StoreSharePreview } from "@/app/_components/molecules/store-share-preview";
import type { Dictionary } from "@/content";
import { cn } from "@/lib/utils";

export interface ProductSeoPreviewProps {
  className?: string;
  copy: Dictionary["articles"]["wizard"]["details"]["seo"];
  /** What the search result shows under the title, or nothing. */
  description: string | undefined;
  /** The address as a search result writes it: the host and the path. */
  displayUrl: string;
  /** The page's title as the tab and the result show it, store included. */
  pageTitle: string;
  /** The share card's photo: one on this site only, as the card draws. */
  sharePhotoUrl: string | null;
  /** The article has a main photo the share card cannot draw. */
  sharePhotoLeftOut: boolean;
  sharePrice: string | null;
  shareTitle: string;
  storeName: string;
}

/**
 * How the article will look outside the store (FER-017): as a Google result
 * (the store's name, the address, the title and the description, cut where
 * a result cuts them) and as the card a chat draws for its link. Fed the
 * same texts the article's page writes into its metadata
 * (`articleSearchTexts`), so an empty field shows the default the page
 * really uses.
 */
function ProductSeoPreview({
  className,
  copy,
  description,
  displayUrl,
  pageTitle,
  sharePhotoLeftOut,
  sharePhotoUrl,
  sharePrice,
  shareTitle,
  storeName,
}: ProductSeoPreviewProps) {
  return (
    <div
      className={cn("grid gap-4 md:grid-cols-2", className)}
      data-slot="product-seo-preview"
    >
      <figure className="grid min-w-0 content-start gap-2">
        <figcaption className="text-xs text-muted-foreground">
          {copy.google}
        </figcaption>
        <div
          className="grid min-w-0 gap-0.5 rounded-lg border bg-background p-3"
          data-testid="product-seo-preview-google"
        >
          <p className="truncate text-xs">{storeName}</p>
          <p className="truncate text-xs text-muted-foreground">{displayUrl}</p>
          <p className="mt-1 line-clamp-1 text-base font-medium text-blue-800 dark:text-blue-300">
            {pageTitle}
          </p>
          {description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {description}
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
          price={sharePrice}
          storeName={storeName}
          title={shareTitle}
        />
        {sharePhotoLeftOut ? (
          <p className="text-xs text-muted-foreground">{copy.shareNoPhoto}</p>
        ) : null}
      </figure>
    </div>
  );
}

export { ProductSeoPreview };
