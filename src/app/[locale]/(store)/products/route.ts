import type { NextRequest } from "next/server";
import { connection } from "next/server";

import { ALL_ARTICLES_PATH } from "@/lib/catalog/paths";
import { rawSearchParams, readLegacyCategory } from "@/lib/catalog/query";
import { isLocale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { readStore } from "@/server/cache/store";
import { db } from "@/server/db";
import { listCategories } from "@/server/services/catalog";

interface LegacyCatalogContext {
  params: Promise<{ locale: string }>;
}

/**
 * The catalog's address before FER-043, `/products?category=anillos&…`,
 * answered with a permanent redirect (308) to its page now: the category's
 * own (`/bijouterie/anillos`), or all articles (`/productos`) without one or
 * for a category the store no longer has. The rest of the query string (a
 * filter, a search, a sort) goes along, so a link shared by WhatsApp opens
 * on the same selection. An article's own address, `/products/{slug}`, is
 * still its page.
 */
export async function GET(
  request: NextRequest,
  { params }: LegacyCatalogContext
) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return new Response("Not found", { status: 404 });
  }

  const query = new URLSearchParams(request.nextUrl.search);
  const slug = readLegacyCategory(rawSearchParams(query));
  let path = ALL_ARTICLES_PATH;

  if (slug !== null) {
    // The build has no database: the store is read once a request is there.
    await connection();
    const store = await readStore();
    // As of now, not cached: a group just set must lead its links there.
    const categories = store
      ? await listCategories(db, { locale, storeId: store.id })
      : [];
    path = categories.find((entry) => entry.slug === slug)?.path ?? path;
  }

  query.delete("category");
  const search = query.toString().replaceAll("%2C", ",");
  const target = localizePath(path, locale);

  return new Response(null, {
    // Relative, so it stays on the host and in the language it was asked on.
    headers: { Location: search ? `${target}?${search}` : target },
    status: 308,
  });
}
