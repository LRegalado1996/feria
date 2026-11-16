import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

import { isLocale } from "@/lib/i18n/config";
import { readLocale } from "@/lib/i18n/read-locale";
import { ownUrl } from "@/lib/seo/origin";
import { formatPrice } from "@/lib/utils/format";
import { readPublishedArticle } from "@/server/cache/catalog";
import { getStoreForPath } from "@/server/cache/store";

const size = { height: 630, width: 1200 };
const contentType = "image/png";

interface ArticleImageProps {
  params: Promise<{ locale: string; slug: string; store: string }>;
}

/** The card's alternative text: the article's name. */
export async function generateImageMetadata({
  params,
}: {
  params: { locale: string; slug: string; store: string };
}) {
  const store = await getStoreForPath(params.store);
  const article =
    store && isLocale(params.locale)
      ? await readPublishedArticle(store, params.slug, params.locale)
      : null;

  return [{ alt: article?.title ?? "", contentType, id: "card", size }];
}

/**
 * An article's share card (FER-024): its first photo beside its name and
 * price, in the store's colors, so a link pasted into WhatsApp shows what
 * is for sale and for how much. The colors are the store's columns,
 * checked as hex colors when they were saved.
 */
export default async function ArticleOpenGraphImage({
  params,
}: ArticleImageProps) {
  const locale = await readLocale(params);
  const { slug, store: segment } = await params;
  const store = await getStoreForPath(segment);
  const article = store
    ? await readPublishedArticle(store, slug, locale)
    : null;

  if (!(store && article)) {
    notFound();
  }

  const [photo] = article.images;
  // Only a photo on this site: the renderer fetches it from the server.
  const photoUrl = photo ? ownUrl(photo.url) : null;

  return new ImageResponse(
    <div
      style={{
        background: store.colorBackground,
        color: store.colorForeground,
        display: "flex",
        height: "100%",
        width: "100%",
      }}
    >
      {/* The photo as the block's background: the PNG renderer draws it
          by address and covers the block with it. */}
      <div
        style={{
          background: store.colorContrast,
          backgroundImage: photoUrl ? `url("${photoUrl}")` : undefined,
          backgroundPosition: "center",
          backgroundSize: "cover",
          display: "flex",
          height: 630,
          width: 504,
        }}
      />
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 56,
        }}
      >
        <div style={{ display: "flex", fontSize: 32, marginBottom: 24 }}>
          {store.name}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.05,
          }}
        >
          {article.title.toLocaleUpperCase(locale)}
        </div>
        <div
          style={{
            alignSelf: "flex-start",
            background: store.colorContrast,
            color: store.colorBackground,
            display: "flex",
            fontSize: 48,
            fontWeight: 700,
            marginTop: 32,
            padding: "8px 20px",
          }}
        >
          {formatPrice(article.priceAmount, article.currencyCode, locale)}
        </div>
      </div>
    </div>,
    size
  );
}
