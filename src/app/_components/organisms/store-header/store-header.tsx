import Link from "next/link";
import { Suspense, use } from "react";

import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { StoreSkipLink } from "@/app/_components/atoms/store-skip-link";
import { StoreCartButton } from "@/app/_components/molecules/store-cart-button";
import { StoreLocaleToggle } from "@/app/_components/molecules/store-locale-toggle";
import { StoreMobileMenu } from "@/app/_components/molecules/store-mobile-menu";
import { StoreNavGroup } from "@/app/_components/molecules/store-nav-group";
import { StoreSearchPanel } from "@/app/_components/molecules/store-search-panel";
import type { Dictionary } from "@/content";
import { BRAND_NAME } from "@/lib/brand/logo";
import {
  catalogNavigation,
  type NavigationCategory,
  type NavigationEntry,
} from "@/lib/catalog/navigation";
import { ALL_ARTICLES_PATH } from "@/lib/catalog/paths";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";

/** Where the page's main content starts, for the skip link. */
export const STORE_MAIN_ID = "store-main";

/** A category as the header links to it: its group and its page. */
export type StoreHeaderCategory = NavigationCategory;

/**
 * The header's line on a computer holds "Catálogo" and up to
 * five of the navigation's entries (a group counts once), while their names
 * fit beside the logo; the menu and the footer list every one of them.
 */
export const BAR_CATEGORIES_MAX = 5;
const BAR_CHARACTERS_MAX = 44;

export interface StoreHeaderProps {
  /**
   * The store's categories, in their order, each with its group (FER-043).
   * Read already (a page that read the store before anything is sent: its
   * links are in the first response, for a crawler that runs no script), or
   * a promise (a page read per request whose header stays in its static
   * shell: they stream in). Without it the header links to all articles
   * alone.
   */
  categories?:
    | Promise<readonly StoreHeaderCategory[]>
    | readonly StoreHeaderCategory[];
  className?: string;
  copy: Dictionary["storefront"]["shell"];
  /**
   * The page's own address, unlocalized (`/productos`,
   * `/bijouterie/anillos`): its link says so (`aria-current`).
   */
  currentPath?: string;
  locale: Locale;
}

const BAR_LINK_CLASS =
  "inline-flex min-h-11 items-center font-display text-xs font-extrabold whitespace-nowrap text-store-accent uppercase underline-offset-6 decoration-2 hover:underline aria-[current=page]:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent";

const MENU_LINK_CLASS =
  "flex min-h-13 items-center border-b border-store-background/15 font-display text-lg font-extrabold wrap-anywhere text-store-accent uppercase aria-[current=page]:underline aria-[current=page]:underline-offset-6 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent";

/** The entries the line has room for, in the store's order. */
function fitting(
  entries: readonly NavigationEntry[],
  used: number
): NavigationEntry[] {
  const shown: NavigationEntry[] = [];
  let length = used;

  for (const entry of entries.slice(0, BAR_CATEGORIES_MAX)) {
    length += entry.name.length;

    if (length > BAR_CHARACTERS_MAX) {
      break;
    }

    shown.push(entry);
  }

  return shown;
}

/**
 * The navigation's entries as list items (FER-043): a category in no group
 * is a link to its page; a group is its name, a link to its page, and a
 * button that shows its categories.
 */
function CategoryLinks({
  categories,
  copy,
  currentPath,
  fit,
  locale,
  variant,
}: {
  categories:
    | Promise<readonly StoreHeaderCategory[]>
    | readonly StoreHeaderCategory[];
  copy: Dictionary["storefront"]["shell"];
  currentPath: string | undefined;
  /** How many characters the line already holds; omitted, every entry. */
  fit?: number;
  locale: Locale;
  variant: "bar" | "menu";
}) {
  const all = catalogNavigation(
    "then" in categories ? use(categories) : categories
  );
  const shown = fit === undefined ? all : fitting(all, fit);
  const link = (entry: NavigationCategory) => ({
    current: entry.path === currentPath,
    href: localizePath(entry.path, locale),
    lang: entry.lang,
    name: entry.name,
  });

  return shown.map((entry) => (
    <li key={entry.slug}>
      {entry.children.length > 0 ? (
        <StoreNavGroup
          allLabel={copy.groupAll}
          group={link(entry)}
          items={entry.children.map(link)}
          toggleLabel={interpolate(copy.groupToggle, { name: entry.name })}
          variant={variant}
        />
      ) : (
        <Link
          aria-current={entry.path === currentPath ? "page" : undefined}
          className={variant === "bar" ? BAR_LINK_CLASS : MENU_LINK_CLASS}
          href={localizePath(entry.path, locale)}
          lang={entry.lang}
        >
          {entry.name}
        </Link>
      )}
    </li>
  ));
}

/**
 * The header's categories: in place when they were read already, behind a
 * boundary of their own while they stream in.
 */
function Categories(props: Parameters<typeof CategoryLinks>[0]) {
  return "then" in props.categories ? (
    <Suspense fallback={null}>
      <CategoryLinks {...props} />
    </Suspense>
  ) : (
    <CategoryLinks {...props} />
  );
}
/**
 * Every page of the store starts here (FER-021, FER-039): dark and sticky,
 * the links on the left ("Catálogo", then the store's categories
 * and groups, FER-043), the full
 * logo in the middle leading home, then the language, the search and the
 * cart. On a phone and a tablet the links move into a menu, opened from the
 * left. Rendered by the server; only the menu, the search, the language link
 * and the cart's count hydrate.
 */
function StoreHeader({
  categories,
  className,
  copy,
  currentPath,
  locale,
}: StoreHeaderProps) {
  const home = localizePath("/", locale);
  const catalog = localizePath(ALL_ARTICLES_PATH, locale);
  const catalogCurrent = currentPath === ALL_ARTICLES_PATH ? "page" : undefined;

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
                  <Categories
                    categories={categories}
                    copy={copy}
                    currentPath={currentPath}
                    locale={locale}
                    variant="menu"
                  />
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
                <Categories
                  categories={categories}
                  copy={copy}
                  currentPath={currentPath}
                  fit={copy.catalog.length}
                  locale={locale}
                  variant="bar"
                />
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
