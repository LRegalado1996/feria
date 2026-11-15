import { redirect } from "next/navigation";
import { Suspense } from "react";

import { storeSectionPath } from "@/lib/admin/paths";
import { readLocale } from "@/lib/i18n/read-locale";

interface AdminStoreProps {
  params: Promise<{ locale: string; store: string }>;
}

/**
 * A store's admin opens on its articles. The section page checks the session
 * and the store; this only points there.
 */
export default function AdminStore({ params }: AdminStoreProps) {
  return (
    <Suspense>
      <ToArticles params={params} />
    </Suspense>
  );
}

async function ToArticles({ params }: AdminStoreProps): Promise<never> {
  const locale = await readLocale(params);
  const { store } = await params;

  redirect(storeSectionPath(store, "products", locale));
}
