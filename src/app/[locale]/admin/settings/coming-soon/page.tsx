import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import type { ComingSoonDefaults } from "@/app/_components/molecules/coming-soon-form";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { ComingSoonManager } from "@/app/_components/organisms/coming-soon-manager";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { comingSoonAdminPath } from "@/lib/coming-soon/paths";
import type { Locale } from "@/lib/i18n/config";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";

interface ComingSoonAdminPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * What the coming-soon page says in each language where a field is empty:
 * the dictionary's copy, one line per line as the fields hold it.
 */
function defaultTexts(locale: Locale): ComingSoonDefaults[Locale] {
  const { comingSoon } = getDictionary(locale);

  return {
    eyebrow: comingSoon.eyebrow,
    headline: `${comingSoon.title.lineOne}\n${comingSoon.title.lineTwo}`,
    lead: comingSoon.lead,
    marquee: [
      comingSoon.marquee.products,
      comingSoon.marquee.fair,
      comingSoon.marquee.dates,
    ].join("\n"),
  };
}

// Spelled out so a new language fails the typecheck until it is listed.
const DEFAULTS: ComingSoonDefaults = {
  en: defaultTexts("en"),
  es: defaultTexts("es"),
};

/**
 * The coming-soon page and its switch (FER-034), under the settings (the
 * navigation marks them), behind the admin's per-page
 * check: a session. The page is fetched on the server so the screen opens
 * with its state and its texts.
 */
export default function ComingSoonAdminPage({
  params,
}: ComingSoonAdminPageProps) {
  // The session is a request-time read: the params are read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <ComingSoonResolver params={params} />
    </Suspense>
  );
}

async function ComingSoonResolver({ params }: ComingSoonAdminPageProps) {
  const locale = await readLocale(params);
  const { admin } = getDictionary(locale);
  const login = await requireAdmin(comingSoonAdminPath(locale), locale);
  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the screen fetches again and shows its
  // own error state.
  await queryClient.query(orpc.comingSoon.get.queryOptions()).catch(noop);

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      login={login}
      section="settings"
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ComingSoonManager defaults={DEFAULTS} />
      </HydrationBoundary>
    </AdminShell>
  );
}
