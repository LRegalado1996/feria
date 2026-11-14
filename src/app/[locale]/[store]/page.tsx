import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StoreEyebrow } from "@/app/_components/atoms/store-eyebrow";
import { StoreHeading } from "@/app/_components/atoms/store-heading";
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

const CONTAINER_CLASS = "mx-auto flex w-full max-w-7xl flex-col gap-6 px-4";

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

  const translation = pickTranslation(store.translations, locale);

  return (
    <main
      className="flex flex-col"
      data-slot="store-home"
      data-testid="store-home"
    >
      <header
        className="bg-store-contrast py-12 md:py-20"
        data-testid="store-header"
      >
        <div className={CONTAINER_CLASS}>
          {translation ? (
            // `lang`: a store that has no text in this language shows the one
            // it has, and a screen reader must pronounce it as what it is.
            <StoreEyebrow lang={translation.locale} tone="contrast">
              {translation.tagline}
            </StoreEyebrow>
          ) : null}
          <StoreHeading
            accentLine={0}
            as="h1"
            // A long name wraps inside a narrow phone instead of widening it.
            className="wrap-anywhere"
            lines={[store.name]}
            size="hero"
          />
        </div>
      </header>

      {translation ? (
        <section className={`${CONTAINER_CLASS} py-12`}>
          <p
            className="max-w-prose bg-store-surface p-6 text-base md:p-10"
            data-testid="store-description"
            lang={translation.locale}
          >
            {translation.description}
          </p>
        </section>
      ) : null}
    </main>
  );
}
