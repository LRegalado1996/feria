import { createLoggerStorage } from "evlog/toolkit/storage";

// The slot `evlog/next` keeps the request logger in. The id is evlog's own;
// the test proves `withEvlog` writes to this exact storage.
const { storage } = createLoggerStorage("withEvlog() context", "evlog:next");

/**
 * The current request's wide-event logger, or `undefined` outside a request
 * wrapped in `withEvlog` (the RSC `caller`, a script, a test), so
 * `safeRequestLogger()?.set({ post: { op: "create", id } })` is safe anywhere.
 */
export function safeRequestLogger() {
  return storage.getStore();
}
