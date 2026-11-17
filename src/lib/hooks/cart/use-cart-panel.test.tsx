import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import {
  CartPanelContext,
  type CartPanelControls,
  useCartPanel,
} from "./use-cart-panel";

function setup({ inFrame }: { inFrame: boolean }) {
  const controls: CartPanelControls = {
    isOpen: true,
    open: vi.fn<CartPanelControls["open"]>(),
  };

  function Frame({ children }: { children: ReactNode }) {
    return <CartPanelContext value={controls}>{children}</CartPanelContext>;
  }

  const { result } = renderHook(() => useCartPanel(), {
    wrapper: inFrame ? Frame : undefined,
  });

  return { controls, result };
}

describe("useCartPanel", () => {
  test("inside a store page's frame, answers the frame's panel", () => {
    const { controls, result } = setup({ inFrame: true });

    expect(result.current).toBe(controls);
  });

  test("outside one, answers null: the cart is only its page's link there", () => {
    const { result } = setup({ inFrame: false });

    expect(result.current).toBeNull();
  });
});
