# CI, pull requests and git hooks

Read this before you open or merge a pull request, or change `.github/` or `.husky/`. Changing a workflow is ask-first (`AGENTS.md` § Safety and permissions).

## Pipeline

- `.github/workflows/ci.yml` runs on every pull request except those into `main`, and on every push to `qa` and `hotfix/**`.
- Shape: Static Checks, Unit Tests, Integration Tests and Build start together. There is no setup job: each job runs `pnpm install --frozen-lockfile --prefer-offline` on setup-node's pnpm store cache. E2E waits for Build (it runs that build) and Static Checks (the cheapest signal); unit and integration tests run beside it, and only the gate waits for them. Gitleaks runs on its own.
- Static Checks runs `pnpm check`, `pnpm typecheck` (app and e2e), `playwright test --list` (loads every spec without a browser or server, `PLAYWRIGHT_SKIP_SERVER=true`, so a broken e2e import fails before the build) and the ratchet baseline step.
- Integration and e2e jobs get a Postgres service, `postgres:18.6` on Debian like `docker-compose.base.yaml` (alpine sorts text differently), with durability off and a 2 s health check, and run `pnpm db:migrate` first. Bump the tag in all three places together.
- **Build → e2e:** Build uploads `.next/standalone`, `.next/static` and `public/` as the `next-runtime` artifact (kept one day; never all of `.next`, whose `cache/` is hundreds of MB). E2E boots it with `node .ci/next-runtime/server.js`, which the Playwright config reads from `PLAYWRIGHT_SERVER_COMMAND`.
- **E2E** runs as one job in `mcr.microsoft.com/playwright:v<version>-noble`, browsers included. The tag must equal the exact `@playwright/test` pin: Dependabot bumps only the package, and `scripts/check-playwright-pin.sh` (run by `pnpm check`) fails until both match, so bump them together. Shard it once its test step passes about 5 minutes.
- **Actions cache** (10 GB, evicted least-recently-used): no key holds a SHA or a run id, and no key hashes source files. The Next compiler cache is keyed on OS, arch, lockfile and date, restored only for the same lockfile and saved only by `qa` pushes.
- **Artifacts** upload on failure only (the e2e HTML report, with traces), except the one-day build hand-off. Never upload `coverage/`: the thresholds fail the job in place.
- **Scope:** `Classify Changes` lists the PR's files. When every file, on both sides of a rename, is `*.md` or under `docs/`, `.agents/`, `.claude/`, `.cursor/`, `.vscode/` or `.superset/`, the runtime jobs (unit, integration, build, e2e) skip. An empty list, or one at the API's 3000-file ceiling, runs everything; pushes and manual runs always run everything.
- **Drafts** run Static Checks and Gitleaks only, and `CI Success` fails with a "deferred" message, so skipped tests never read as merge approval. Marking the PR ready starts the full run. Iterate on a draft.
- **`CI Success` is the single gate** (`if: always()`, results read through `env`). Classify Changes, Static Checks and Gitleaks must succeed on every run. On the full path every runtime job must succeed; on the light path each must be exactly `skipped` (one that ran, even green, means the classifier and the job conditions disagree). An unknown scope fails. A new job goes in its `needs:` and in its script.
- Classifier and gate logic live in `ci.yml` and run for real in `.github/scripts/ci-policy.test.mjs` (`node --test`, part of `pnpm check`). Change them together.

## Deployments

- Vercel deploys through its Git integration; no workflow deploys `qa` or `main`. `vercel.json` `git.deploymentEnabled` deploys `qa` and `main` only (`"**": false`, Dependabot branches never). Vercel reads it from the pushed commit, so an old branch keeps the old policy until it merges `qa`.
- `scripts/vercel-ignore.sh` (`ignoreCommand`) skips a non-production deployment when every changed path is inert: docs and `*.md`, tests, `src/e2e/`, `src/test/`, `src/server/test/`, workflows, agent and editor config. It fails open: production, a missing or unreachable previous SHA, a failed or empty diff all build. Exit codes are inverted (1 builds, 0 skips). After changing its list, run `bash scripts/vercel-ignore.sh --self-test`.

## Previews

- **Opt in:** a same-repository PR into `qa` that is open, ready for review and labeled `deploy:preview` gets a Vercel preview of its head on every push (`deploy-preview.yml`). Labeling, or marking a labeled draft ready, requests one for the current head. Nothing waits for CI: a failed Vercel build is Vercel's verdict on that commit. Remove the label to stop; existing previews stay.
- **Retry, Dependabot, hotfix:** Actions → Preview Deployment → Run workflow on `qa` with the PR number. That is also how a labeled `hotfix/*` PR into `main` gets a preview, and how a labeled Dependabot PR does (runs that Dependabot triggers get no secrets). A queued, building or ready deployment of the same commit is reused.
- **Trust:** `pull_request_target` and the dispatch run the reviewed workflow on `qa`; it never checks out, installs or runs PR code. A burst of pushes collapses onto the last (per-PR concurrency, cancel in progress), and each run re-reads the PR head right before deploying.
- **Database:** every preview build runs `pnpm db:migrate` against the database in Vercel's Preview environment. Point it at a disposable database, never a shared one, and check the first preview before relying on it. The Neon module gives each preview its own database branch and deletes it on close (`docs/agents/database.md` § Preview databases).
- **Setup, once per repository:**
  1. Create the `deploy:preview` label.
  2. Create a GitHub environment `preview` whose deployment branches admit only `qa`, with the secret `VERCEL_PREVIEW_TOKEN`: a Vercel token with access to this project only. Never a repository secret, and never shared with another tool (remote cache, CLI): a `pull_request` run can read every repository secret.
  3. Add the repository variables `VERCEL_PROJECT_ID` and `VERCEL_TEAM_ID` (Vercel project settings).
  4. Without them, an eligible request fails with these instructions; ineligible PRs are unaffected.
- `node --test ".github/scripts/*.test.mjs"` runs the workflow's real script against fake GitHub and Vercel APIs. Run it and `actionlint` after changing the workflow.

## Releases

- `qa → main` only. `auto-promotion-pr.yml` opens `chore(release): promote qa to main` on every push to `qa` when `qa` holds content `main` lacks and none is open. It never merges. Merge it with a merge commit.
- **Merge gates:** PRs into `qa` merge on a green `CI Success`; PRs into `main` on a green `Promotion Verified`. The names differ on purpose: a green `ci.yml` push run on the same commit must never stand in for a failed verification. Both branches also require `visual-proof` (`pr-visual-proof.yml`): a PR that touches files affecting the interface needs an image or a recording in its description, or the "No visible change" box ticked. Promotions and merge-backs pass it without one, since each change was shown in its own PR. Both also require `pr-description` (`pr-description.yml`): a Conventional Commits title of 72 characters or fewer, every heading of the PR template and a filled `Model: · Harness:` line; promotions and merge-backs are checked on the title only, and bot PRs on the title's type prefix only (Dependabot capitalises "Bump" and writes long titles). GitHub enforces a gate only as a required check in branch protection: here `qa` requires `CI Success`, `visual-proof` and `pr-description`, `main` requires `Promotion Verified`, `visual-proof` and `pr-description`, pull requests only, for admins too. The repository is public, which is what lets GitHub Free protect it; made private without a paid plan, the protection stops applying and whoever merges checks the gate on the exact head (§ Merge hygiene).
- `promotion-verification.yml` publishes `Promotion Verified` for PRs into `main` and pushes to it without rerunning the suite: the tree the merge produces (`git merge-tree --write-tree`) must be the tree of a `qa` commit whose `ci.yml` push run passed. A conflict, a fork, any other branch pair or a `main` that moved during the check fails it.
- PRs reach it through `pull_request_target`, so GitHub runs the reviewed copy on the default branch (`qa`), never the PR's: a hotfix branch cannot rewrite its own verifier. It only fetches the PR's commits as git objects, never checks them out or runs them. GitHub attributes the run to `qa`'s tip, so read the verdict on the PR, not on a commit page. Pushes to `main` run `main`'s copy, which arrives with the first release that carries it. A push to `main` before that release has no verifier: check it by hand against `qa`'s green run.
- **Hotfix lane**, only when `qa` cannot carry the fix (`git log origin/main..origin/qa` is not empty): branch `hotfix/<slug>` off `main`; its push runs the full `ci.yml`; open the PR into `main` and merge it with a merge commit. Verification accepts it while `main` is an ancestor of the branch, and on the push while the landed tree is the tested one. CodeRabbit reviews only PRs into `qa`: comment `@coderabbitai review`.
- The push to `main` then opens `chore(release): merge main back into qa` (only when `main` holds content `qa` lacks). Merge it with a merge commit before the next release: until then the release cannot verify.
- Bot identity: both PRs are opened with the org GitHub App token, so their checks start. Without the App the workflow falls back to `GITHUB_TOKEN` and comments on the PR: close and reopen it to start its checks.

## Checks

- `pnpm check` runs its pieces through `scripts/run-parallel.sh` (after the runner's own `--self-test`): `check:structure` and `check:ratchet` (§ Structure and ratchets), `knip`, `check:lint` (type-aware oxlint, oxfmt) and `check:scripts`. Every piece runs to the end and every failure is reported together; the slowest piece goes last. CI's Static Checks job runs it as `turbo run check typecheck`.
- **`pnpm typecheck` runs tsrs; `next build` and editors run `tsc`.** tsrs (`oxc-project/tsrs`) is a Rust port of the TypeScript 7 compiler: about 3x faster and about 60% less memory than `tsc --noEmit` on this tree. Both are clean on the tree, and on a scratch file with eight deliberate errors they printed identical diagnostics; that is a spot check, not proof of parity, and upstream records known gaps in its `docs/COMPATIBILITY.md`. Each tsrs release targets one TypeScript version, written into its version string (`0.20.1-ts7.1.0-beta` targets 7.1 beta), which can be ahead of the pinned `typescript`; Dependabot keeps the two in the `tooling` group, which batches their updates but does not lock them together: a tsrs-only bump can still widen the gap, and the Build job's `tsc` pass is what covers it. `next build` still type-checks with the pinned `typescript` package (Next cannot be pointed at another checker), so the Build job checks with the official compiler too, and a disagreement cannot ship. If `pnpm typecheck` and `pnpm build` disagree about an error, trust `tsc` and report the case upstream to tsrs. On errors tsrs exits 2, not 1; nothing here compares the exit code beyond non-zero.
- `pnpm verify` is `turbo run check typecheck test:unit --continue`: the local definition of done. Every task runs to the end, and an unchanged tree replays from the cache in about a second (§ Turborepo cache).
- Never chain `A && B || C` in a `package.json` script: when `A` fails, `C` runs and its exit code wins, so a failing check can pass.
- **knip** fails on unused files and unused or unlisted dependencies. Delete what it reports. When something is used in a way knip can't see (a CSS `@import`, a string path), list it in `knip.jsonc` with the reason. Config files knip loads must load without env. `pnpm knip:exports` (unused exports and types) is advisory, not a gate.
- **Scripts test themselves:** each script in `scripts/` and `.github/scripts/` has a `--self-test` (or a `node --test` file) that `check:scripts` runs, so CI tests its own machinery. Count failures in the current shell: a helper in a piped subshell prints FAIL and still exits 0. Break the code once and watch the self-test fail before trusting it.
- **Shell:** `scripts/lint-sh.sh` runs `shellcheck -S warning` on its `CLEAN` list, the only list: lint-staged passes staged scripts through it and it keeps the listed ones. Add a script once it's clean.

## Linting and formatting

Ultracite's presets on oxlint (lint, type-aware) and oxfmt (format), configured in `oxlint.config.ts` and `oxfmt.config.ts`; mechanical style is their job.

- lint-staged runs the fast, syntax-only `ultracite fix` on staged files; the type-aware rules (floating and misused promises, deprecated APIs, unsafe `any`) run only in `pnpm check` and `pnpm fix`.
- Run a repo tool through its script or `pnpm exec`, never `pnpm dlx`: `dlx` fetches the newest release, not the version pinned in `package.json`.
- Fixers can be wrong. Read the diff of every `pnpm fix` and re-run it until the diagnostic count stops moving. Fix by hand what a fixer would change in behaviour: a promise passed to an event handler gets `void` inside a block (`onSubmit={(e) => { void handleSubmit(onSubmit)(e); }}`), and a callback returning `ReactNode` gets a return type instead of `async`. Never let `vitest/prefer-called-with` write a zero-argument `toHaveBeenCalledWith()`: pin the real arguments (a ratchet holds the zero-argument form at zero).
- Every rule turned off in `oxlint.config.ts` carries its reason and the violation count measured when it was turned off. Remove an entry only together with the fixes for its violations. A tooling bump that turns on new rules pins each one off with its count; adopt them one per PR.
- A one-off exception is `// oxlint-disable-next-line <rule> -- <reason>`, never a bare disable.
- Never run `ultracite init`: it rewrites `AGENTS.md` and the lint config.

## Turborepo cache

`check`, `typecheck`, `test:unit`, `test:unit:coverage` and `build` are turbo tasks (`turbo.json`): `pnpm verify`, the pre-push hook, `pnpm verify:ci` and CI's Static Checks, Unit Tests and Build jobs run them through `turbo run`, so a tree that already passed replays instead of re-running. Integration and e2e stay uncached. Three rules keep a replay honest; each broke a real cache first:

1. **`pnpm-workspace.yaml` declares no `packages:` list.** With one, turbo hashed the same tree two ways at random, so half the runs missed.
2. **A task hashes only the env it reads.** No `globalEnv`: each task lists what it reads in `env`; a value that changes per run without changing the result (a generated secret, telemetry) goes in `passThroughEnv`. Strict mode hides every other variable from the task, so a variable the task needs and doesn't declare fails the task instead of poisoning the cache.
3. **An output that embeds a native binary carries a machine discriminator.** `.next/standalone` traces this machine's sharp binary, and turbo hashes no platform, so `build` runs only through `scripts/turbo-build.sh`, which sets `BUILD_TARGET_ARCH` from `uname`. A bare `turbo run build` hashes it as unset.

- Keep `inputs` to what the task reads: an excluded file that the task does read replays a stale green. Never pass reporter or shard flags on the command line: turbo hashes them; put them in the tool's config.
- **Remote cache, optional:** set the repository secrets `TURBO_TOKEN` (a token used for nothing else, never the preview deploy token) and `TURBO_REMOTE_CACHE_SIGNATURE_KEY` (32+ random bytes; `remoteCache.signature` rejects unsigned artifacts), and the variable `TURBO_TEAM`. Without them CI uses a local, per-run cache. Only push runs (`qa`, `hotfix/**`) receive the token and the signature key: a PR's code could otherwise write entries that later `qa` runs replay, and the HMAC key that verifies a read can also sign one. PR runs cache locally. `build` never caches the `.env*` files Next copies into `.next/standalone`.
- The local cache lives in `.turbo/` (ignored; worktrees share the main checkout's), evicted after 14 days or 10 GB. `turbo.json` sets `agentGuidance: false`, so turbo never writes its managed block into `AGENTS.md`.

## Structure and ratchets

- **konsistent** (`konsistent.json`, `check:structure`) enforces the layout lint can't see: only the three component tiers; kebab-case component directories holding `x.tsx`, `x.test.tsx` and an `index.ts` that only re-exports; a barrel per schema and hook domain; hooks that never import the database or a service.
- **Ratchets** (`scripts/ratchets.json`, engine `scripts/ratchet.mjs`, `check:ratchet`) stop a rule from growing. Each rule has a baseline in `scripts/ratchets/`: a new violation fails, and the baseline may only shrink. After fixing sites, `pnpm ratchet:prune` lowers it; nothing adds to it. CI's Static Checks job also compares every baseline with the PR's base commit, so an entry added in the PR fails there.
- lint-staged runs both against the staged snapshot; `bash -c '<cmd>' --` swallows the file list so each runs once.
- **Adding a rule:** measure it on the whole tree first. When it flags correct code, fix the rule, not the code. A rule the tree already meets belongs in lint or konsistent (konsistent rules record their measured count in `description`); a ratchet is for one it breaks today. A ratchet rule needs `id`, `title`, `rationale`, `guardrail`, `fix`, `pattern`, `include`, `exclude` (list excluded subtrees one by one, never a whole layer) and `baseline`; `node scripts/ratchet.mjs --seed` then writes its first baseline.

## Git hooks

- **pre-commit** is fast: `lint-staged --hide-all` runs `ultracite fix` on the staged files and `scripts/lint-sh.sh` on staged scripts, then gitleaks scans the staged changes (`gitleaks` must be on your `PATH`). `--hide-all` also hides untracked files, so the checks see exactly what the commit contains.
- **pre-push** runs `pnpm verify` (typecheck, unit tests, `check`): what CI's Static Checks and Unit Tests jobs run, caught before the push.
- Hooks run the pinned binaries through `pnpm exec`, never `pnpm dlx`.
- Never bypass them with `--no-verify`. Fix what they report.

## Push discipline

- A push is the expensive unit: each one runs the whole pipeline, and the next push cancels the run in progress. Batch the fixups you would make in the next few minutes into one push.
- Reproduce a red run locally before pushing again (§ Merge hygiene). Don't force-push mid-review to dodge a run.
- The pre-push hook is not the gate: integration, e2e and build run only in CI, and most red runs fail there. After changing routing, auth or the schema, run `pnpm test:integration` and the affected e2e specs before you push.

## Pull requests

- Target `qa`. Nobody pushes to `qa` or `main` directly, and bots open their PRs against `qa`.
- One concern per PR, sized in production lines: tests and generated output do not count. At 500 production lines or more, the description says why the change cannot be split. If the description needs an "also", split the PR.
- `pr-summary.yml` keeps a block at the top of the body (production, test and generated lines, the size band, CodeRabbit's merge risk) and one `size:XS..XXL` label. Don't edit the block: every push rewrites it. It runs the scripts from the default branch, so a change to `.github/scripts/pr-summary*.mjs` takes effect once merged.
- Keep mechanical changes (a reformat, a rename, a moved file) in their own commit or PR, so a reviewer, human or bot, can read the change that matters. CodeRabbit skips a PR over its file limit (it depends on the plan; 300 when FER-001 hit it, and its "Review skipped" comment states the number): "no findings" there means "not reviewed". The `review-loop` skill says what to do when the PR cannot be smaller.
- Work that depends on an unmerged PR goes in a stacked PR (the `gh-stack` skill), planned bottom-up (schema, then services, then UI). Every layer names the merge order.
- Fill `.github/pull_request_template.md` (the `create-pr` skill does, following the `pr-description` skill) and end the body with `Model: … · Harness: …`.
- **Squash-merge into `qa`**: one commit per PR. Releases (`qa → main`) and merge-backs (`main → qa`) use a **merge commit**: a squash rewrites the promoted commits, so the next release diffs them again and conflicts. GitHub has no per-base default merge method, so whoever merges applies the rule.
- CodeRabbit (`.coderabbit.yaml`) restates `AGENTS.md`'s non-negotiable rules at the paths where they bite. It does not review Dependabot's pull requests (`auto_review.ignore_usernames`). A PR that changes such a rule updates its entry there.

## Merge hygiene

- **Merge only the final, reviewed head:** the head is the commit you last pushed, every bot review of that head has finished, and no review thread is open. `gh pr merge <number> --squash --match-head-commit <sha>` refuses when the head moved since you looked.
- **Never push to a merged branch.** Those commits never reach `qa`. Re-land them in a new PR that carries exactly those commits, names the original PR and gives a UTC timeline.
- **A review thread is fixed once the fix is in the base**, not when it is pushed: check with `git merge-base --is-ancestor <sha> origin/qa`. A security finding is fixed before the merge, never after.
- **Retarget stacked children before their parent merges.** A child merged into a parent branch that already landed is orphaned: GitHub says "Merged" and `qa` never gets it. Merge a stack bottom-up (`gh stack merge`), and after merging a PR whose base is not `qa`, check that its commit is reachable from `qa`.
- **A cancelled, skipped or missing CI run is not a pass.** Merge on a green `CI Success` for the exact head you merge, never on an earlier commit's result.
- **PRs that pass alone can break `qa` together** (a shared registry, the schema, a route map). When `qa` moved under your branch in the same area, update the branch and let CI run again. Merge one PR at a time.
- **A red CI run is a reproduction task, not a retry.** Find the mechanism locally before pushing again. When `qa` breaks after two merges, decide whose contract is intended before touching product code, and never weaken a security rule to satisfy a stale test.
- **Check the diffstat against the description.** A "tests only" or "comments only" PR that deletes production code is a red flag: resolving conflicts on a stale branch can silently revert a feature.

## Writing workflows

- Credentials that deploy or publish live in a GitHub Environment whose deployment branches admit only the branch that uses them, never in repository secrets: a `pull_request` run executes the workflow file from the PR branch and can read every repository secret.
- A job holding a write-scoped token never executes code from the PR head: it does not check out the PR, and the scripts it runs come from the default branch.
- No push `paths:` filter on `qa` or `main`: GitHub evaluates only the first 300 changed files, and a release merge routinely carries more.
- Concurrency for a bot or a deploy goes on the job, not the workflow: GitHub assigns the group before it evaluates `if:`, keeps one pending run per group and drops the older pending run, even with `cancel-in-progress: false`. A deploy deploys the branch tip.
- A `workflow_dispatch` that acts on a ref checks the ref and fails on the wrong one.
- An event caused by `GITHUB_TOKEN` starts no workflow (only `workflow_dispatch` and `repository_dispatch` are exempt). Automation whose PRs or merges must run CI acts through the org GitHub App (`vars.BOT_APP_ID`, `secrets.BOT_APP_PRIVATE_KEY`).
- A gate fails closed: a check that cannot read its data fails and says so, because "unknown" is never a pass. Test the pass, fail and unknown outcomes.
- When the Actions minutes or the artifact quota run out, every workflow stops. Debug artifacts upload on failure only.
