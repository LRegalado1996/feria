import { MessageCircle } from "lucide-react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { StoreArticleBand } from "@/app/_components/molecules/store-article-band";
import {
  STORE_CARD_SIZES,
  StoreArticleCard,
} from "@/app/_components/molecules/store-article-card";
import { StoreArticleMain } from "@/app/_components/molecules/store-article-main";
import { StoreArticlePurchase } from "@/app/_components/molecules/store-article-purchase";
import type { StoreGalleryImage } from "@/app/_components/molecules/store-gallery";
import { StoreRelatedRow } from "@/app/_components/molecules/store-related-row";
import { StoreShareButton } from "@/app/_components/molecules/store-share-button";
import type { Dictionary } from "@/content";
import { ALL_ARTICLES_PATH, articlePath } from "@/lib/catalog/paths";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import type { Currency } from "@/lib/utils/format";

/** An article as its page shows it. */
export interface StoreArticleData {
  /** Its category, under its group when it has one (FER-043). */
  category: {
    group: { name: string; path: string } | null;
    name: string;
    path: string;
    slug: string;
  } | null;
  currencyCode: Currency;
  description: string;
  id: number;
  images: StoreGalleryImage[];
  isAvailable: boolean;
  /** The language its texts are in (Spanish when it has no English). */
  lang: string;
  priceAmount: number;
  slug: string;
  title: string;
}

/** An article beside it, as a card shows it. */
export interface StoreRelatedArticle {
  cover: { alt: string; url: string } | null;
  currencyCode: Currency;
  id: number;
  isAvailable: boolean;
  lang: string;
  priceAmount: number;
  slug: string;
  title: string;
}

export interface StoreArticleProps {
  article: StoreArticleData;
  copy: Dictionary["storefront"];
  locale: Locale;
  /**
   * What "También te puede gustar" picks from: the article's category, and
   * the rest of the store when the category is small (FER-039).
   */
  related: {
    others: readonly StoreRelatedArticle[];
    same: readonly StoreRelatedArticle[];
  };
  /** The article's whole address in the page's language, to share. */
  shareUrl: string;
  /** The store's chat with the article pre-written, when it has WhatsApp. */
  whatsappHref: string | null;
}

/**
 * An article's page (FER-024, FER-039). On a computer its name, price,
 * description, quantity and "Agregar al carrito" sit in a column on the
 * left while its photos scroll sideways on the right; on a phone the photos
 * come first; "Compartir" (FER-019) is a small circle on the photos, beside
 * the magnifier. Then a question by WhatsApp, a festive moss band, and the
 * articles beside it in a row. All of it is in the server's HTML, so a
 * search engine or an assistant reads it without running the script.
 */
function StoreArticle({
  article,
  copy,
  locale,
  related,
  shareUrl,
  whatsappHref,
}: StoreArticleProps) {
  const catalog = localizePath(ALL_ARTICLES_PATH, locale);
  const inCategory = article.category
    ? localizePath(article.category.path, locale)
    : null;
  const labels = { card: copy.articleCard, price: copy.price };
  const relatedCard = (item: StoreRelatedArticle) => ({
    content: (
      <StoreArticleCard
        amount={item.priceAmount}
        currency={item.currencyCode}
        headingLevel="h3"
        href={localizePath(articlePath(item.slug), locale)}
        image={item.cover ? { alt: item.cover.alt, src: item.cover.url } : null}
        labels={labels}
        locale={locale}
        name={item.title}
        nameLang={item.lang}
        // The browser may swap the cards once it draws its own pick: two
        // lines each keep the row's height.
        nameLines="two"
        sizes={STORE_CARD_SIZES.row}
        unavailable={!item.isAvailable}
      />
    ),
    id: String(item.id),
  });

  return (
    <div
      className="flex flex-col text-store-foreground"
      data-slot="store-article"
      data-testid="store-article"
    >
      <StoreArticleMain
        article={article}
        copy={copy}
        galleryActions={
          <StoreShareButton title={article.title} url={shareUrl} />
        }
        locale={locale}
      >
        {article.isAvailable ? (
          <StoreArticlePurchase
            className="mt-6"
            priceAmount={article.priceAmount}
            productId={article.id}
            title={article.title}
          />
        ) : (
          <p className="mt-6.5 text-base">{copy.article.unavailableBody}</p>
        )}
        {whatsappHref ? (
          <StoreButton asChild className="mt-5 self-start" variant="outline">
            <a
              data-testid="store-article-whatsapp"
              href={whatsappHref}
              rel="noopener noreferrer"
              target="_blank"
            >
              <MessageCircle aria-hidden="true" />
              {copy.article.askWhatsapp}
              <span className="sr-only"> {copy.shell.newTab}</span>
            </a>
          </StoreButton>
        ) : null}
      </StoreArticleMain>
      <StoreArticleBand
        greeting={copy.article.bandGreeting}
        pauseLabel={copy.article.bandPause}
      />
      <StoreRelatedRow
        others={related.others.map(relatedCard)}
        same={related.same.map(relatedCard)}
        title={copy.article.related}
        viewAllHref={inCategory ?? catalog}
      />
    </div>
  );
}

export { StoreArticle };
