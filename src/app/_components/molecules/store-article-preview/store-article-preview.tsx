import { StoreArticleCard } from "@/app/_components/molecules/store-article-card";
import {
  StoreArticleMain,
  type StoreArticleMainData,
} from "@/app/_components/molecules/store-article-main";
import { StoreArticlePurchase } from "@/app/_components/molecules/store-article-purchase";
import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export interface StoreArticlePreviewProps {
  article: StoreArticleMainData;
  className?: string;
  copy: Dictionary["storefront"];
  /** Where the card would lead: the article's page, built by the caller. */
  href: string;
  locale: Locale;
  /** The article's card in a grid, or the top of its page. */
  view: "card" | "page";
}

/**
 * An article as the storefront will show it (FER-017's review), drawn by
 * the storefront's own components on the store's white page: its card, the
 * main photo cropped square on the grey tile (where a cut-out photo sits),
 * or the top of its page. A picture, not a page: nothing in it can be
 * focused or followed (`inert`), so the wizard's own controls are the only
 * ones, and what it says is said by the wizard in words.
 */
function StoreArticlePreview({
  article,
  className,
  copy,
  href,
  locale,
  view,
}: StoreArticlePreviewProps) {
  const [cover] = article.images;

  if (view === "card") {
    return (
      <div
        className={cn(
          "w-full max-w-64 bg-store-background p-3 text-store-foreground",
          className
        )}
        data-slot="store-article-preview"
        data-testid="store-article-preview-card"
        inert
      >
        <StoreArticleCard
          amount={article.priceAmount}
          currency={article.currencyCode}
          headingLevel="h3"
          href={href}
          image={cover ? { alt: cover.alt, src: cover.url } : null}
          labels={{ card: copy.articleCard, price: copy.price }}
          locale={locale}
          name={article.title}
          nameLang={article.lang}
          sizes="16rem"
          unavailable={!article.isAvailable}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden bg-store-background text-store-foreground",
        className
      )}
      data-slot="store-article-preview"
      data-testid="store-article-preview-page"
      inert
    >
      <StoreArticleMain article={article} copy={copy} locale={locale}>
        {article.isAvailable ? (
          <StoreArticlePurchase
            className="mt-6"
            priceAmount={article.priceAmount}
            // Nothing can be added from a picture: no article answers 0.
            productId={0}
            title={article.title}
          />
        ) : (
          <p className="mt-6.5 text-base">{copy.article.unavailableBody}</p>
        )}
      </StoreArticleMain>
    </div>
  );
}

export { StoreArticlePreview };
