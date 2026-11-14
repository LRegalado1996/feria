import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StoreIntro } from "@/app/_components/organisms/store-intro";
import { buildAlternates } from "@/lib/i18n/metadata";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { readLocale } from "@/lib/i18n/read-locale";
import { getStoreForPath } from "@/server/cache/store";

interface StoreHomeProps {
  params: Promise<{ locale: string; store: string }>;
}

// The whole page is static output, made on an address's first visit and kept:
// that first request waits for it instead of getting a shell that streams, so
// the store lookup runs before the status is sent and an unknown address is
// a real 404 (docs/agents/nextjs.md § Store pages).
export const ensureStatic = "navigation";

export async function generateMetadata({
  params,
}: StoreHomeProps): Promise<Metadata> {
  const locale = await readLocale(params);
  const { store: segment } = await params;
  const store = await getStoreForPath(segment);

  // The page answers 404; the not-found page brings its own title.
  if (!store) {
    return {};
  }

  return {
    alternates: buildAlternates(`/${store.slug}`, locale),
    description: pickTranslation(store.translations, locale)?.description,
    title: store.name,
  };
}

/**
 * A store's home. For now it introduces the store in its own colors: its
 * name, and its tagline and description in the language of the URL. The
 * shell around it and the home's real sections are FER-021 and FER-022.
 */
export default async function StoreHome({ params }: StoreHomeProps) {
  const locale = await readLocale(params);
  const { store: segment } = await params;
  const store = await getStoreForPath(segment);

  if (!store) {
    notFound();
  }

  return (
    <main data-slot="store-home" data-testid="store-home">
      <StoreIntro
        name={store.name}
        text={pickTranslation(store.translations, locale)}
      />
    </main>
  );
}
