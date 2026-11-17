import { z } from "zod";

import { reportError } from "@/lib/errors/client";

const storedRequestSchema = z.object({
  key: z.uuidv4(),
  signature: z.string(),
});

/** Where the checkout's request lives: one per tab (FER-038: one store). */
const STORAGE_KEY = "feria:checkout";

// The request as this page last wrote it, kept only while session storage
// refuses to: from then on it outranks what storage still holds, which is
// older. `null` marks a request forgotten after its order was taken, so a
// removal storage refused cannot bring that request back; `undefined` is no
// copy, and storage is the record. A write storage takes again drops it.
let memory: string | null | undefined;

function readStored(): string | null {
  if (memory !== undefined) {
    return memory;
  }

  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch (error) {
    reportError(error, { action: "Checkout.read_request" });
    return null;
  }
}

function writeStored(text: string | null) {
  try {
    if (text === null) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, text);
    }

    memory = undefined;
  } catch (error) {
    reportError(error, { action: "Checkout.write_request" });
    memory = text;
  }
}

/**
 * The request key for this checkout (FER-026): the one the last submit used
 * when it was for the same cart and phone (`signature`), else a new one.
 * Kept in the tab's session storage, so a reload after a lost answer still
 * sends the same key, and the server answers the order it already took
 * instead of taking a second one. When storage refuses, the page keeps it,
 * which still covers a double tap and a retry without a reload.
 */
export function checkoutRequestKey(signature: string): string {
  const raw = readStored();
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
  writeStored(JSON.stringify({ key, signature }));

  return key;
}

/** The order was taken: the next checkout is a new request. */
export function forgetCheckoutRequest() {
  writeStored(null);
}
