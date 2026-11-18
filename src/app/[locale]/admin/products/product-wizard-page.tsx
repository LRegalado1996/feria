import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import type { Viewport } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { ProductWizard } from "@/app/_components/organisms/product-wizard";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import {
  newProductPath,
  productPath,
  readProductId,
} from "@/lib/admin/products";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { readLocale } from "@/lib/i18n/read-locale";
import { catchNotFound } from "@/lib/orpc/catch-not-found";
import { caller, getQueryClient, orpc } from "@/lib/orpc/server";
import { siteOrigin } from "@/lib/seo/origin";

/**
 * The wizard's pages on a phone: the on-screen keyboard shrinks the page
 * instead of covering it (Chrome on Android), so the bar under the thumb
 * stays above it and a field scrolls clear of both. Zoom stays available.
 */
export const WIZARD_VIEWPORT: Viewport = {
  initialScale: 1,
  interactiveWidget: "resizes-content",
  width: "device-width",
};

export interface ProductWizardPageProps {
  /** The address's params: an article's carry its id segment, unread. */
  params: Promise<{ id?: string; locale: string }>;
}

/**
 * The article wizard (FER-017) on a new article or one of the store's,
 * behind the admin's per-page check: a session. An address no article can
 * have, or an article the store does not have, is the not-found page.
 */
export function ProductWizardPage(props: ProductWizardPageProps) {
  // The session and the id are request-time reads: inside the boundary.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <ProductWizardResolver {...props} />
    </Suspense>
  );
}

export async function ProductWizardResolver({
  params,
}: ProductWizardPageProps) {
  const locale = await readLocale(params);
  const { id: segment } = await params;
  // Not an id at all: no session check, no query.
  const id = segment === undefined ? null : readProductId(segment);

  if (segment !== undefined && id === null) {
    notFound();
  }

  const { admin } = getDictionary(locale);
  const login = await requireAdmin(
    id === null ? newProductPath(locale) : productPath(id, locale),
    locale
  );
  const queryClient = getQueryClient();

  if (id !== null) {
    // An article the store does not have is NOT_FOUND. Any other failure is
    // not a 404: the wizard fetches again and shows its own error state.
    const found = await catchNotFound(
      queryClient.query(orpc.product.get.queryOptions({ input: { id } }))
    ).catch(noop);

    if (found === null) {
      notFound();
    }
  }

  // The categories and filters the details offer; failing, they are read
  // again in the browser.
  const [store] = await Promise.all([
    caller.store.get(),
    queryClient.query(orpc.category.list.queryOptions()).catch(noop),
    queryClient.query(orpc.attribute.list.queryOptions()).catch(noop),
  ]);
  const tagline = (language: "en" | "es") =>
    pickTranslation(store.translations, language)?.tagline ?? undefined;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminShell
        dictionary={admin}
        locale={locale}
        login={login}
        section="products"
      >
        <ProductWizard
          articleId={id}
          host={new URL(siteOrigin()).host}
          store={{
            currencyCode: store.currencyCode,
            name: store.name,
            taglines: { en: tagline("en"), es: tagline("es") },
          }}
        />
      </AdminShell>
    </HydrationBoundary>
  );
}
