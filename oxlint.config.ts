import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

/**
 * Linter half of the Ultracite toolchain (oxlint + oxfmt).
 *
 * Every `off` below carries the reason it is off and the violation count
 * measured on this tree when it was turned off, so re-enabling one later is a
 * scoped PR. Remove an entry only together with the fixes for its violations.
 *
 * Type-aware rules run through `oxlint --type-aware`, which `pnpm check` and
 * `pnpm fix` pass. lint-staged does not: it stays on the fast syntax-only path.
 */

const RESTRICTED_BARREL_MESSAGE =
  "Import the component's or hook domain's own directory, not an aggregating barrel: an aggregate re-export drags every co-exported module's dependencies into the importer.";

// `@/app/_components/organisms`, `.../organisms/` and `.../organisms/index` all
// resolve to the same aggregate, and `no-restricted-imports` matches the
// specifier verbatim, so each spelling is listed: any one left out is a bypass.
const AGGREGATING_BARRELS = [
  "@/app/_components",
  "@/app/_components/atoms",
  "@/app/_components/molecules",
  "@/app/_components/organisms",
  "@/lib/hooks",
].flatMap((base) => [base, `${base}/`, `${base}/index`]);

const TEST_FILES = [
  "**/*.{test,spec}.{ts,tsx,js,mjs}",
  // Shared harness for the `node --test` workflow tests beside it.
  ".github/scripts/workflow-step.mjs",
  "src/test/**",
  "src/server/test/**",
  "src/e2e/**",
];

export default defineConfig({
  extends: [core, react, next, vitest, antiSlop],
  ignorePatterns: [...(core.ignorePatterns ?? [])],
  rules: {
    // ── House conventions, flipped from the Ultracite defaults ─────────────
    // AGENTS.md § Naming mandates `function AuthForm()`, where the preset wants
    // arrow components.
    "func-style": ["error", "declaration", { allowArrowFunctions: true }],
    "react/function-component-definition": [
      "error",
      { namedComponents: "function-declaration" },
    ],
    // `import type { X }` when every specifier is a type, inline `type` only
    // inside a mixed import. Under `verbatimModuleSyntax`, `import { type X }`
    // still emits `import "m"` at runtime; `no-import-type-side-effects` (on in
    // the preset) enforces that half, this rule the other.
    "typescript/consistent-type-imports": [
      "error",
      { fixStyle: "inline-type-imports", prefer: "type-imports" },
    ],
    // 25 violations, every one the convention above. The rule cannot express
    // "inline within a mixed import, top-level when all-type": `prefer-inline`
    // contradicts `no-import-type-side-effects`, `prefer-top-level` splits each
    // mixed import in two.
    "import/consistent-type-specifier-style": "off",
    // `== null` tests null-or-undefined in one comparison (Biome allowed it).
    eqeqeq: ["error", "always", { null: "ignore" }],
    // 0 violations. It bans the `== null` idiom the `eqeqeq` pin allows.
    "no-eq-null": "off",
    // Hoisted function declarations are the house idiom: a file reads
    // top-down, the component first and its helpers below.
    "no-use-before-define": [
      "error",
      { classes: false, functions: false, variables: true },
    ],
    // 252 violations. Sorting object literals is review noise and not always
    // safe: key order is observable, and it can break type inference.
    "sort-keys": "off",

    // ── Style deltas: never enforced here; each would be its own campaign ──
    // 66 violations. Adding `/u` changes regex semantics (escape validity, `.`
    // over astral planes): a behaviour change per site, not a rewrite.
    "require-unicode-regexp": "off",
    // 1 violation. Numbered groups are clear in short patterns.
    "prefer-named-capture-group": "off",
    // 4 violations, all methods of test doubles and page objects.
    "class-methods-use-this": "off",
    // 4 violations, all counters in tests and e2e loops.
    "no-plusplus": "off",
    // 3 violations, all e2e: posts seeded in order (their timestamps set the
    // feed order) and browser contexts closed one by one.
    "no-await-in-loop": "off",
    // 2 violations. `const first = pages[0]` is as clear as destructuring.
    "prefer-destructuring": "off",
    // 2 violations, a test and an e2e fixture reusing an outer name.
    "no-shadow": "off",
    // 10 violations: deferred and never-settling promises in tests and a
    // `setTimeout` sleep. `new Promise` is the only way to build either.
    "promise/avoid-new": "off",
    // 2 violations, both test doubles of a callback-style browser API.
    "promise/prefer-await-to-callbacks": "off",
    // 2 violations, both test helpers declared next to the tests using them.
    "unicorn/consistent-function-scoping": "off",
    // 1 violation. `(await x).y` is clear.
    "unicorn/no-await-expression-member": "off",

    // ── Fixers that change behaviour ───────────────────────────────────────
    // 18 violations. oxlint ignores upstream's `checkArguments` option, so the
    // fixer also strips a REQUIRED `undefined` argument
    // (`mockResolvedValue(undefined)`), which TypeScript then rejects.
    "unicorn/no-useless-undefined": "off",

    // ── React Compiler diagnostics: not defects ────────────────────────────
    // 1 violation (react-hook-form's `watch`). It reports a construct the
    // compiler cannot optimise, not a bug.
    "react/incompatible-library": "off",

    // ── anti-slop: on where free, off where it needs an adoption pass ──────
    // 33 violations. It bans `vi.mock()`, the sanctioned way to mock a module
    // (docs/agents/testing.md).
    "anti-slop/no-module-mocking": "off",
    // The `unknown`/widening family and the assertion-comment rule each need
    // their own adoption pass: 1, 8, 18, 13, 13, 17 and 55 violations.
    "anti-slop/no-conditional-empty-object-spread": "off",
    "anti-slop/no-known-value-widening": "off",
    "anti-slop/no-runtime-typeof": "off",
    "anti-slop/no-unknown-parameters": "off",
    "anti-slop/no-unknown-returns": "off",
    "anti-slop/no-unsafe-dictionary-type": "off",
    "anti-slop/require-safety-comment-for-type-assertion": "off",
    // The preset turns this off because its autofix loops against
    // `no-known-value-widening`; that rule is off here, so the pinch is gone.
    "typescript/consistent-indexed-object-style": "error",

    // ── Type-aware deltas ──────────────────────────────────────────────────
    // 25 violations. Every truthiness check would become an explicit
    // comparison: a behaviour-visible campaign of its own.
    "typescript/strict-boolean-expressions": "off",
    // `node:test`'s `test()` returns a promise the runner itself tracks and
    // reports on, so a top-level call has nothing to await either.
    "typescript/no-floating-promises": [
      "error",
      {
        allowForKnownSafeCalls: [
          { from: "package", name: "test", package: "node:test" },
        ],
      },
    ],

    "no-restricted-imports": [
      "error",
      {
        paths: AGGREGATING_BARRELS.map((name) => ({
          message: RESTRICTED_BARREL_MESSAGE,
          name,
        })),
      },
    ],
  },
  overrides: [
    {
      files: TEST_FILES,
      // An override's `rules` are honoured only for plugins the override
      // itself declares: without this list oxlint silently keeps the preset's
      // settings for every rule below.
      plugins: ["eslint", "typescript", "vitest"],
      rules: {
        // ── Vitest (the preset scopes its rules to test files) ─────────────
        // The preset's default is `it` inside `describe`; the house rule is
        // `test()` everywhere (docs/agents/testing.md § Test structure).
        "vitest/consistent-test-it": [
          "error",
          { fn: "test", withinDescribe: "test" },
        ],
        // `prefer-called-with` and `prefer-called-once` stay on as detectors
        // of argument-blind spies, but their fixers are wrong: `pnpm fix` and
        // lint-staged turn `toHaveBeenCalled()` into a zero-argument
        // `toHaveBeenCalledWith()` (the `zero-argument-called-with` ratchet
        // catches it) and `toHaveBeenCalledTimes(1)` into the equally blind
        // `toHaveBeenCalledOnce()`. Pin the arguments by hand.
        //
        // Rules that contradict the house test policy:
        // 35 and 27 violations. `toBe(false)` pins the value; `toBeFalsy()`
        // also passes for `0`, `""`, `null` and `undefined`.
        "vitest/prefer-to-be-falsy": "off",
        "vitest/prefer-to-be-truthy": "off",
        // 10 violations. Falsifiability wants every field asserted, not a cap.
        "vitest/max-expects": "off",
        // 95 violations. `describe` titles name the procedure or feature
        // (`"post.create"`), which a function reference cannot.
        "vitest/prefer-describe-function-title": "off",
        // 11 violations. A file about one thing needs no `describe`.
        "vitest/require-top-level-describe": "off",
        // 5 violations, and the fix changes behaviour: `mockReturnValue(x)`
        // hands every call the same object, `mockImplementation(() => x)` a
        // fresh one.
        "vitest/prefer-mock-return-shorthand": "off",
        // Style deltas, each a campaign of its own: `toEqual` is the house
        // assertion (103), `vi.fn()` without a type argument (75),
        // `vi.mock("m")` over `vi.mock(import("m"))` (62), `expect(await p)`
        // over `.resolves` (37).
        "vitest/prefer-strict-equal": "off",
        "vitest/require-mock-type-parameters": "off",
        "vitest/prefer-import-in-mock": "off",
        "vitest/prefer-expect-resolves": "off",
        // Mock plumbing is `any`/`unknown`-shaped by construction, and the
        // `mockCtx as never` cast lives here. In `src/` these stay on.
        // 17, 9, 9, 39 and 8 violations.
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-type-assertion": "off",
        "anti-slop/no-chained-type-assertions": "off",
        // 16 violations. `async () => value` is how a test double resolves to
        // a value: `promise-function-async` demands the `async`, and this rule
        // then wants an `await` there is nothing to put on.
        "require-await": "off",
      },
    },
    {
      // 4 and 4 violations. The workflow tests run under `node --test`
      // (`pnpm check:scripts`), not Vitest, whose preset matches `.test.mjs`.
      files: [".github/scripts/**/*.test.mjs"],
      plugins: ["vitest"],
      rules: {
        "vitest/no-import-node-test": "off",
        "vitest/prefer-importing-vitest-globals": "off",
      },
    },
    {
      // 6 and 4 violations. The ratchet engine is a verbatim upstream copy, so
      // the next copy diffs cleanly; every sort in it is on a fresh array of
      // strings, where in-place code-unit order is what it means.
      files: ["scripts/ratchet.mjs"],
      plugins: ["unicorn", "typescript"],
      rules: {
        "unicorn/no-array-sort": "off",
        "typescript/require-array-sort-compare": "off",
      },
    },
    {
      // 4 violations: Playwright fixtures call Playwright's `use`, not React's.
      files: ["src/e2e/fixtures/**"],
      plugins: ["react"],
      rules: { "react/rules-of-hooks": "off" },
    },
  ],
});
