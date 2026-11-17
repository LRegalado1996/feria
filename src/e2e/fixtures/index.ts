export { expect } from "@playwright/test";
export type { DbFixture, SeededLogin } from "./db.fixture";
export { ordersHolding } from "./db.fixture";
export { STORE_SETTINGS, STORE_TEXTS } from "./store-settings";
export type { StoreEdit } from "./store.fixture";
// `test` comes from the last link of the chain (user → db → store), so a
// spec that imports it gets every fixture.
export { test } from "./store.fixture";
export { uniquePhone, uniqueTag } from "./unique";
export type { Identity, UserFixtures } from "./user.fixture";
// For a spec that builds its own `browser.newContext()`: config `use` options
// do not reach a hand-made context, so TLS and the base URL are wired by hand.
export { IGNORE_HTTPS_ERRORS, requireBaseURL } from "./user.fixture";
