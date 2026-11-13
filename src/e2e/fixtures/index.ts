export { expect } from "@playwright/test";
export type { DbFixture } from "./db.fixture";
// `test` comes from the last link of the chain (user → db), so a spec that
// imports it gets every fixture.
export { test } from "./db.fixture";
export type { CreatedRows, Identity, UserFixtures } from "./user.fixture";
// For a spec that builds its own `browser.newContext()`: config `use` options
// do not reach a hand-made context, so TLS and the base URL are wired by hand.
export { IGNORE_HTTPS_ERRORS, requireBaseURL } from "./user.fixture";
