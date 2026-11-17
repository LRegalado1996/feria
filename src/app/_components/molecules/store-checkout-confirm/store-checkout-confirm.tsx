"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { type RefObject, useRef } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { type Currency, formatInteger, formatPrice } from "@/lib/utils/format";

export interface StoreCheckoutConfirmProps {
  /** The name the shopper typed, as the form read it. */
  name: string;
  /** "Volver" or Escape: the dialog closes, the form keeps all. */
  onBack: () => void;
  /** "Confirmar pedido": only now is the order sent. */
  onConfirm: () => void;
  open: boolean;
  /** The mobile the shopper typed, as they typed it. */
  phone: string;
  /** Where focus goes once the dialog closes: the form's submit button. */
  returnFocus: RefObject<HTMLElement | null>;
  /**
   * The order is on its way: "Confirmar pedido" says so and holds, and the
   * dialog stays until the page moves on or the order fails.
   */
  sending: boolean;
  /** What the cart comes to at the shop's prices now; `null` before them. */
  total: { amount: number; currency: Currency } | null;
  /** How many units the order holds, every line's quantity together. */
  units: number;
}

const LABEL_CLASS =
  "font-display text-xs leading-tight font-extrabold uppercase";

/**
 * The last word before an order is sent (FER-050): a modal dialog over the
 * checkout that sums it up (the units, the total, the name and the mobile
 * typed) and asks. "Confirmar pedido" sends it; "Volver" and Escape close
 * it and leave the form as it was. A tap on the scrim does nothing, as an
 * alert dialog's: the second tap of a double tap on "Hacer el pedido" lands
 * there, and must not close what the first opened. Focus starts on
 * "Volver", the choice that sends nothing, stays inside, and goes back to
 * the form's submit button once it closes. While the order is sent nothing
 * closes it: it can no longer be taken back. Rendered in place, like every
 * storefront dialog, with the cart panel's moss bar over a white body.
 */
function StoreCheckoutConfirm({
  name,
  onBack,
  onConfirm,
  open,
  phone,
  returnFocus,
  sending,
  total,
  units,
}: StoreCheckoutConfirmProps) {
  const { storefront } = useDictionary();
  const copy = storefront.cart.confirm;
  const locale = useLocale();
  const back = useRef<HTMLButtonElement>(null);
  const rows: { key: string; label: string; value: string }[] = [
    { key: "units", label: copy.units, value: formatInteger(units, locale) },
    ...(total
      ? [
          {
            key: "total",
            label: copy.total,
            value: formatPrice(total.amount, total.currency, locale),
          },
        ]
      : []),
    { key: "name", label: copy.name, value: name },
    { key: "phone", label: copy.phone, value: phone },
  ];

  return (
    <DialogPrimitive.Root
      onOpenChange={(next) => {
        if (!next) {
          onBack();
        }
      }}
      open={open}
    >
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-50 bg-store-foreground/50 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
        data-slot="dialog-overlay"
        data-testid="dialog-overlay"
      />
      <DialogPrimitive.Content
        className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-1/2 flex-col overflow-y-auto bg-store-background text-store-foreground shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        data-slot="dialog-content"
        data-testid="store-checkout-confirm"
        onCloseAutoFocus={(event) => {
          // No trigger to go back to: the dialog opened from a valid
          // submit, which may have been Enter in a field.
          event.preventDefault();
          returnFocus.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (sending) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          back.current?.focus();
        }}
      >
        <div className="bg-store-contrast px-5 py-4">
          <DialogPrimitive.Title className="font-display text-sm leading-tight font-extrabold text-store-accent uppercase">
            {copy.title}
          </DialogPrimitive.Title>
        </div>
        <div className="flex flex-col gap-5 p-5">
          <DialogPrimitive.Description className="text-sm text-store-muted">
            {copy.description}
          </DialogPrimitive.Description>
          <dl
            className="border-y border-store-line"
            data-testid="store-checkout-confirm-summary"
          >
            {rows.map((row) => (
              <div
                className="flex items-baseline justify-between gap-4 border-b border-store-line py-3 last:border-b-0"
                data-testid={`store-checkout-confirm-${row.key}`}
                key={row.key}
              >
                <dt className={LABEL_CLASS}>{row.label}</dt>
                <dd className="min-w-0 text-right text-base wrap-anywhere tabular-nums">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-3">
            <StoreButton
              // While it is sent the shopper waits, which is not "refused".
              aria-disabled={sending}
              className="w-full aria-disabled:cursor-wait aria-disabled:opacity-70"
              data-testid="store-checkout-confirm-submit"
              onClick={() => {
                onConfirm();
              }}
              size="lg"
              type="button"
            >
              {sending ? storefront.cart.checkout.submitting : copy.confirm}
            </StoreButton>
            <StoreButton
              aria-disabled={sending}
              className="w-full"
              data-testid="store-checkout-confirm-back"
              onClick={() => {
                if (!sending) {
                  onBack();
                }
              }}
              ref={back}
              size="lg"
              type="button"
              variant="outline"
            >
              {copy.back}
            </StoreButton>
          </div>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}

export { StoreCheckoutConfirm };
