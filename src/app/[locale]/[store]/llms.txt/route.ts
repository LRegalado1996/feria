import { getDictionary } from "@/content";
import { isLocale } from "@/lib/i18n/config";
import { buildStoreLlms } from "@/lib/seo/llms";
import { siteOrigin } from "@/lib/seo/origin";
import { getStoreForPath } from "@/server/cache/store";
import { db } from "@/server/db";
import {
  listIndexableArticles,
  listIndexableCategories,
} from "@/server/services/seo";

interface LlmsContext {
  params: Promise<{ locale: string; store: string }>;
}

function notFound() {
  return new Response("Not found", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: 404,
  });
}

/**
 * A store's `llms.txt` (FER-024), at `/{store}/llms.txt` and
 * `/en/{store}/llms.txt`: its name, tagline, categories and published
 * articles as Markdown for AI assistants. An unknown or inactive store is
 * a 404, never an empty file.
 */
export async function GET(_request: Request, { params }: LlmsContext) {
  const { locale, store: segment } = await params;
  const store = isLocale(locale) ? await getStoreForPath(segment) : null;

  if (!(isLocale(locale) && store)) {
    return notFound();
  }

  const [articles, categories] = await Promise.all([
    listIndexableArticles(db, { storeId: store.id }),
    listIndexableCategories(db, { locale, storeId: store.id }),
  ]);
  const body = buildStoreLlms({
    articles,
    categories,
    copy: getDictionary(locale).seo.llms,
    currencyCode: store.currencyCode,
    locale,
    origin: siteOrigin(),
    store,
  });

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
