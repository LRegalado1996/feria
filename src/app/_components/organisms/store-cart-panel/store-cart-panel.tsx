"use client";

import { Check, CircleAlert, ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { StoreCartLine } from "@/app/_components/molecules/store-cart-line";
import { CHECKOUT_PATH, isPlainClick, isSamePage } from "@/lib/cart/paths";
import { ALL_ARTICLES_PATH } from "@/lib/catalog/paths";
import {
  type CartPanelAdded,
  CartPanelContext,
  type CartPanelOptions,
  useCartLines,
} from "@/lib/hooks/cart";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/format";

export interface StoreCartPanelProps {
  /** The store page's frame: the bar, the header and the page. */
  children: ReactNode;
}

/**
 * How the panel leaves: sliding out, or at once when a link inside it is
 * followed, since the page left behind stays mounted, hidden, where an exit
 * animation never ends (design.md § Admin, the menu).
 */
type Leaving = "now" | "slide";

/** What the open panel shows: the cart, its total and the way on. */
function PanelBody({
  added,
  announcement,
}: {
  added: CartPanelAdded | null;
  /** What adding did, once the region that says it is in the page. */
  announcement: string;
}) {
  const { storefront } = useDictionary();
  const copy = storefront.cart;
  const locale = useLocale();
  const cart = useCartLines(locale);
  const root = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  // The count in the title bumps when it grows, and once as the panel opens
  // because something was added.
  const [bump, setBump] = useState({
    count: cart.count,
    times: added ? 1 : 0,
  });
  // The last line taken out: where it was, and its name to announce.
  const [removed, setRemoved] = useState<{
    count: number;
    index: number;
    title: string;
  } | null>(null);

  if (bump.count !== cart.count) {
    setBump({
      count: cart.count,
      times: cart.count > bump.count ? bump.times + 1 : bump.times,
    });
  }

  // A removed line takes its focused button with it: focus goes to the
  // line now in its place (or the last one), else to the empty cart's link,
  // else to the title, never to the top of the document.
  useEffect(() => {
    if (!removed) {
      return;
    }

    const buttons =
      root.current?.querySelectorAll<HTMLElement>("[data-cart-remove]");
    const next =
      buttons && buttons.length > 0
        ? buttons[Math.min(removed.index, buttons.length - 1)]
        : root.current?.querySelector<HTMLElement>(
            '[data-testid="store-cart-panel-empty"] a'
          );

    (next ?? title.current)?.focus();
  }, [removed]);

  let titleName = copy.title;

  if (cart.count === 1) {
    titleName = copy.panel.unitsOne;
  } else if (cart.count > 1) {
    titleName = interpolate(copy.panel.units, { count: cart.count });
  }

  const blocked = cart.hold === "blocked";
  let body: ReactNode = (
    <ul className="flex flex-col">
      {cart.lines.map(({ flag, item, product }, index) => (
        <StoreCartLine
          flag={flag}
          justAdded={added?.productId === item.productId}
          key={item.productId}
          onQuantity={(quantity) => {
            cart.setQuantity(item.productId, quantity);

            if (quantity <= 0) {
              setRemoved((previous) => ({
                count: (previous?.count ?? 0) + 1,
                index,
                title: product?.title ?? copy.flags.goneTitle,
              }));
            }
          }}
          product={product}
          quantity={item.quantity}
          seenPriceAmount={item.seenPriceAmount}
        />
      ))}
    </ul>
  );

  if (cart.status === "empty") {
    body = (
      <div
        className="flex flex-col items-center gap-5 px-4 py-14 text-center md:px-6"
        data-testid="store-cart-panel-empty"
      >
        <ShoppingBag aria-hidden="true" className="size-12 text-store-muted" />
        <p className="text-lg font-semibold">{copy.empty}</p>
        {/* The empty cart's one way on: the primary pill. */}
        <StoreButton asChild size="lg">
          <Link href={localizePath(ALL_ARTICLES_PATH, locale)}>
            {copy.browse}
          </Link>
        </StoreButton>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" ref={root}>
      <div className="flex min-h-15.5 items-center justify-between gap-3 bg-store-contrast py-2 pr-1.5 pl-4 md:pl-6">
        <DialogPrimitive.Title
          className="font-display text-lg leading-none font-extrabold text-store-accent uppercase outline-none"
          ref={title}
          tabIndex={-1}
        >
          {/* Its words and figure for the eye; one name for the ear. */}
          <span aria-hidden="true">{copy.title}</span>
          {cart.count > 0 ? (
            <>
              {" "}
              <span
                aria-hidden="true"
                className={cn(
                  "inline-block tabular-nums",
                  bump.times > 0 && "motion-safe:animate-store-bump"
                )}
                data-testid="store-cart-panel-count"
                key={bump.times}
              >
                ({cart.count})
              </span>
            </>
          ) : null}
          <span className="sr-only">{titleName}</span>
        </DialogPrimitive.Title>
        <DialogPrimitive.Close asChild>
          <StoreButton variant="contrast">
            {copy.panel.close}
            <X aria-hidden="true" />
          </StoreButton>
        </DialogPrimitive.Close>
      </div>
      {added ? (
        // Filled a moment after the panel opens, so it is announced.
        <output
          aria-live="polite"
          className="flex min-h-11 items-center gap-2 bg-store-surface px-4 py-2.5 text-sm font-semibold md:px-6"
          data-testid="store-cart-panel-status"
        >
          <Check aria-hidden="true" className="size-4 shrink-0" />
          {announcement}
        </output>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {cart.failed ? (
          <div
            className="flex flex-wrap items-center gap-3 border-b border-store-line px-4 py-4 md:px-6"
            role="alert"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
              {copy.errors.refresh}
            </p>
            <StoreButton
              onClick={() => {
                cart.refetch();
              }}
              type="button"
              variant="outline"
            >
              {copy.errors.retry}
            </StoreButton>
          </div>
        ) : null}
        {body}
      </div>
      {cart.status === "empty" ? null : (
        <div className="flex flex-col gap-3 bg-store-contrast px-4 pt-4 pb-5 text-store-background md:px-6">
          {cart.total ? (
            <p
              className="flex items-baseline justify-between gap-4"
              data-testid="store-cart-panel-total"
            >
              <span className="font-display text-sm leading-tight font-extrabold text-store-accent uppercase">
                {copy.subtotal}
              </span>
              <span className="text-xl font-semibold tabular-nums">
                {formatPrice(cart.total.amount, cart.total.currency, locale)}
              </span>
            </p>
          ) : null}
          {blocked ? (
            <p
              className="flex items-start gap-2 text-sm font-semibold"
              id="store-cart-panel-blocked"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-store-accent"
              />
              {copy.errors.blocked}
            </p>
          ) : null}
          {/* On the moss the main action is the lime pill, like the
              reference's checkout. A link to the checkout page; a line
              that cannot be bought holds it until it is taken out. */}
          {blocked ? (
            <StoreButton
              aria-describedby="store-cart-panel-blocked"
              className="w-full focus-visible:outline-store-accent"
              data-testid="store-cart-panel-checkout"
              disabled
              size="lg"
              type="button"
              variant="accent"
            >
              {copy.panel.placeOrder}
            </StoreButton>
          ) : (
            <StoreButton
              asChild
              className="w-full focus-visible:outline-store-accent"
              size="lg"
              variant="accent"
            >
              <Link
                data-testid="store-cart-panel-checkout"
                href={localizePath(CHECKOUT_PATH, locale)}
              >
                {copy.panel.placeOrder}
              </Link>
            </StoreButton>
          )}
          <DialogPrimitive.Close asChild>
            <StoreButton className="w-full" variant="contrast">
              {copy.panel.keepShopping}
            </StoreButton>
          </DialogPrimitive.Close>
        </div>
      )}
      <output
        aria-live="polite"
        className="sr-only"
        data-testid="store-cart-panel-removed"
      >
        {removed ? interpolate(copy.removed, { title: removed.title }) : ""}
        {/* An invisible mark that alternates, so a repeated message is new. */}
        {removed && removed.count % 2 === 1 ? "⁠" : null}
      </output>
    </div>
  );
}

/**
 * The cart as a side panel (FER-045), in every store page's frame: adding
 * an article opens it with that line marked, and the header's cart opens it
 * too. It slides in from the right over a dimmed page (all of a phone's
 * width): the cart's lines with their steppers, the total, "Hacer el pedido"
 * to the checkout page and "Seguir comprando". A modal dialog, in place like
 * every storefront dialog: focus stays inside; Escape, the scrim, the close
 * button and "Seguir comprando" close it, and focus goes back to what
 * opened it. Following a link inside closes it at once. Under reduced
 * motion it appears and leaves without moving (src/styles/globals.css).
 */
function StoreCartPanel({ children }: StoreCartPanelProps) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<CartPanelAdded | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [leaving, setLeaving] = useState<Leaving>("slide");
  const returnFocus = useRef<HTMLElement | null>(null);

  const show = (options: CartPanelOptions = {}) => {
    const active = document.activeElement;
    returnFocus.current =
      options.returnFocus ?? (active instanceof HTMLElement ? active : null);
    setAdded(options.added ?? null);
    setAnnouncement("");
    setLeaving("slide");
    setOpen(true);

    const message = options.added?.message;

    if (message) {
      // A live region added together with its text is often not read: the
      // words go in once the panel, and its region, are on the page.
      requestAnimationFrame(() => {
        setAnnouncement(message);
      });
    }
  };

  return (
    <CartPanelContext value={{ isOpen: open, open: show }}>
      {children}
      <DialogPrimitive.Root
        onOpenChange={(next) => {
          if (!next) {
            setLeaving("slide");
            setOpen(false);
          }
        }}
        open={open}
      >
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-store-foreground/50 data-[state=open]:animate-store-scrim-in",
            leaving === "slide" && "data-[state=closed]:animate-store-scrim-out"
          )}
          data-slot="dialog-overlay"
          data-testid="dialog-overlay"
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed top-0 right-0 z-50 flex h-dvh w-full flex-col bg-store-background text-store-foreground shadow-lg outline-none data-[state=open]:animate-store-panel-in sm:max-w-120",
            leaving === "slide" && "data-[state=closed]:animate-store-panel-out"
          )}
          data-slot="dialog-content"
          data-testid="store-cart-panel"
          onClickCapture={(event) => {
            const link =
              event.target instanceof Element
                ? event.target.closest("a[href]")
                : null;

            if (
              !(link instanceof HTMLAnchorElement) ||
              event.defaultPrevented ||
              !isPlainClick(event)
            ) {
              return;
            }

            if (isSamePage(link.href, window.location)) {
              // Already there ("Hacer el pedido" on the checkout page): the
              // panel closes, and the page stays as it is.
              event.preventDefault();
              setLeaving("slide");
            } else {
              setLeaving("now");
            }

            setOpen(false);
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus.current;

            // Leaving for another page: what opened it is on the page left.
            if (leaving === "slide" && target?.isConnected) {
              target.focus();
            }
          }}
        >
          <PanelBody added={added} announcement={announcement} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Root>
    </CartPanelContext>
  );
}

export { StoreCartPanel };
