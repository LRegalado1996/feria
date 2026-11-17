import { type APIRequestContext, expect } from "@playwright/test";

/**
 * Places an order as the storefront's checkout does, through its request,
 * for a spec whose subject is the admin, not the checkout (`tests/store/`
 * places them through the screens). The articles are the test's own, so the
 * db fixture deletes the order with them.
 */
export async function placeOrder(
  request: APIRequestContext,
  {
    customerName,
    customerPhone,
    productId,
  }: { customerName: string; customerPhone: string; productId: number }
): Promise<{ code: string; token: string }> {
  const response = await request.post("/api/orpc/order/create", {
    data: {
      json: {
        customerName,
        customerPhone,
        items: [{ productId, quantity: 1 }],
        locale: "es",
        requestKey: crypto.randomUUID(),
      },
    },
  });

  expect(response.status()).toBe(200);
  const { json } = (await response.json()) as {
    json: { code: string; token: string };
  };

  return json;
}
