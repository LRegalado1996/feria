"use client";

import {
  Inbox,
  LoaderCircle,
  type LucideIcon,
  Package,
  PackageCheck,
  X,
} from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/app/_components/atoms/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/app/_components/atoms/tooltip";
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

/** Where a step stands against the order's status. */
export type OrderStepState = "current" | "done" | "upcoming";

/** Classes for the stepper's parts, after the tone's own. */
export interface OrderStepperClassNames {
  /** A step's circle, by where it stands; `failed` adds to the detour's. */
  circle?: Partial<Record<OrderStepState | "failed", string>>;
  /** The line into a step, by whether the order got that far. */
  connector?: Partial<Record<"done" | "upcoming", string>>;
  /** The name under a circle; `failed` adds to the detour's. */
  label?: Partial<Record<OrderStepState | "failed", string>>;
}

/** What the admin passes to make the circles buttons. */
export interface OrderStepperMoves {
  /** The order's code, named by the confirmation. */
  code: string;
  /** Runs once the move is confirmed, never before. */
  onMove: (to: OrderStatus) => void;
  /** The move on its way, if one is. */
  pendingMove: OrderStatus | null;
}

export interface OrderStepperProps {
  className?: string;
  classNames?: OrderStepperClassNames;
  /**
   * Given, the stepper is the admin's: each circle is a button that moves
   * the order there, after a confirmation. Left out, it only shows.
   */
  moves?: OrderStepperMoves;
  status: OrderStatus;
  /**
   * `app` draws it in the admin's tokens; `bare` leaves every color to
   * `classNames` (the storefront's, `molecules/store-order-stepper`).
   */
  tone?: "app" | "bare";
}

type StepperCopy = Dictionary["common"]["orderStepper"];
type MoveCopy = Dictionary["admin"]["orders"];

const ICONS = {
  delivered: PackageCheck,
  packed: Package,
  received: Inbox,
  undeliverable: X,
} satisfies Record<OrderStatus, LucideIcon>;

// Each status's hue, in the status chip recipe (design.md § Color and
// surfaces), with a border of its own: the icon on its fill reads amber
// 6.4:1 / 10.4:1, blue 7.2:1 / 8.1:1, emerald 6.7:1 / 10:1, red 6.9:1 /
// 8.4:1, light / dark.
const APP_HUES = {
  delivered:
    "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  packed:
    "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  received:
    "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  undeliverable:
    "border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
} satisfies Record<OrderStatus, string>;

const APP_TONE = {
  circle: {
    // Not reached: grey and dashed, so it differs in shape too.
    upcoming: "border-dashed border-border bg-card text-muted-foreground",
    // Where the order is: a ring around its hue, beside the bold name.
    current: "ring-2 ring-foreground ring-offset-2 ring-offset-card",
  },
  connector: {
    done: "border-solid border-muted-foreground",
    upcoming: "border-dashed border-border",
  },
  label: {
    current: "font-semibold text-foreground",
    done: "text-foreground",
    failed: "text-red-600 dark:text-red-400",
    upcoming: "text-muted-foreground",
  },
} as const;

/** The circle, the same box whether it shows or moves. */
const CIRCLE_BASE =
  "relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border-2 [&_svg]:size-5";

/** The steps shown: the detour takes the last place once it happened. */
function stepsFor(status: OrderStatus): readonly OrderStatus[] {
  return [
    "received",
    "packed",
    status === "undeliverable" ? "undeliverable" : "delivered",
  ];
}

function stateOf(step: number, current: number): OrderStepState {
  if (step < current) {
    return "done";
  }

  return step === current ? "current" : "upcoming";
}

/** A move back corrects a mistake: it goes to an earlier status. */
function isBack(from: OrderStatus, to: OrderStatus) {
  return ORDER_STATUSES.indexOf(to) < ORDER_STATUSES.indexOf(from);
}

/** Focus to the step the order is at, where it goes when nothing else can. */
function focusCurrentStep(list: HTMLOListElement | null) {
  list
    ?.querySelector<HTMLElement>(
      '[aria-current="step"] [data-slot="order-stepper-circle"]'
    )
    ?.focus();
}

function canMove(from: OrderStatus, to: OrderStatus) {
  return ORDER_MOVES[from].includes(to);
}

/**
 * What a circle as a button does, in words: its accessible name and its
 * tooltip alike. The status's own name is always in it, as it is under
 * the circle.
 */
function moveName(
  from: OrderStatus,
  to: OrderStatus,
  pendingMove: OrderStatus | null,
  copy: MoveCopy,
  names: StepperCopy["statuses"]
) {
  const status = names[to];

  if (pendingMove === to) {
    return interpolate(copy.stepper.pending, { status });
  }

  if (to === from) {
    return interpolate(copy.stepper.current, { status });
  }

  if (!canMove(from, to)) {
    return interpolate(copy.stepper.blocked, { status });
  }

  return interpolate(
    isBack(from, to) ? copy.stepper.back : copy.stepper.forward,
    {
      status,
    }
  );
}

/**
 * An order's status at a glance (FER-051): Recibido → Preparado →
 * Entregado, circles joined by a line, an icon in each and the status's
 * name under it; an order that could not be delivered takes the last place
 * in red with an ✕. The steps reached take their color, the ones to come
 * stay grey and dashed, the current one is ringed, named in bold and
 * `aria-current="step"`; the list's name says the status in words, and each
 * step says whether it is done, current or to come. Across on a computer,
 * down on a phone.
 *
 * With `moves` (the admin), every circle is a button: the moves the order's
 * status allows (`ORDER_MOVES`, a step back included) ask first in a dialog
 * and only then call `onMove`; the others are `aria-disabled`, their reason
 * in their name and their tooltip. Under the last step a smaller control
 * offers the detour, "No se pudo entregar", by the same rules. While a move
 * is on its way every control is `aria-disabled`, so focus stays put.
 */
function OrderStepper({
  className,
  classNames,
  moves,
  status,
  tone = "app",
}: OrderStepperProps) {
  const { admin, common } = useDictionary();
  const copy = common.orderStepper;
  const steps = stepsFor(status);
  const current = steps.indexOf(status);
  const last = steps.length - 1;
  // The move asked about; kept while the dialog leaves, so its words hold.
  const [asking, setAsking] = useState<{ open: boolean; to: OrderStatus }>({
    open: false,
    to: "packed",
  });
  // The control that opened the dialog, where focus goes back on close.
  const opener = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const app = tone === "app";

  // The detour leaves the page once the order takes it. Holding focus as the
  // move lands, after the dialog closed, it would drop focus to the page:
  // the step the order reached takes it instead.
  useEffect(() => {
    if (
      status === "undeliverable" &&
      opener.current !== null &&
      !opener.current.isConnected &&
      document.activeElement === document.body
    ) {
      opener.current = null;
      focusCurrentStep(list.current);
    }
  }, [status]);

  const ask = (to: OrderStatus) => (event: MouseEvent<HTMLButtonElement>) => {
    if (
      !moves ||
      moves.pendingMove !== null ||
      to === status ||
      !canMove(status, to)
    ) {
      return;
    }

    opener.current = event.currentTarget;
    setAsking({ open: true, to });
  };

  const circleClass = (step: OrderStatus, state: OrderStepState) =>
    cn(
      CIRCLE_BASE,
      app && (state === "upcoming" ? APP_TONE.circle.upcoming : APP_HUES[step]),
      app && state === "current" && APP_TONE.circle.current,
      classNames?.circle?.[state],
      step === "undeliverable" && classNames?.circle?.failed
    );

  const labelClass = (step: OrderStatus, state: OrderStepState) =>
    cn(
      "text-xs",
      app && APP_TONE.label[state],
      app && step === "undeliverable" && APP_TONE.label.failed,
      classNames?.label?.[state],
      step === "undeliverable" && classNames?.label?.failed
    );

  const connectorClass = (reached: boolean) => {
    const state = reached ? "done" : "upcoming";

    return cn(app && APP_TONE.connector[state], classNames?.connector?.[state]);
  };

  const circle = (step: OrderStatus, state: OrderStepState) => {
    const Icon = moves?.pendingMove === step ? LoaderCircle : ICONS[step];
    const icon = (
      <Icon
        aria-hidden="true"
        className={cn(moves?.pendingMove === step && "animate-spin")}
      />
    );

    if (!moves) {
      return (
        <span
          aria-hidden="true"
          className={circleClass(step, state)}
          data-slot="order-stepper-circle"
        >
          {icon}
        </span>
      );
    }

    const name = moveName(
      status,
      step,
      moves.pendingMove,
      admin.orders,
      copy.statuses
    );
    const enabled =
      step !== status && canMove(status, step) && moves.pendingMove === null;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-disabled={enabled ? undefined : true}
            aria-label={name}
            className={cn(
              circleClass(step, state),
              "outline-none focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring",
              enabled ? "cursor-pointer hover:brightness-95" : "cursor-default"
            )}
            data-move={step}
            data-slot="order-stepper-circle"
            onClick={ask(step)}
            type="button"
          >
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
    );
  };

  // The detour, under the last step, while the order has not taken it.
  const detour = () => {
    if (!moves || status === "undeliverable") {
      return null;
    }

    const name = moveName(
      status,
      "undeliverable",
      moves.pendingMove,
      admin.orders,
      copy.statuses
    );
    const enabled =
      canMove(status, "undeliverable") && moves.pendingMove === null;
    const pending = moves.pendingMove === "undeliverable";

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-disabled={enabled ? undefined : true}
            aria-label={name}
            className="aria-disabled:cursor-default aria-disabled:opacity-50"
            data-move="undeliverable"
            data-slot="order-stepper-detour"
            onClick={ask("undeliverable")}
            size="sm"
            type="button"
            variant="outline"
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <X aria-hidden="true" />
            )}
            {copy.statuses.undeliverable}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{name}</TooltipContent>
      </Tooltip>
    );
  };

  const confirmation = () => {
    if (!moves) {
      return null;
    }

    const orders = admin.orders;
    const { to } = asking;
    const words = { code: moves.code, status: copy.statuses[to] };
    const undeliverable = to === "undeliverable";
    const back = isBack(status, to);
    let title = interpolate(orders.stepper.confirm.forwardTitle, words);
    let confirmLabel = interpolate(orders.stepper.confirm.forward, words);

    if (undeliverable) {
      title = orders.undeliverable.title;
      confirmLabel = orders.undeliverable.confirm;
    } else if (back) {
      title = interpolate(orders.stepper.confirm.backTitle, words);
      confirmLabel = interpolate(orders.stepper.confirm.back, words);
    }

    return (
      <ConfirmDialog
        confirmLabel={confirmLabel}
        confirmVariant={undeliverable ? "destructive" : "default"}
        description={
          undeliverable
            ? interpolate(orders.undeliverable.description, words)
            : interpolate(orders.stepper.confirm.description, words)
        }
        onCloseAutoFocus={(event) => {
          // It has no trigger of its own: the control that opened it.
          event.preventDefault();
          // The move landed first and took its control away (the detour):
          // the step the order reached instead.
          if (opener.current?.isConnected) {
            opener.current.focus();
          } else {
            opener.current = null;
            focusCurrentStep(list.current);
          }
        }}
        onConfirm={() => {
          setAsking({ open: false, to });
          moves.onMove(to);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setAsking({ open: false, to });
          }
        }}
        open={asking.open}
        title={title}
      />
    );
  };

  return (
    <div
      className={cn("w-full", className)}
      data-mode={moves ? "interactive" : "read-only"}
      data-slot="order-stepper"
      data-status={status}
      data-testid="order-stepper"
      data-tone={tone}
    >
      <ol
        ref={list}
        aria-label={interpolate(copy.label, {
          status: copy.statuses[status],
        })}
        className="flex flex-col md:flex-row md:items-start"
      >
        {steps.map((step, index) => {
          const state = stateOf(index, current);

          return (
            <li
              aria-current={state === "current" ? "step" : undefined}
              className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 md:flex md:min-w-0 md:flex-1 md:flex-col md:items-center md:gap-2"
              data-state={state}
              data-status={step}
              data-testid={`order-step-${step}`}
              key={step}
            >
              {index > 0 ? (
                // Across, from the circle before to this one.
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-5.5 right-[calc(50%+1.875rem)] left-[calc(-50%+1.875rem)] hidden border-t-2 md:block",
                    connectorClass(index <= current)
                  )}
                  data-slot="order-stepper-connector"
                />
              ) : null}
              <div className="flex flex-col items-center">
                {circle(step, state)}
                {index < last ? (
                  // Down, from this circle to the next.
                  <span
                    aria-hidden="true"
                    className={cn(
                      "my-1 h-6 border-l-2 md:hidden",
                      connectorClass(index < current)
                    )}
                  />
                ) : null}
              </div>
              <div className="flex flex-col items-start gap-2 self-start pt-3.5 md:items-center md:self-auto md:pt-0 md:text-center">
                <span
                  // The button's name already says it, with what it does.
                  aria-hidden={moves ? "true" : undefined}
                  className={labelClass(step, state)}
                  data-slot="order-stepper-label"
                >
                  {copy.statuses[step]}
                  {moves ? null : (
                    <span className="sr-only">, {copy[state]}</span>
                  )}
                </span>
                {index === last ? detour() : null}
              </div>
            </li>
          );
        })}
      </ol>
      {confirmation()}
    </div>
  );
}

export { OrderStepper };
