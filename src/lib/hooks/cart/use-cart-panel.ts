"use client";

import { createContext, use } from "react";

/** What adding did, when adding is what opened the panel. */
export interface CartPanelAdded {
  /** Said politely as the panel opens. */
  message: string;
  /** The article just added: its line is marked for a moment. */
  productId: number;
}

export interface CartPanelOptions {
  added?: CartPanelAdded;
  /** What opened it, where focus goes back when it closes. */
  returnFocus?: HTMLElement | null;
}

export interface CartPanelControls {
  isOpen: boolean;
  open: (options?: CartPanelOptions) => void;
}

/** Provided by the store's frame (`organisms/store-cart-panel`). */
export const CartPanelContext = createContext<CartPanelControls | null>(null);

/**
 * The cart's side panel of the store page this sits in (FER-045): whether it
 * is open, and a way to open it. `null` outside a store page's frame (a
 * header shown on `/design`), where the cart is only its page's link.
 */
export function useCartPanel(): CartPanelControls | null {
  return use(CartPanelContext);
}
