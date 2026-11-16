import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface StoreBannerProps {
  className?: string;
  /** Built by the caller with `localizePath()`. */
  href: string;
  /**
   * The first photo a page shows is its largest: it loads first. Every
   * other banner waits until it is near the screen.
   */
  priority?: boolean;
  /** Its words for "Comprar ahora", from the page's dictionary. */
  shopNow: string;
  /** The photo's file: its title says what the banner is about. */
  src: string;
  title: string;
}

/**
 * A full-width photo with its title and "Comprar ahora →" on its bottom-left
 * corner (FER-039), one link to where it leads. The photo is decoration: the
 * title says what the link is, so a screen reader hears it once. A shade
 * rises from the bottom so the white words read on any photo.
 */
function StoreBanner({
  className,
  href,
  priority = false,
  shopNow,
  src,
  title,
}: StoreBannerProps) {
  return (
    <Link
      className={cn(
        "group relative block h-118 overflow-hidden bg-store-contrast text-store-background focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-store-accent md:h-130",
        className
      )}
      data-slot="store-banner"
      href={href}
    >
      <Image
        alt=""
        className="object-cover"
        fill
        priority={priority}
        sizes="100vw"
        src={src}
      />
      {/* The one gradient of the storefront: legibility, not decoration. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-t from-store-foreground/75 to-transparent to-60%"
      />
      <span className="absolute inset-x-4 bottom-5.5 flex flex-col items-start md:inset-x-7 md:bottom-7.5">
        <span className="max-w-[15ch] font-display store-display-banner leading-display font-extrabold wrap-anywhere uppercase">
          {title}
        </span>
        <span className="mt-3 inline-flex min-h-6 items-center gap-2 font-display text-xs font-extrabold uppercase underline-offset-6 group-hover:underline md:mt-4">
          {shopNow}
          <ArrowRight aria-hidden="true" className="size-4" />
        </span>
      </span>
    </Link>
  );
}

export { StoreBanner };
