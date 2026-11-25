import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

import { isLocale, type Locale } from "@/lib/i18n/config";
import { readLocale } from "@/lib/i18n/read-locale";
import { captureExceptionWithScope } from "@/lib/sentry";
import { cardJpeg } from "@/lib/seo/card-jpeg";
import { siteOrigin } from "@/lib/seo/origin";
import { formatPrice } from "@/lib/utils/format";
import { readPublishedArticle } from "@/server/cache/catalog";
import { readSharePhoto } from "@/server/cache/share-photo";
import { readStore } from "@/server/cache/store";
import { STORE_THEME } from "@/styles/theme";

import { couldBeArticle } from "./article-address";

const size = { height: 630, width: 1200 };
// A JPEG: the renderer's PNG is too heavy for WhatsApp (`cardJpeg`).
const contentType = "image/jpeg";

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

/** What a card shows, as plain words: the cached drawing's key. */
interface CardWords {
  /** The store's name. */
  name: string;
  /** This site's origin, for a photo stored on it. */
  origin: string;
  /** The first photo's address, or `null` for the plain block. */
  photo: string | null;
  price: string;
  /** The article's name, already in capitals. */
  title: string;
}

/**
 * The card's bytes, cached by what it shows. Drawing, fetching the photo
 * and encoding are all work no request should wait for twice, and work a
 * static route may only do inside a cached function (FER-049: outside one
 * the card answered 500 in production). The photo comes through its own
 * cached read (`readSharePhoto`); the renderer's PNG becomes a JPEG
 * (`cardJpeg`), and stays the PNG, reported, if that ever fails, so a link
 * still has its card.
 */
async function drawCard(card: CardWords) {
  "use cache";
  cacheLife("hours");

  // A photo on this site, or one of this deployment's Blob store, fetched
  // within a time limit; anything else, the plain block.
  const photoUrl = card.photo
    ? await readSharePhoto(card.photo, card.origin)
    : null;
  const drawn = new ImageResponse(
    <div
      style={{
        background: STORE_THEME.background,
        color: STORE_THEME.foreground,
        display: "flex",
        height: "100%",
        width: "100%",
      }}
    >
      {/* The photo as the block's background: the renderer draws it by
          address and covers the block with it. Without one the key is
          left out: the renderer fails on a background image of
          `undefined`, and the whole card with it. */}
      <div
        style={{
          background: STORE_THEME.contrast,
          ...(photoUrl ? { backgroundImage: `url("${photoUrl}")` } : {}),
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
          {card.name}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.05,
          }}
        >
          {card.title}
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
          {card.price}
        </div>
      </div>
    </div>,
    size
  );
  const png = await drawn.arrayBuffer();
  const cacheControl = drawn.headers.get("cache-control");

  try {
    const jpeg = await cardJpeg(png, STORE_THEME.background);

    return { base64: jpeg.toString("base64"), cacheControl, type: contentType };
  } catch (error) {
    captureExceptionWithScope(error, { action: "ShareCard.encode_jpeg" });

    return {
      base64: Buffer.from(png).toString("base64"),
      cacheControl,
      type: "image/png",
    };
  }
}

/**
 * An article's share card (FER-024, FER-049): its first photo beside its
 * name and price, in the store's colors (the theme file, FER-038), so a link pasted
 * into WhatsApp shows what is for sale and for how much. A JPEG of about
 * 60 KB: WhatsApp shows no image for the 800 KB the same card weighs as PNG.
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
  const card = await drawCard({
    name: store.name,
    origin: siteOrigin(),
    photo: photo?.url ?? null,
    price: formatPrice(article.priceAmount, article.currencyCode, locale),
    title: article.title.toLocaleUpperCase(locale),
  });

  return new Response(Buffer.from(card.base64, "base64"), {
    headers: {
      "content-type": card.type,
      ...(card.cacheControl ? { "cache-control": card.cacheControl } : {}),
    },
  });
}
