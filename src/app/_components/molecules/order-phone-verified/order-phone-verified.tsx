"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";

import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export interface OrderPhoneVerifiedProps {
  className?: string;
  verified: boolean;
}

/**
 * Whether the customer confirmed their phone, as an icon and the words
 * ("Phone confirmed: No"), never an icon or a color alone (FER-027).
 */
function OrderPhoneVerified({ className, verified }: OrderPhoneVerifiedProps) {
  const copy = useDictionary().admin.orders;
  const Icon = verified ? ShieldCheck : ShieldAlert;

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      data-slot="order-phone-verified"
      data-verified={verified}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {interpolate(copy.phoneVerified, {
        answer: verified ? copy.phoneVerifiedYes : copy.phoneVerifiedNo,
      })}
    </span>
  );
}

export { OrderPhoneVerified };
