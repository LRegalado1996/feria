import type { Metadata } from "next";
import type { ReactNode } from "react";

import { getDictionary } from "@/content";
import { readLocale } from "@/lib/i18n/read-locale";

interface AdminLayoutProps {
  children: ReactNode;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { admin } = getDictionary(await readLocale(params));

  // The admin is for its users, never for search engines.
  return {
    robots: { follow: false, index: false },
    title: admin.metadata.title,
  };
}

/**
 * Chrome only, and none of it yet: each page renders the admin shell after
 * checking the session itself (FER-013), because a layout does not re-render
 * on navigation and must never be what keeps a page private.
 */
export default function AdminLayout({ children }: AdminLayoutProps): ReactNode {
  return children;
}
