import { z } from "zod";

import { reportError } from "@/lib/errors/client";

const storedRequestSchema = z.object({
  key: z.uuidv4(),
  signature: z.string(),
});

// Where a request lives when the browser refuses session storage: this page
// only, which still covers a double tap and a retry without a reload.
const memory = new Map<string, string>();

function storageKey(storeSlug: string) {
  return `feria:checkout:${storeSlug}`;
}

function readStored(storeSlug: string): string | null {
  const key = storageKey(storeSlug);

  try {
    return window.sessionStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch (error) {
    reportError(error, { action: "Checkout.read_request" });
    return memory.get(key) ?? null;
  }
}

function writeStored(storeSlug: string, text: string | null) {
  const key = storageKey(storeSlug);

  if (text === null) {
    memory.delete(key);
  } else {
    memory.set(key, text);
  }

  try {
    if (text === null) {
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, text);
    }
  } catch (error) {
    reportError(error, { action: "Checkout.write_request" });
  }
}

/**
 * The request key for this checkout (FER-026): the one the last submit used
 * when it was for the same cart and phone (`signature`), else a new one.
 * Kept in the tab's session storage, so a reload after a lost answer still
 * sends the same key, and the server answers the order it already took
 * instead of taking a second one.
 */
export function checkoutRequestKey(
  storeSlug: string,
  signature: string
): string {
  const raw = readStored(storeSlug);
  let stored: z.infer<typeof storedRequestSchema> | null = null;

  try {
    const parsed = storedRequestSchema.safeParse(
      raw === null ? null : JSON.parse(raw)
    );
    stored = parsed.success ? parsed.data : null;
  } catch (error) {
    // Not JSON: anything on the device could have written it.
    reportError(error, { action: "Checkout.parse_request" });
  }

  if (stored?.signature === signature) {
    return stored.key;
  }

  const key = crypto.randomUUID();
  writeStored(storeSlug, JSON.stringify({ key, signature }));

  return key;
}

/** The order was taken: the next checkout is a new request. */
export function forgetCheckoutRequest(storeSlug: string) {
  writeStored(storeSlug, null);
}
