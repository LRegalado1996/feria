import type { Viewport } from "next";
import type { ReactNode } from "react";

import {
  STORE_MAIN_ID,
  StoreHeader,
} from "@/app/_components/organisms/store-header";
import { StoreTheme } from "@/app/_components/organisms/store-theme";
import { getDictionary } from "@/content";
import { readLocale } from "@/lib/i18n/read-locale";
import { STORE_THEME } from "@/styles/theme";

interface StoreLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

/** The browser's bar takes the store's background, as its pages do. */
export const viewport: Viewport = { themeColor: STORE_THEME.background };

/**
 * Every page of the store (FER-021, FER-038: the site is one store), in its
 * colors, under its header. Chrome only: it decides nothing about who may see
 * what, and it reads nothing from the database, so it is prerendered with
 * the build. Each page renders the footer from the store it reads
 * (`store-page-footer.tsx`), and the titles that carry the store's name.
 */
export default async function StoreLayout({
  children,
  params,
}: StoreLayoutProps) {
  const locale = await readLocale(params);

  return (
    <StoreTheme className="flex min-h-dvh flex-col" data-testid="store-theme">
      <StoreHeader
        copy={getDictionary(locale).storefront.shell}
        locale={locale}
      />
      {/* Its top clears the sticky header when the skip link scrolls to it. */}
      <div
        className="flex flex-1 scroll-mt-16 flex-col"
        data-testid="store-main"
        id={STORE_MAIN_ID}
        tabIndex={-1}
      >
        {children}
      </div>
    </StoreTheme>
  );
}
