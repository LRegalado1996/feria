/**
 * The requests the browser signs for Vercel BotID (FER-026): placing an
 * order, through the oRPC endpoint the storefront calls. The server checks
 * the same procedure (`order.create`), so a request that skipped the
 * browser's script, the REST twin included, is refused on Vercel.
 */
export const BOT_PROTECTED_REQUESTS: { method: string; path: string }[] = [
  { method: "POST", path: "/api/orpc/order/create" },
];
