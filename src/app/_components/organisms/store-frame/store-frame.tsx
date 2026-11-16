import { type ReactNode, Suspense, use } from "react";

import { StoreAnnouncementBar } from "@/app/_components/atoms/store-announcement-bar";
import {
  STORE_MAIN_ID,
  StoreHeader,
  type StoreHeaderProps,
} from "@/app/_components/organisms/store-header";

/** The words on the bar above the header, and the language they are in. */
export interface StoreAnnouncement {
  lang: string;
  text: string;
}

export type StoreFrameProps = Omit<StoreHeaderProps, "className"> & {
  /**
   * The bar's words. A promise: on a page read per request they stream in,
   * while an empty bar holds their place; one that resolves to `null` leaves
   * the page without a bar, and so does leaving it out.
   */
  announcement?: Promise<StoreAnnouncement | null>;
  /** The page: its `<main>`, then its footer. */
  children: ReactNode;
};

/** The bar, once its words have arrived; nothing when there are none. */
function Announcement({
  announcement,
}: {
  announcement: Promise<StoreAnnouncement | null>;
}) {
  const said = use(announcement);

  return said ? (
    <StoreAnnouncementBar lang={said.lang}>{said.text}</StoreAnnouncementBar>
  ) : null;
}

/**
 * What every store page sits in (FER-039): the lime bar, the header, then
 * the page, which the skip link leads to. Each page renders its own frame,
 * with what it read of the store (a static article page) or a promise of it
 * (a page read per request), since the bar and the header's categories come
 * from the database and the group's layout must stay prerendered
 * (docs/agents/nextjs.md § Store pages).
 */
function StoreFrame({ announcement, children, ...header }: StoreFrameProps) {
  return (
    <div className="flex flex-1 flex-col" data-slot="store-frame">
      {announcement ? (
        <Suspense fallback={<StoreAnnouncementBar placeholder />}>
          <Announcement announcement={announcement} />
        </Suspense>
      ) : null}
      <StoreHeader {...header} />
      {/* Its top clears the sticky header when the skip link scrolls to it. */}
      <div
        className="flex flex-1 scroll-mt-20 flex-col"
        data-slot="store-main"
        data-testid="store-main"
        id={STORE_MAIN_ID}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}

export { StoreFrame };
