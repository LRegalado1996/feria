import { connection } from "next/server";

import { getDictionary } from "@/content";
import { isLocale } from "@/lib/i18n/config";
import { buildStoreLlms } from "@/lib/seo/llms";
import { siteOrigin } from "@/lib/seo/origin";
import { db } from "@/server/db";
import { listIndexablePages } from "@/server/services/page-settings";
import {
  findIndexableStore,
  listIndexableArticles,
  listIndexableCategories,
} from "@/server/services/seo";

interface LlmsContext {
  params: Promise<{ locale: string }>;
}

function notFound() {
  return new Response("Not found", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: 404,
  });
}

/**
 * The store's `llms.txt` (FER-024), at `/llms.txt` and `/en/llms.txt`: its
 * name, tagline, categories and published articles as Markdown for AI
 * assistants. Read at request time, so a new article is listed at once and
 * the build needs no database. A language the site does not speak is a 404.
 */
export async function GET(_request: Request, { params }: LlmsContext) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return notFound();
  }

  await connection();
  const store = await findIndexableStore(db);

  // Only a database whose migrations have not run has no store.
  if (!store) {
    return notFound();
  }

  const [articles, categories, pages] = await Promise.all([
    listIndexableArticles(db, { storeId: store.id }),
    listIndexableCategories(db, { locale, storeId: store.id }),
    listIndexablePages(db, { locale, storeId: store.id }),
  ]);
  const body = buildStoreLlms({
    articles,
    categories,
    copy: getDictionary(locale).seo.llms,
    currencyCode: store.currencyCode,
    locale,
    origin: siteOrigin(),
    pages,
    store,
  });

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
