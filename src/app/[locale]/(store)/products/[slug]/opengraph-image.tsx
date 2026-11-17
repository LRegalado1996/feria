import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

import { isLocale, type Locale } from "@/lib/i18n/config";
import { readLocale } from "@/lib/i18n/read-locale";
import { ownUrl } from "@/lib/seo/origin";
import { formatPrice } from "@/lib/utils/format";
import { readPublishedArticle } from "@/server/cache/catalog";
import { readStore } from "@/server/cache/store";
import { STORE_THEME } from "@/styles/theme";

import { couldBeArticle } from "./article-address";

const size = { height: 630, width: 1200 };
const contentType = "image/png";

interface ArticleImageProps {
  params: Promise<{ locale: string; slug: string }>;
}

/**
 * The store and the article at `slug`, or `null`. An address no article can
 * have (the build's sample) stops before the store is read: the build has no
 * database.
 */
async function load(locale: Locale, slug: string) {
  if (!couldBeArticle(slug)) {
    return null;
  }

  const store = await readStore();
  const article = store
    ? await readPublishedArticle(store, slug, locale)
    : null;

  return store && article ? { article, store } : null;
}

/** The card's alternative text: the article's name. */
export async function generateImageMetadata({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  const found = isLocale(params.locale)
    ? await load(params.locale, params.slug)
    : null;

  return [{ alt: found?.article.title ?? "", contentType, id: "card", size }];
}

/**
 * An article's share card (FER-024): its first photo beside its name and
 * price, in the store's colors (the theme file, FER-038), so a link pasted
 * into WhatsApp shows what is for sale and for how much.
 */
export default async function ArticleOpenGraphImage({
  params,
}: ArticleImageProps) {
  const locale = await readLocale(params);
  const { slug } = await params;
  const found = await load(locale, slug);

  if (!found) {
    notFound();
  }

  const { article, store } = found;

  const [photo] = article.images;
  // Only a photo on this site: the renderer fetches it from the server.
  const photoUrl = photo ? ownUrl(photo.url) : null;

  return new ImageResponse(
    <div
      style={{
        background: STORE_THEME.background,
        color: STORE_THEME.foreground,
        display: "flex",
        height: "100%",
        width: "100%",
      }}
    >
      {/* The photo as the block's background: the PNG renderer draws it
          by address and covers the block with it. */}
      <div
        style={{
          background: STORE_THEME.contrast,
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
            background: STORE_THEME.contrast,
            color: STORE_THEME.background,
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
