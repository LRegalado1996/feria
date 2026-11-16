import { redirect } from "next/navigation";
import { Suspense } from "react";

import { platformSectionPath } from "@/lib/admin/paths";
import { readLocale } from "@/lib/i18n/read-locale";

interface PlatformProps {
  params: Promise<{ locale: string }>;
}

/** The platform area opens on its stores; that page checks the role. */
export default function Platform({ params }: PlatformProps) {
  return (
    <Suspense>
      <ToStores params={params} />
    </Suspense>
  );
}

async function ToStores({ params }: PlatformProps): Promise<never> {
  redirect(platformSectionPath("stores", await readLocale(params)));
}
