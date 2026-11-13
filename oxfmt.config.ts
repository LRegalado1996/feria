import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

// `sortTailwindcss` is declared as `boolean | SortTailwindcssConfig`, so the
// preset value has to be narrowed before its `functions` list can be reused.
const presetTailwind =
  typeof ultracite.sortTailwindcss === "object"
    ? ultracite.sortTailwindcss
    : {};

/**
 * Formatter half of the Ultracite toolchain. `printWidth` stays at the preset's
 * 80, the width Biome used, so the migration rewraps nothing.
 */
export default defineConfig({
  ...ultracite,
  // The preset's "never" joins every wrapped Markdown paragraph into one line,
  // which turns every later prose edit into an unreadable diff.
  proseWrap: "preserve",
  // Tailwind v4 declares its theme in CSS, so the class sorter needs the entry
  // stylesheet to order the project's own utilities, not only the built-ins.
  sortTailwindcss: {
    ...presetTailwind,
    stylesheet: "src/styles/globals.css",
  },
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    // drizzle-kit writes these itself; formatting them would fail
    // `pnpm check` after every `pnpm db:generate`.
    "src/server/db/drizzle/meta/**",
    // Workflow edits are ask-first; formatter churn in a workflow diff hides
    // the change actually being reviewed.
    ".github/workflows/**",
    // Vendored skills track an upstream copy (skills-lock.json); reformatting
    // them would make the next upstream diff unreadable.
    ".agents/skills/**",
  ],
});
