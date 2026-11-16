import Link from "next/link";
import { Suspense, use } from "react";

import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { StoreSkipLink } from "@/app/_components/atoms/store-skip-link";
import { StoreCartButton } from "@/app/_components/molecules/store-cart-button";
import { StoreLocaleToggle } from "@/app/_components/molecules/store-locale-toggle";
import { StoreMobileMenu } from "@/app/_components/molecules/store-mobile-menu";
import { StoreSearchPanel } from "@/app/_components/molecules/store-search-panel";
import type { Dictionary } from "@/content";
import { BRAND_NAME } from "@/lib/brand/logo";
import { catalogHref, EMPTY_CATALOG_QUERY } from "@/lib/catalog/query";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

/** Where the page's main content starts, for the skip link. */
export const STORE_MAIN_ID = "store-main";

/** A category as the header links to it. */
export interface StoreHeaderCategory {
  /** The language its name is in, when it may differ from the page's. */
  lang: string;
  name: string;
  slug: string;
}

/**
 * The header's line on a computer holds "Catálogo" and up to five
 * categories, while their names fit beside the logo; the menu and the
 * footer list every one of them.
 */
export const BAR_CATEGORIES_MAX = 5;
const BAR_CHARACTERS_MAX = 44;

export interface StoreHeaderProps {
  /**
   * The store's categories, in their order. A promise: on a page read per
   * request they stream in after the rest of the header, which is in the
   * page's static shell. Without it the header links to the catalog alone.
   */
  categories?: Promise<readonly StoreHeaderCategory[]>;
  className?: string;
  copy: Dictionary["storefront"]["shell"];
  /** The page is the catalog: its link says so (`aria-current`). */
  current?: "catalog";
  locale: Locale;
}

const BAR_LINK_CLASS =
  "inline-flex min-h-11 items-center font-display text-xs font-extrabold whitespace-nowrap text-store-accent uppercase underline-offset-6 decoration-2 hover:underline aria-[current=page]:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent";

const MENU_LINK_CLASS =
  "flex min-h-13 items-center border-b border-store-background/15 font-display text-lg font-extrabold wrap-anywhere text-store-accent uppercase aria-[current=page]:underline aria-[current=page]:underline-offset-6 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent";

/** The categories the line has room for, in the store's order. */
function fitting(
  categories: readonly StoreHeaderCategory[],
  used: number
): StoreHeaderCategory[] {
  const shown: StoreHeaderCategory[] = [];
  let length = used;

  for (const category of categories.slice(0, BAR_CATEGORIES_MAX)) {
    length += category.name.length;

    if (length > BAR_CHARACTERS_MAX) {
      break;
    }

    shown.push(category);
  }

  return shown;
}

/** The categories as list items of links to the catalog filtered by each. */
function CategoryLinks({
  categories,
  fit,
  linkClassName,
  locale,
}: {
  categories: Promise<readonly StoreHeaderCategory[]>;
  /** How many characters the line already holds; omitted, every category. */
  fit?: number;
  linkClassName: string;
  locale: Locale;
}) {
  const all = use(categories);
  const shown = fit === undefined ? all : fitting(all, fit);

  return shown.map((category) => (
    <li key={category.slug}>
      <Link
        className={linkClassName}
        href={catalogHref(locale, {
          ...EMPTY_CATALOG_QUERY,
          category: category.slug,
        })}
        lang={category.lang}
      >
        {category.name}
      </Link>
    </li>
  ));
}

/**
 * Every page of the store starts here (FER-021, FER-039): dark and sticky,
 * the links on the left ("Catálogo" and the store's categories), the full
 * logo in the middle leading home, then the language, the search and the
 * cart. On a phone and a tablet the links move into a menu, opened from the
 * left. Rendered by the server; only the menu, the search, the language link
 * and the cart's count hydrate.
 */
function StoreHeader({
  categories,
  className,
  copy,
  current,
  locale,
}: StoreHeaderProps) {
  const home = localizePath("/", locale);
  const catalog = localizePath("/products", locale);
  const catalogCurrent = current === "catalog" ? "page" : undefined;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 bg-store-contrast text-store-background",
        className
      )}
      data-slot="store-header"
      data-testid="store-header"
    >
      <StoreSkipLink target={STORE_MAIN_ID}>{copy.skipToContent}</StoreSkipLink>
      <div className="grid h-15.5 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 px-1.5 xl:h-19 xl:gap-4 xl:px-7">
        <div className="flex min-w-0 items-center">
          <StoreMobileMenu
            className="xl:hidden"
            closeLabel={copy.closeMenu}
            label={copy.menu}
          >
            <nav aria-label={copy.navigation}>
              <ul className="flex flex-col">
                <li>
                  <Link className={MENU_LINK_CLASS} href={home}>
                    {copy.home}
                  </Link>
                </li>
                <li>
                  <Link
                    aria-current={catalogCurrent}
                    className={MENU_LINK_CLASS}
                    href={catalog}
                  >
                    {copy.catalog}
                  </Link>
                </li>
                {categories ? (
                  <Suspense fallback={null}>
                    <CategoryLinks
                      categories={categories}
                      linkClassName={MENU_LINK_CLASS}
                      locale={locale}
                    />
                  </Suspense>
                ) : null}
              </ul>
            </nav>
            <StoreLocaleToggle className="self-start px-0" />
          </StoreMobileMenu>
          <nav aria-label={copy.navigation} className="hidden min-w-0 xl:block">
            <ul className="flex items-center gap-4.5">
              <li>
                <Link
                  aria-current={catalogCurrent}
                  className={BAR_LINK_CLASS}
                  href={catalog}
                >
                  {copy.catalog}
                </Link>
              </li>
              {categories ? (
                <Suspense fallback={null}>
                  <CategoryLinks
                    categories={categories}
                    fit={copy.catalog.length}
                    linkClassName={BAR_LINK_CLASS}
                    locale={locale}
                  />
                </Suspense>
              ) : null}
            </ul>
          </nav>
        </div>
        <Link
          aria-label={interpolate(copy.logo, { brand: BRAND_NAME })}
          className="flex min-h-11 items-center justify-center focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent"
          data-testid="store-header-home"
          href={home}
        >
          {/* The full logo: the tag with LR and MARKET (FER-039). */}
          <StoreLogo aria-hidden="true" className="h-10 xl:h-12.5" />
        </Link>
        <div className="flex items-center justify-end">
          <StoreLocaleToggle className="hidden md:inline-flex" />
          <StoreSearchPanel copy={copy} locale={locale} />
          <StoreCartButton />
        </div>
      </div>
    </header>
  );
}

export { StoreHeader };
