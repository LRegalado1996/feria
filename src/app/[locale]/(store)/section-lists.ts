import { getDictionary } from "@/content";
import { articlePath } from "@/lib/catalog/paths";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import type { PageContent } from "@/lib/page/content";
import { absoluteUrl } from "@/lib/seo/origin";
import { itemList } from "@/lib/seo/structured-data";

/** An article as a page's structured data names it. */
interface ListedArticle {
  slug: string;
  title: string;
}

/**
 * What a page's blocks tell search engines and assistants (FER-022,
 * FER-058): each row as a list of its articles and each article in the
 * spotlight as a list of one (FER-059), named as on the page, in its order
 * there. Banners link elsewhere and list nothing, nor does "how to buy",
 * which holds no article.
 */
export function sectionLists(
  content: PageContent<ListedArticle>,
  locale: Locale
) {
  const { storefront } = getDictionary(locale);
  const urlOf = (article: ListedArticle) => ({
    name: article.title,
    url: absoluteUrl(localizePath(articlePath(article.slug), locale)),
  });

  return content.sections.flatMap((section) => {
    if (section.kind === "banner" || section.kind === "how_to_buy") {
      return [];
    }

    if (section.kind === "spotlight") {
      const { article } = section.spotlight;

      return [itemList({ items: [urlOf(article)], name: article.title })];
    }

    const names = {
      best_sellers: storefront.home.bestSellers,
      featured: storefront.home.featured,
    };

    return [
      itemList({
        items: section.articles.map(urlOf),
        name:
          section.kind === "category"
            ? section.category.name
            : names[section.kind],
      }),
    ];
  });
}
