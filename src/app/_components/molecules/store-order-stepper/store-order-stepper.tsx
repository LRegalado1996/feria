import { OrderStepper } from "@/app/_components/molecules/order-stepper";
import type { OrderStatus } from "@/lib/schemas/order";

export interface StoreOrderStepperProps {
  className?: string;
  status: OrderStatus;
}

/**
 * The order's status on the shopper's page (FER-051): the admin's stepper,
 * read only, in the store's colors. Reached steps are moss with a lime
 * icon, the current one ink with an outline around it, the ones to come
 * dashed hairlines with a muted icon, and an order that could not be
 * delivered takes the last place in the store's one danger color. The
 * names are the display face's small labels.
 */
function StoreOrderStepper({ className, status }: StoreOrderStepperProps) {
  return (
    <OrderStepper
      className={className}
      classNames={{
        circle: {
          current:
            "border-store-foreground bg-store-foreground text-store-accent outline-2 outline-offset-3 outline-store-foreground",
          done: "border-store-contrast bg-store-contrast text-store-accent",
          failed:
            "border-store-danger bg-store-danger text-store-background outline-store-danger",
          upcoming:
            "border-dashed border-store-line bg-store-background text-store-muted",
        },
        connector: {
          done: "border-solid border-store-foreground",
          upcoming: "border-dashed border-store-line",
        },
        label: {
          current:
            "font-display font-extrabold text-store-foreground uppercase",
          done: "font-display font-extrabold text-store-foreground uppercase",
          failed: "text-store-danger",
          upcoming: "font-display font-extrabold text-store-muted uppercase",
        },
      }}
      status={status}
      tone="bare"
    />
  );
}

export { StoreOrderStepper };
