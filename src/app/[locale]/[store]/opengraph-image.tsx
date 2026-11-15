import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

import { pickTranslation } from "@/lib/i18n/pick-translation";
import { readLocale } from "@/lib/i18n/read-locale";
import { getStoreForPath } from "@/server/cache/store";

export const size = { height: 630, width: 1200 };
export const contentType = "image/png";
export const alt = "";

interface StoreImageProps {
  params: Promise<{ locale: string; store: string }>;
}

/**
 * A store's share card (FER-021): its name and tagline in its own colors,
 * what WhatsApp and Instagram show beside a link to any of its pages that
 * does not bring an image of its own. The colors are the store's columns,
 * checked as hex colors when they were saved.
 */
export default async function StoreOpenGraphImage({ params }: StoreImageProps) {
  const locale = await readLocale(params);
  const { store: segment } = await params;
  const store = await getStoreForPath(segment);

  if (!store) {
    notFound();
  }

  const tagline = pickTranslation(store.translations, locale)?.tagline;

  return new ImageResponse(
    <div
      style={{
        background: store.colorBackground,
        color: store.colorForeground,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "flex-end",
        padding: 72,
        width: "100%",
      }}
    >
      <div
        style={{
          background: store.colorAccent,
          display: "flex",
          height: 24,
          marginBottom: 48,
          width: 160,
        }}
      />
      <div
        style={{
          display: "flex",
          fontSize: 112,
          fontWeight: 700,
          letterSpacing: -2,
          lineHeight: 1,
        }}
      >
        {store.name.toLocaleUpperCase(locale)}
      </div>
      {tagline ? (
        <div style={{ display: "flex", fontSize: 40, marginTop: 24 }}>
          {tagline}
        </div>
      ) : null}
    </div>,
    size
  );
}
