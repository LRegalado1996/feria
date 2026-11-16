import Image from "next/image";
import Link from "next/link";

import { StoreCartButton } from "@/app/_components/molecules/store-cart-button";
import { StoreLocaleToggle } from "@/app/_components/molecules/store-locale-toggle";
import { StoreMobileMenu } from "@/app/_components/molecules/store-mobile-menu";
import { StoreSearchForm } from "@/app/_components/molecules/store-search-form";
import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

/** Where the page's main content starts, for the skip link. */
export const STORE_MAIN_ID = "store-main";

export interface StoreHeaderProps {
  className?: string;
  copy: Dictionary["storefront"]["shell"];
  locale: Locale;
  store: { logoUrl: string | null; name: string; slug: string };
}

const NAV_LINK_CLASS =
  "inline-flex min-h-11 items-center text-sm font-semibold text-store-foreground underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground";

/**
 * Every page of a store starts here (FER-021): its logo (or its name), the
 * home and the catalog, the search, the language and the cart. Sticky. On a
 * phone the links, the search and the language move into a full-screen
 * menu. Rendered by the server; only the menu, the language link and the
 * cart's count hydrate.
 */
function StoreHeader({ className, copy, locale, store }: StoreHeaderProps) {
  const home = localizePath(`/${store.slug}`, locale);
  const catalog = localizePath(`/${store.slug}/products`, locale);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b-2 border-store-contrast bg-store-background",
        className
      )}
      data-slot="store-header"
      data-testid="store-header"
    >
      <a
        className="sr-only bg-store-accent px-4 py-3 font-semibold text-store-foreground focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
        href={`#${STORE_MAIN_ID}`}
      >
        {copy.skipToContent}
      </a>
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-2">
        <Link
          className="flex min-h-11 min-w-0 items-center focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
          data-testid="store-header-home"
          href={home}
        >
          {store.logoUrl ? (
            // Unoptimized: a store's logo can live at any address, and the
            // optimizer only fetches from hosts listed ahead of time.
            <Image
              alt={store.name}
              className="h-10 w-auto"
              height={40}
              src={store.logoUrl}
              unoptimized
              width={40}
            />
          ) : (
            <span className="truncate font-display text-2xl leading-none tracking-display uppercase">
              {store.name}
            </span>
          )}
        </Link>
        <nav aria-label={copy.navigation} className="hidden md:block">
          <ul className="flex items-center gap-6">
            <li>
              <Link className={NAV_LINK_CLASS} href={home}>
                {copy.home}
              </Link>
            </li>
            <li>
              <Link className={NAV_LINK_CLASS} href={catalog}>
                {copy.catalog}
              </Link>
            </li>
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <StoreSearchForm
            className="hidden w-64 md:block"
            copy={copy}
            id="store-search"
            locale={locale}
            storeSlug={store.slug}
          />
          <StoreLocaleToggle className="hidden md:inline-flex" />
          <StoreCartButton storeSlug={store.slug} />
          <StoreMobileMenu
            className="md:hidden"
            closeLabel={copy.closeMenu}
            label={copy.menu}
          >
            <nav aria-label={copy.navigation}>
              <ul className="flex flex-col gap-2">
                <li>
                  <Link
                    className="inline-flex min-h-11 items-center font-display text-5xl leading-none tracking-display uppercase focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
                    href={home}
                  >
                    {copy.home}
                  </Link>
                </li>
                <li>
                  <Link
                    className="inline-flex min-h-11 items-center font-display text-5xl leading-none tracking-display uppercase focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
                    href={catalog}
                  >
                    {copy.catalog}
                  </Link>
                </li>
              </ul>
            </nav>
            <StoreSearchForm
              copy={copy}
              id="store-search-menu"
              locale={locale}
              storeSlug={store.slug}
            />
            <StoreLocaleToggle className="self-start" />
          </StoreMobileMenu>
        </div>
      </div>
    </header>
  );
}

export { StoreHeader };
