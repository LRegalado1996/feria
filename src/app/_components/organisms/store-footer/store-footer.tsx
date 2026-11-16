import type { Dictionary } from "@/content";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

/** Where the credit leads: Lucas's own site, as he chose on 2026-11-14. */
export const CREDIT_URL = "https://lucasregalado.com";

export interface StoreFooterProps {
  className?: string;
  copy: Dictionary["storefront"]["shell"];
  store: {
    instagramUrl: string | null;
    name: string;
    tiktokUrl: string | null;
    whatsappNumber: string | null;
  };
  /** The store's tagline in the page's language, with the language it is in. */
  tagline: { lang: string; text: string } | null;
}

// `wrap-anywhere`: a label carries the store's name, up to 80 characters
// with no space to break at.
const LINK_CLASS =
  "inline-flex min-h-11 items-center font-semibold wrap-anywhere underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent";

/**
 * Every page of a store ends here (FER-021): its tagline, its Instagram and
 * TikTok and a WhatsApp chat, each only when the store has it, and a quiet
 * credit to Lucas Regalado.
 */
function StoreFooter({ className, copy, store, tagline }: StoreFooterProps) {
  const links = [
    store.instagramUrl
      ? {
          href: store.instagramUrl,
          key: "instagram",
          label: interpolate(copy.instagram, { store: store.name }),
        }
      : null,
    store.tiktokUrl
      ? {
          href: store.tiktokUrl,
          key: "tiktok",
          label: interpolate(copy.tiktok, { store: store.name }),
        }
      : null,
    store.whatsappNumber
      ? {
          // wa.me takes the number as digits only.
          href: `https://wa.me/${store.whatsappNumber.replaceAll(/\D/gu, "")}`,
          key: "whatsapp",
          label: copy.whatsapp,
        }
      : null,
  ].filter((link) => link !== null);

  return (
    <footer
      aria-label={copy.footer}
      className={cn("bg-store-contrast text-store-background", className)}
      data-slot="store-footer"
      data-testid="store-footer"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-12">
        {tagline ? (
          <p
            className="font-display text-4xl leading-display tracking-display wrap-anywhere text-store-accent uppercase"
            lang={tagline.lang}
          >
            {tagline.text}
          </p>
        ) : null}
        {links.length > 0 ? (
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((link) => (
              <li key={link.key}>
                <a
                  className={LINK_CLASS}
                  data-testid={`store-footer-${link.key}`}
                  href={link.href}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {link.label}
                  <span className="sr-only"> {copy.newTab}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <a
          className="inline-flex min-h-11 items-center self-start text-sm text-store-contrast-muted underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-accent"
          data-testid="store-footer-credit"
          href={CREDIT_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          {copy.credit}
          <span className="sr-only"> {copy.newTab}</span>
        </a>
      </div>
    </footer>
  );
}

export { StoreFooter };
