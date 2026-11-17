"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { useForm, useFormState } from "react-hook-form";

import { StoreButton } from "@/app/_components/atoms/store-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  useFormField,
} from "@/app/_components/molecules/form";
import { StoreCheckoutConfirm } from "@/app/_components/molecules/store-checkout-confirm";
import {
  checkoutErrorMessage,
  checkoutFailure,
} from "@/lib/cart/checkout-error";
import {
  checkoutRequestKey,
  forgetCheckoutRequest,
} from "@/lib/cart/request-key";
import { reportError } from "@/lib/errors/client";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useCreateOrder } from "@/lib/hooks/order";
import { useHydrated } from "@/lib/hooks/ui/use-hydrated";
import {
  type CheckoutValues,
  createCheckoutSchema,
  ORDER_CUSTOMER_NAME_MAX_LENGTH,
  ORDER_NOTE_MAX_LENGTH,
  ORDER_PHONE_MAX_LENGTH,
} from "@/lib/schemas/order";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/utils/format";
import { normalizePhone } from "@/lib/utils/phone";

export interface StoreCheckoutFormProps {
  /** Why the order cannot be placed yet, said under the button; `null` when it can. */
  blockedReason: string | null;
  className?: string;
  /** The order's articles and quantities, as the cart holds them. */
  items: { productId: number; quantity: number }[];
  /** The order was taken: its link's token, and the items it ordered. */
  onPlaced: (
    token: string,
    ordered: { productId: number; quantity: number }[]
  ) => void;
  /** An article changed under the cart: read the articles again. */
  onStale: () => void;
  /**
   * What the cart comes to at the shop's prices now, for the confirmation's
   * summary; `null` before them.
   */
  total: { amount: number; currency: Currency } | null;
}

// Square, like the tiles: only buttons are pills. `text-base`, so a phone
// does not zoom into the field.
const FIELD_CLASS =
  "w-full border-2 border-store-foreground bg-store-background px-3 text-base text-store-foreground placeholder:text-store-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground aria-invalid:border-dashed";

/** A field's label, hint and error, in the store's palette. */
function StoreField({
  children,
  hint,
  label,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
}) {
  const { error, formDescriptionId, formItemId, formMessageId } =
    useFormField();

  return (
    <>
      <label className="text-sm font-semibold" htmlFor={formItemId}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-sm text-store-muted" id={formDescriptionId}>
          {hint}
        </p>
      ) : null}
      {error?.message ? (
        <p
          className="flex items-center gap-1.5 text-sm font-semibold"
          id={formMessageId}
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          {error.message}
        </p>
      ) : null}
    </>
  );
}

/** How many units a cart holds, every line's quantity added up. */
function unitsOf(items: StoreCheckoutFormProps["items"]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/**
 * The checkout (FER-026): name, mobile and an optional note, then the order.
 * A valid submit sends nothing yet: it asks first, in a dialog that sums the
 * order up (FER-050), and only "Confirmar pedido" sends it; "Volver" leaves
 * the form as it was. One confirmation is one order: it holds while the
 * order is sent, and the same cart and phone sent again (a lost answer, a
 * double tap that got through) carry the same request key, so the server
 * answers the order it already took. Any change to the cart or the phone
 * makes it a new request.
 */
function StoreCheckoutForm({
  blockedReason,
  className,
  items,
  onPlaced,
  onStale,
  total,
}: StoreCheckoutFormProps) {
  const { storefront } = useDictionary();
  const copy = storefront.cart;
  const locale = useLocale();
  const hydrated = useHydrated();
  const createOrder = useCreateOrder();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<CheckoutValues>({
    defaultValues: { customerName: "", customerPhone: "", note: "" },
    resolver: zodResolver(createCheckoutSchema(copy.checkout)),
  });
  // A hook, not `form.formState`: the React Compiler memoizes a read off the
  // stable `form` object, and the button would never update.
  const { isSubmitting } = useFormState({ control: form.control });
  const sending = isSubmitting || createOrder.isPending;
  // Set the moment a submit starts, before React re-renders: a second tap
  // that lands first is dropped here, since the button stays enabled.
  const inFlight = useRef(false);
  // What a valid submit read, while the dialog asks to confirm it.
  const [confirming, setConfirming] = useState<CheckoutValues | null>(null);
  // What the order on its way holds, once confirmed: the dialog, still open
  // while it is sent, sums that up, never the cart another tab changes
  // meanwhile. Before that it reads the cart as it is now, which is what
  // "Confirmar pedido" sends.
  const [sent, setSent] = useState<{
    total: StoreCheckoutFormProps["total"];
    units: number;
  } | null>(null);
  const submitButton = useRef<HTMLButtonElement>(null);

  const placeOrder = async (values: CheckoutValues) => {
    if (inFlight.current) {
      return;
    }

    // The cart can be held while the dialog is open (its prices read
    // again): the dialog closes, and the reason shows under the button.
    if (blockedReason !== null) {
      setConfirming(null);
      return;
    }

    inFlight.current = true;
    setFailure(null);
    // What this submit orders, whatever the cart becomes while it is sent.
    const ordered = items;
    setSent({ total, units: unitsOf(ordered) });
    let placed: Awaited<ReturnType<typeof createOrder.mutateAsync>>;

    // Only the order itself is guarded here: whatever throws before it is
    // sent frees the button too, and nothing after it reads as a failed order.
    try {
      // The number, not how it was typed: "099 123 456" and
      // "+598 99 123 456" sent again are the same request.
      const signature = JSON.stringify([
        ordered,
        normalizePhone(values.customerPhone),
      ]);
      placed = await createOrder.mutateAsync({
        customerName: values.customerName,
        customerPhone: values.customerPhone,
        items: ordered,
        locale,
        note: values.note,
        requestKey: checkoutRequestKey(signature),
      });
    } catch (error) {
      const kind = checkoutFailure(error);

      if (kind === "unexpected") {
        reportError(error, { action: "Checkout.place_order" });
      }

      if (kind === "stale") {
        onStale();
      }

      setFailure(checkoutErrorMessage(error, copy.errors));
      // Free for a retry; after a success the page moves on instead.
      inFlight.current = false;
      setConfirming(null);
      setSent(null);
      return;
    }

    try {
      onPlaced(placed.token, ordered);
    } catch (error) {
      // The order was taken; moving on to it failed. The key stays, so the
      // button sent again answers this same order instead of a second one.
      reportError(error, { action: "Checkout.show_order" });
      inFlight.current = false;
      setConfirming(null);
      setSent(null);
      return;
    }

    forgetCheckoutRequest();
  };

  return (
    <section
      aria-labelledby="store-checkout-title"
      className={cn("flex flex-col gap-4", className)}
      data-slot="store-checkout-form"
    >
      <h2
        className="font-display store-display-section leading-display font-extrabold uppercase"
        id="store-checkout-title"
      >
        {copy.checkout.title}
      </h2>
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            // Valid, it asks before anything is sent; invalid, the fields
            // say why and nothing opens.
            void form.handleSubmit((values) => {
              setConfirming(values);
            })(event);
          }}
        >
          <FormField
            control={form.control}
            name="customerName"
            render={({ field }) => (
              <FormItem>
                <StoreField label={copy.checkout.name}>
                  <FormControl>
                    <input
                      autoComplete="name"
                      className={cn(FIELD_CLASS, "h-12")}
                      enterKeyHint="next"
                      maxLength={ORDER_CUSTOMER_NAME_MAX_LENGTH}
                      required
                      {...field}
                    />
                  </FormControl>
                </StoreField>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="customerPhone"
            render={({ field }) => (
              <FormItem>
                <StoreField
                  hint={copy.checkout.phoneHint}
                  label={copy.checkout.phone}
                >
                  <FormControl>
                    <input
                      autoComplete="tel"
                      className={cn(FIELD_CLASS, "h-12")}
                      enterKeyHint="next"
                      inputMode="tel"
                      maxLength={ORDER_PHONE_MAX_LENGTH}
                      required
                      type="tel"
                      {...field}
                    />
                  </FormControl>
                </StoreField>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <StoreField label={copy.checkout.note}>
                  <FormControl>
                    <textarea
                      className={cn(FIELD_CLASS, "min-h-24 py-2")}
                      maxLength={ORDER_NOTE_MAX_LENGTH}
                      placeholder={copy.checkout.notePlaceholder}
                      {...field}
                    />
                  </FormControl>
                </StoreField>
              </FormItem>
            )}
          />
          {failure ? (
            <p
              className="flex items-start gap-2 border-2 border-store-foreground p-3 text-sm font-semibold"
              data-testid="store-checkout-error"
              role="alert"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {failure}
            </p>
          ) : null}
          {blockedReason ? (
            <p className="text-sm font-semibold" id="store-checkout-blocked">
              {blockedReason}
            </p>
          ) : null}
          <StoreButton
            aria-describedby={
              blockedReason ? "store-checkout-blocked" : undefined
            }
            // While it is sent the shopper waits, which is not "refused".
            className="w-full aria-disabled:cursor-wait aria-disabled:opacity-70"
            // `aria-disabled` while sending, not `disabled`: a button that
            // disables itself under the finger drops focus, and a failed
            // order leaves the shopper nowhere to retry from.
            aria-disabled={sending}
            data-testid="store-checkout-submit"
            disabled={!hydrated || blockedReason !== null}
            ref={submitButton}
            size="lg"
            type="submit"
          >
            {sending ? copy.checkout.submitting : copy.checkout.submit}
          </StoreButton>
        </form>
      </Form>
      {/* Outside the form: its buttons must never submit it. */}
      <StoreCheckoutConfirm
        name={confirming?.customerName ?? ""}
        onBack={() => {
          setConfirming(null);
        }}
        onConfirm={() => {
          if (confirming) {
            void placeOrder(confirming);
          }
        }}
        open={confirming !== null}
        phone={confirming?.customerPhone ?? ""}
        returnFocus={submitButton}
        sending={sending}
        total={sent ? sent.total : total}
        units={sent ? sent.units : unitsOf(items)}
      />
    </section>
  );
}

export { StoreCheckoutForm };
