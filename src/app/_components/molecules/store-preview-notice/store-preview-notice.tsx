"use client";

import { Lock } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  comingSoonAdminPath,
  STORE_PREVIEW_COOKIE,
} from "@/lib/coming-soon/paths";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { cn } from "@/lib/utils";

/** Cookies change on navigations, which re-render this; nothing to listen to. */
function subscribe() {
  return () => undefined;
}

/** Whether the proxy marked this page as an admin's view of the closed store. */
function readPreview(): boolean {
  // oxlint-disable-next-line unicorn/no-document-cookie -- a store snapshot is read synchronously; the Cookie Store API is async and missing from Firefox and older Safari (1 here)
  return document.cookie
    .split(";")
    .some((cookie) => cookie.trim() === `${STORE_PREVIEW_COOKIE}=1`);
}

/** The server never knows: its output is the same for every visitor. */
function readNothing(): boolean {
  return false;
}

export interface StorePreviewNoticeProps {
  className?: string;
}

/**
 * The strip over the store a signed-in admin sees while the coming-soon page
 * is published (FER-034): the store is closed to the public, and a link to
 * the admin screen that opens it. Drawn in the browser from the cookie the
 * proxy sets on such a page (`STORE_PREVIEW_COOKIE`), so every page's server
 * output stays the public's and no cache can hold a version of it for one
 * viewer. The cookie only shows this: the proxy decides who sees the store.
 * Read again on every navigation, since the proxy sets or clears it there.
 */
function StorePreviewNotice({ className }: StorePreviewNoticeProps) {
  const { comingSoon } = useDictionary();
  const locale = useLocale();
  // A navigation re-renders this, and the snapshot is read again.
  usePathname();
  const preview = useSyncExternalStore(subscribe, readPreview, readNothing);

  if (!preview) {
    return null;
  }

  return (
    // A status, announced as it appears: an `output`.
    <output
      className={cn(
        // One row on a phone, as tall as the link's 44 px: the home's cover
        // under the header stays nearly a screen tall (FER-022).
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-store-foreground px-4 py-0.5 text-center text-sm text-store-background sm:py-2",
        className
      )}
      data-slot="store-preview-notice"
      data-testid="store-preview-notice"
    >
      <Lock aria-hidden="true" className="size-4 shrink-0" />
      {/* The whole notice for every reader at every width; a phone's eye
          gets the short one, as the announcement bar does. */}
      <span className="max-sm:sr-only">{comingSoon.previewNotice.message}</span>
      <span aria-hidden="true" className="sm:hidden">
        {comingSoon.previewNotice.short}
      </span>
      {/* A plain link: the admin is another app, nothing to fetch ahead. */}
      <a
        className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-store-background md:min-h-0"
        href={comingSoonAdminPath(locale)}
      >
        {comingSoon.previewNotice.link}
      </a>
    </output>
  );
}

export { StorePreviewNotice };
