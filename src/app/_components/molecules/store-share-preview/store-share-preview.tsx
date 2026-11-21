import { cn } from "@/lib/utils";

export interface StoreSharePreviewProps {
  className?: string;
  /**
   * The photo the card draws, or `null`: the card's renderer fetches only a
   * photo on this site (`ownUrl()`), and shows the moss block otherwise.
   */
  photoUrl: string | null;
  /** The price as the card writes it, or `null` while there is none. */
  price: string | null;
  storeName: string;
  title: string;
}

/**
 * An article's share card as a chat shows the link (FER-017's preview of
 * the card FER-024 draws, `productos/[slug]/opengraph-image.tsx`): its photo
 * beside the store's name, the article's name in capitals and the price on
 * the moss, in the store's colors, at the card's own proportions. A
 * picture: it says nothing a screen reader needs that the fields above it
 * do not.
 */
function StoreSharePreview({
  className,
  photoUrl,
  price,
  storeName,
  title,
}: StoreSharePreviewProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex aspect-[1200/630] w-full max-w-md overflow-hidden border border-store-line bg-store-background text-store-foreground",
        className
      )}
      data-slot="store-share-preview"
      data-testid="store-share-preview"
    >
      <div
        className="h-full w-[42%] shrink-0 bg-store-contrast bg-cover bg-center"
        data-testid="store-share-preview-photo"
        style={photoUrl ? { backgroundImage: `url("${photoUrl}")` } : undefined}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-end gap-1.5 p-3">
        <p className="truncate text-xs">{storeName}</p>
        <p className="line-clamp-3 text-sm leading-tight font-bold wrap-anywhere uppercase">
          {title}
        </p>
        {price ? (
          <p className="self-start bg-store-contrast px-1.5 py-0.5 text-xs font-bold text-store-background tabular-nums">
            {price}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export { StoreSharePreview };
