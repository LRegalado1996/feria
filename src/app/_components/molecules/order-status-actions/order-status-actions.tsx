"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import { ConfirmDialog } from "@/app/_components/molecules/confirm-dialog";
import type { Dictionary } from "@/content";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  ORDER_MOVES,
  ORDER_STATUSES,
  type OrderStatus,
} from "@/lib/schemas/order";
import { cn } from "@/lib/utils";

type ActionsCopy = Dictionary["admin"]["orders"]["actions"];

/** A move back corrects a mistake: it goes to an earlier status. */
function isBack(from: OrderStatus, to: OrderStatus) {
  return ORDER_STATUSES.indexOf(to) < ORDER_STATUSES.indexOf(from);
}

function moveLabel(from: OrderStatus, to: OrderStatus, copy: ActionsCopy) {
  if (to === "packed") {
    return from === "received" ? copy.markPacked : copy.backToPacked;
  }

  const labels = {
    delivered: copy.markDelivered,
    received: copy.backToReceived,
    undeliverable: copy.markUndeliverable,
  } satisfies Record<Exclude<OrderStatus, "packed">, string>;

  return labels[to];
}

export interface OrderStatusActionsProps {
  className?: string;
  /** The order's code, named by the confirmation. */
  code: string;
  onMove: (to: OrderStatus) => void;
  /** The move on its way, if one is. */
  pendingMove: OrderStatus | null;
  status: OrderStatus;
}

/**
 * One button per move the order's status allows (`ORDER_MOVES`): the moves
 * forward first, the first of them the screen's main action, then the moves
 * back. "Couldn't deliver" asks first. While a move is on its way every
 * button is `aria-disabled`, not `disabled`, so the one tapped keeps focus;
 * once the order lands in its new status, focus goes to its first action.
 */
function OrderStatusActions({
  className,
  code,
  onMove,
  pendingMove,
  status,
}: OrderStatusActionsProps) {
  const { admin } = useDictionary();
  const copy = admin.orders;
  const [confirming, setConfirming] = useState(false);
  const group = useRef<HTMLFieldSetElement>(null);
  const undeliverableButton = useRef<HTMLButtonElement>(null);
  // The status a tap here moved the order from: once it lands elsewhere,
  // the button tapped is gone and focus needs a new home.
  const movedFrom = useRef<OrderStatus | null>(null);
  const moves = [
    ...ORDER_MOVES[status].filter((to) => !isBack(status, to)),
    ...ORDER_MOVES[status].filter((to) => isBack(status, to)),
  ];
  const pending = pendingMove !== null;

  useEffect(() => {
    if (movedFrom.current !== null && movedFrom.current !== status) {
      movedFrom.current = null;
      group.current?.querySelector("button")?.focus();
    }
  }, [status]);

  const move = (to: OrderStatus) => {
    movedFrom.current = status;
    onMove(to);
  };

  return (
    <fieldset
      className={cn("flex min-w-0 flex-wrap gap-2", className)}
      data-slot="order-status-actions"
      ref={group}
    >
      <legend className="sr-only">{copy.actions.label}</legend>
      {moves.map((to, index) => {
        let variant: "default" | "outline" | "secondary" = "outline";

        if (isBack(status, to)) {
          variant = "secondary";
        } else if (index === 0) {
          variant = "default";
        }

        return (
          <Button
            aria-disabled={pending || undefined}
            className="h-11 aria-disabled:opacity-50 md:h-9"
            data-move={to}
            key={to}
            onClick={() => {
              if (pending) {
                return;
              }

              if (to === "undeliverable") {
                setConfirming(true);
                return;
              }

              move(to);
            }}
            ref={to === "undeliverable" ? undeliverableButton : undefined}
            type="button"
            variant={variant}
          >
            {pendingMove === to
              ? copy.actions.pending
              : moveLabel(status, to, copy.actions)}
          </Button>
        );
      })}
      <ConfirmDialog
        confirmLabel={copy.undeliverable.confirm}
        description={interpolate(copy.undeliverable.description, { code })}
        onCloseAutoFocus={(event) => {
          // It has no trigger of its own: the button that opened it.
          event.preventDefault();
          undeliverableButton.current?.focus();
        }}
        onConfirm={() => {
          setConfirming(false);
          move("undeliverable");
        }}
        onOpenChange={setConfirming}
        open={confirming}
        title={copy.undeliverable.title}
      />
    </fieldset>
  );
}

export { OrderStatusActions };
