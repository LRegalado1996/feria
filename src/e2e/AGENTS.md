# E2E tests

Scoped rules for `src/e2e/`. `CLAUDE.md` beside this file is a symlink to it. Selectors, file layout and commands: `docs/agents/testing.md` § E2E tests.

## Failure first

- `retries: 0`, locally and in CI. A retry-pass is a defect report thrown away: a race the retry hides ships. Never "fix" a failure by padding a timeout, adding a fixed wait or re-running until green.
- CI keeps a trace of every failed test (`trace: retain-on-failure`, with DOM snapshots) and a screenshot; no video, the trace has a screencast. It stops after 10 failures and ends the run before the job's time limit, so a broken boot still reports.
- The browser runs in `UTC` (`timezoneId`) and so do the runner, its workers and the app server it starts (`TZ`).
- A test that legitimately needs more than the 90 s budget calls `test.slow()`; the budget is not padded.

## One user per worker; own the rows you touch

Tests run fully parallel (`fullyParallel: true`; workers from `E2E_WORKERS`, else up to 4 and at most cores - 1 on CI). That is safe only because:

- **Each worker signs in as its own user.** `fixtures/user.fixture.ts` gets or creates `e2e-w<index>@example.com` through Better Auth's server API once per worker, signs it in over HTTP and keeps the cookies. `authenticatedPage` and the default `page` use them; `freshAuthenticatedPage` signs in anew (sign-out tests end only that session); `identity` says who the user is. There is no setup project. A spec that starts signed out sets `test.use({ storageState: { cookies: [], origins: [] } })`.
- **The feed is shared, so a spec asserts only on rows it created**, found by their full unique name (`HomePage.expectPost`, `getPostCards`), never at a position or by count of everything. Unique values come from `crypto.randomUUID()`.
- **Teardown deletes exactly what the test created**, in the `db` fixture (automatic for every test): rows it seeded (`db.seed.createPost`, `db.seed.createUser`, ids captured as each insert returns) and rows its pages created through the UI, read off the `post.create` and sign-up responses. Never by name prefix or `LIKE`: those match a parallel worker's rows. Never in a test-body `finally`.
- **A hand-made `browser.newContext()`** gets none of the config's `use` options: pass `baseURL: requireBaseURL(baseURL)` and `ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS` from `../fixtures`.
- **Better Auth's per-IP sign-in limit is off on the server Playwright starts** (`E2E_DISABLE_AUTH_RATE_LIMIT` in `webServer.env`, ignored on a production deploy): every worker signs in from one machine.
- **Shared state is the exception to design away first.** The feed is global, so a spec that needs many rows seeds them where they disturb nobody: the feed-page specs date their posts in 2000, at the bottom, instead of pushing another worker's fresh post off its first page. A spec that truly needs global or empty-database state gets a `*.serial.e2e.ts` name and its own `workers: 1` project that the parallel project depends on (so it runs first, once). Not the other way round: Playwright runs a dependency project in full under a file filter and never repeats it under `--repeat-each`. None needs one today.

## Readiness: wait for what the next step needs

Visible is not ready. A server-rendered control shows before React owns it, and a click or keystroke that lands first vanishes. `networkidle` proves nothing either (a polling page never idles), and a fixed wait passes on a fast machine and fails on a slow one. Both are ratchets held at zero (`e2e-networkidle`, `e2e-fixed-delay`).

- **Page loaded:** `page.goto()` then the page object's `waitForLoad()`, which waits for the page's own content (`loaded()`).
- **The language toggle's link** carries the query string only once React has read the URL (the prerendered shell is the same for every query): assert its `href` before clicking. After the switch the page left behind stays mounted and hidden with a toggle of its own, so target the visible one (`HomePage.getLocaleToggle()`).
- **First harmless open after a load** (a menu, a mode switch, a dialog): `BasePage.clickUntilVisible(trigger, ready)` (`fixtures/click-until-visible.ts`). It waits for the trigger once, outside the loop, then re-clicks only while `ready` is absent, each try bounded at 5 s. Never on a submit: a second submit commits twice.
- **A request that must happen:** `completeRpcAction(page, "/api/orpc/post/create", action, { input })` (`fixtures/complete-rpc-action.ts`, Better Auth paths too). It arms the response wait before acting, matches the path and the input, requires the status (200 unless you pass the refusal you expect) and the whole response. Then assert what rendered. A lost click then fails at the request, not as a missing element 60 s later.
- **A form React must own before you type:** wait for the control only React enables (the auth form's submit button, `HomePage.waitForAuthForm()`), or fill inside `toPass` until it is (`HomePage.fillPostContent`).
- **An absent result** is meaningful only after the operation that would have produced it completed and rendered.

## Three interaction races this suite is built around

- **Landed before ready.** The first interaction after a navigation hits a visible, not yet hydrated control and is silently lost; the test then waits out its whole timeout. Guard it as above.
- **Closed is not removed.** A dismissed dialog's overlay animates out separately and, while transparent, still intercepts clicks; its close autofocus fires late and steals focus. After closing the last dialog, `expectDialogRemoved(page, dialog)` (`fixtures/expect-dialog-removed.ts`) waits for the content and the `dialog-overlay` to be gone before the next interaction.
- **Controlled inputs drop fast keystrokes.** A character typed while React commits the previous one is lost: `type("15")` can yield `"1"`. `fill()` the whole value, or press one key at a time with an assertion between.

## Diagnosing a failure: find the mechanism, never re-roll

1. **Get a repro rate.** `pnpm e2e:ci <spec> --repeat-each=10`. "3 failures in 10" is a mechanism to find; "it failed once" is not anything yet. After the fix the same command, at 0 in N, is the proof.
2. **Rule out a starved machine.** Compare the failing run's per-test durations with a green one. Everything 3x slower is infrastructure; padding timeouts for it only hides the next real bug.
3. **Read the trace, not just the error.** `pnpm exec playwright show-trace <trace.zip>`: the DOM snapshots and the network log answer what the message cannot (two dialogs and one overlay; a request that never went).
4. **"Element not found"? Suspect the request.** A mutation refused by client validation and one that answered 500 both look like a missing element later. Find the request in the trace, or its absence.
5. **Instrument when the cause is invisible.** Patch the suspect DOM method in `page.evaluate` and log `new Error().stack` (a focus thief shows up this way). Remove the probes before committing.
6. **Prove the fix is falsifiable.** Revert it and watch the test go red under the same repro command, then restore. A test that passes with and without the fix documents nothing.

When a test fails in one environment only, suspect the environment first: the Postgres version, the libc's collation, a missing variable.

## Before pushing a change here

`pnpm typecheck` covers this tree, and CI runs `playwright test --list` (`PLAYWRIGHT_SKIP_SERVER=true`), which catches a method added to the wrong page object. Run the changed specs with `pnpm e2e:ci <spec>`, which uses a fresh database and a production build like CI.
