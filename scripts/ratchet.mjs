#!/usr/bin/env node
/**
 * Shrink-only ratchets for rules the tree already violates.
 *
 * A rule that flags existing files cannot be turned on: CI goes red on code
 * nobody is touching, so the rule is dropped and the guardrail stays prose. A
 * ratchet is the way out — freeze today's violations in a baseline, fail on any
 * NEW one, and let the list drain as those files get touched for other reasons.
 * A new violation fails even when it looks correct in isolation, because
 * "correct here" is what every grandfathered site also looked like.
 *
 * The baseline may only shrink. There is no flag that adds an entry: `--prune`
 * lowers counts and removes cleared files, and nothing else writes the file. To
 * get CI green, fix the code — the mechanism deliberately offers no other door.
 *
 * One thing is NOT a new violation: a re-KEYED one. An entry is
 * `path#symbol@fingerprint`, and the fingerprint hashes the two lines that
 * FOLLOW the site — so inserting a declaration above it, or reformatting its
 * neighbourhood, changes the key of a violation nobody touched. Rewriting that
 * key is allowed, and `--verify-baseline` prints it as `↷` rather than failing,
 * but only when the file's matched lines are byte-identical (modulo token order,
 * which a formatter owns) and the count is unchanged. Change the violating text
 * and it is an addition again; add one and the count check catches it. The
 * self-test carries both of those arms — it is the move rule's falsification,
 * not a demonstration that it works.
 *
 * This engine knows nothing about any particular project. Rules live in the
 * config (default `scripts/ratchets.json`); baselines live beside it.
 *
 *   node scripts/ratchet.mjs                 check every rule
 *   node scripts/ratchet.mjs --rule <id>     check one rule
 *   node scripts/ratchet.mjs --seed          create a rule's first baseline (refuses to overwrite)
 *   node scripts/ratchet.mjs --prune         shrink baselines to current reality
 *   node scripts/ratchet.mjs --self-test     prove the engine still ratchets
 *   node scripts/ratchet.mjs --verify-baseline <ref>
 *                                            reject a baseline that grew since <ref>
 */

// `.mjs` is outside the TypeScript program — tsconfig's `include` lists `.ts`,
// `.tsx`, `.cjs` and `.js`, and none of those globs match `.mjs`. So nothing in
// this file is type-checked and even `readFileSync` resolves to an `error`
// type; the `no-unsafe-*` family then reports the ABSENCE of type information
// on every line, not any unsafety it found. Nothing written inside this file
// can answer that — it is the program membership that is missing. Drop these
// once the tsconfig `include` grows an mjs glob.
// oxlint-disable typescript/no-unsafe-argument
// oxlint-disable typescript/no-unsafe-assignment
// oxlint-disable typescript/no-unsafe-call
// oxlint-disable typescript/no-unsafe-member-access
// oxlint-disable typescript/no-unsafe-return

import { execFileSync } from "node:child_process";
import {
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_CONFIG = "scripts/ratchets.json";

/**
 * A line that is only a comment may legitimately quote the banned idiom — the
 * guardrail text itself, or a note explaining why the site below is different.
 * Counting it would make documenting the rule an offence against it.
 */
const COMMENT_ONLY = /^\s*(?:\/\/|\/\*|\*|#)/;

/**
 * Sites keyed by their enclosing declaration rather than only by file, when the
 * rule supplies a `siteKeyPattern`.
 *
 * A per-file count alone can be defeated without moving the number: delete one
 * offending site and introduce another in the same file, and the total still
 * matches the baseline. Naming the enclosing symbol makes the swap visible,
 * because the new site answers to a different key. Renaming that symbol reads
 * as a new site too, which is the accepted cost: you are editing the function
 * anyway, so fixing the site inside it is a fair ask.
 */
function enclosingKey(lines, index, keyMatcher) {
  if (!keyMatcher) {
    return undefined;
  }
  for (let i = index; i >= 0; i -= 1) {
    keyMatcher.lastIndex = 0;
    const match = keyMatcher.exec(lines[i]);
    if (match) {
      return match.slice(1).find(Boolean);
    }
  }
  return undefined;
}

/**
 * The documented exemption comment sits on the FIRST LINE INSIDE the block, or
 * as a trailing comment on the line that opens it. Both forms are accepted and
 * nothing else is: the marker must be in a COMMENT and must be the first thing
 * in the block, so a catch that runs a statement first, or merely contains the
 * words in a string, is not excused.
 */
function isExempt(lines, index, marker) {
  if (!marker) {
    return false;
  }
  // A trailing comment on the opening line itself.
  const opening = lines[index];
  const commentStart = opening.indexOf("//");
  if (commentStart !== -1 && opening.slice(commentStart).includes(marker)) {
    return true;
  }
  // Otherwise the marker must be the FIRST thing in the block, and must be a
  // comment. A window that merely looked "somewhere near" would exempt a catch
  // that runs a statement and then mentions the marker, and would even accept
  // the words inside a string literal. Neither is a heartbeat.
  for (let i = index + 1; i < lines.length; i += 1) {
    if (lines[i].trim().length === 0) {
      continue;
    }
    return COMMENT_ONLY.test(lines[i]) && lines[i].includes(marker);
  }
  return false;
}

/**
 * A short, order-independent fingerprint of what the matched block actually
 * does, so two sites in one declaration are still two identities.
 *
 * Keying by enclosing symbol alone still aggregates: a symbol holding two
 * offending sites can lose one and gain another and hold its count. The first
 * two meaningful lines inside the block distinguish them. Two rather than the
 * whole body so that editing further down does not invalidate the identity, and
 * a site whose own opening lines change is one the author is already editing.
 */
function fingerprint(lines, index) {
  const meaningful = [];
  for (let i = index + 1; i < lines.length && i <= index + 8; i += 1) {
    const line = lines[i].trim();
    if (line.length === 0 || COMMENT_ONLY.test(lines[i]) || line === "}") {
      continue;
    }
    meaningful.push(line.replaceAll(/\s+/g, " "));
    if (meaningful.length === 2) {
      break;
    }
  }
  const body = meaningful.join(" ");
  // djb2, written with multiplication rather than shifts: the repo bans bitwise
  // operators, and this needs no cryptographic property, only stability.
  let hash = 5381;
  for (let i = 0; i < body.length; i += 1) {
    // Code UNITS, not code points: every fingerprint ever written sits in a
    // committed baseline, and `codePointAt` would hash an astral character
    // differently, silently invalidating those keys as new sites.
    // oxlint-disable-next-line unicorn/prefer-code-point
    hash = (hash * 33 + body.charCodeAt(i)) % 2_147_483_647;
  }
  return hash.toString(36).padStart(6, "0").slice(-6);
}

/** @returns {Map<string, number>} site key (empty for file level) to count. */
export function findSites(
  source,
  { pattern, flags = "g", exemptMarker, siteKeyPattern }
) {
  const matcher = new RegExp(
    pattern,
    flags.includes("g") ? flags : `${flags}g`
  );
  const keyMatcher = siteKeyPattern ? new RegExp(siteKeyPattern) : undefined;
  const lines = source.split("\n");
  const sites = new Map();

  for (const [index, line] of lines.entries()) {
    if (COMMENT_ONLY.test(line)) {
      continue;
    }
    matcher.lastIndex = 0;
    const hits = (line.match(matcher) ?? []).length;
    if (hits === 0) {
      continue;
    }
    if (isExempt(lines, index, exemptMarker)) {
      continue;
    }
    const symbol = enclosingKey(lines, index, keyMatcher);
    const print = fingerprint(lines, index);
    const key = symbol ? `${symbol}@${print}` : print;
    sites.set(key, (sites.get(key) ?? 0) + hits);
  }
  return sites;
}

/** Total occurrences in one file, ignoring how they are keyed. */
export function countMatches(source, rule) {
  let total = 0;
  for (const count of findSites(source, rule).values()) {
    total += count;
  }
  return total;
}

/**
 * The lines a rule actually matched, whitespace-normalised and sorted.
 *
 * This is what a violation IS, as opposed to how {@link findSites} names it: the
 * key carries a fingerprint of the two lines that FOLLOW the violation, so a
 * rename or an inserted declaration nearby — or a formatter that rewraps the
 * neighbourhood — re-keys a site nobody touched. Comparing matched text instead
 * tells a moved key apart from a new violation, which a key comparison cannot.
 */
export function matchedLines(source, { pattern, flags = "g", exemptMarker }) {
  const matcher = new RegExp(
    pattern,
    flags.includes("g") ? flags : `${flags}g`
  );
  const lines = source.split("\n");
  const found = [];
  for (const [index, line] of lines.entries()) {
    if (COMMENT_ONLY.test(line)) {
      continue;
    }
    matcher.lastIndex = 0;
    const hits = (line.match(matcher) ?? []).length;
    if (hits === 0 || isExempt(lines, index, exemptMarker)) {
      continue;
    }
    // Tokens, sorted, with their delimiters shaved off: a formatter is free to
    // reorder the words on a line — this migration's oxfmt sorts Tailwind
    // classes — and that must not read as a different violation. Quotes and
    // commas are stripped because they bind to whichever token happens to sit
    // at the edge, so a pure reorder would otherwise still compare unequal.
    // Substituting one token for another DOES still differ, which is what
    // separates `shadow-md` moving from `shadow-md` becoming `shadow-2xl`.
    const normalized = line
      .trim()
      .split(/\s+/)
      .map((token) => token.replaceAll(/^["'`,(]+|["'`,)]+$/g, ""))
      .sort()
      .join(" ");
    for (let i = 0; i < hits; i += 1) {
      found.push(normalized);
    }
  }
  return found.sort();
}

export function scanRule(rule, root) {
  const seen = new Set();
  for (const include of rule.include) {
    for (const match of globSync(include, { cwd: root })) {
      seen.add(match.split("\\").join("/"));
    }
  }
  const excluded = new Set();
  for (const exclude of rule.exclude ?? []) {
    for (const match of globSync(exclude, { cwd: root })) {
      excluded.add(match.split("\\").join("/"));
    }
  }

  // Entries are identified by `path#symbol@fingerprint`, or `path#fingerprint`
  // where no declaration matches. Everything downstream compares identifiers, so
  // the finer granularity costs the diff, prune and report paths nothing.
  const current = new Map();
  for (const file of [...seen].sort()) {
    if (excluded.has(file)) {
      continue;
    }
    const sites = findSites(readFileSync(path.join(root, file), "utf-8"), rule);
    for (const [key, count] of sites) {
      current.set(key ? `${file}#${key}` : file, count);
    }
  }
  return current;
}

export function parseBaseline(text) {
  const entries = new Map();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("\t");
    if (separator === -1) {
      throw new Error(
        `Malformed baseline line (expected "<count>\\t<path>"): ${line}`
      );
    }
    const count = Number(line.slice(0, separator));
    const file = line.slice(separator + 1).trim();
    if (!Number.isInteger(count) || count <= 0 || file.length === 0) {
      throw new Error(
        `Malformed baseline line (expected "<count>\\t<path>"): ${line}`
      );
    }
    entries.set(file, count);
  }
  return entries;
}

export function renderBaseline(rule, entries) {
  const total = [...entries.values()].reduce((sum, count) => sum + count, 0);
  const header = [
    `# ${rule.title}`,
    "#",
    `# ${rule.rationale}`,
    "#",
    "# This is a RATCHET: the list may only SHRINK. Do NOT add an entry to get",
    "# CI green — fix the site instead. After removing violations, run:",
    "#   pnpm ratchet:prune",
    "#",
    `# Guardrail: ${rule.guardrail}`,
    `# Fix:       ${rule.fix}`,
    "#",
    `# ${entries.size} file(s), ${total} occurrence(s) remaining.`,
    "",
  ].join("\n");
  const body = [...entries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([file, count]) => `${count}\t${file}`)
    .join("\n");
  return `${header}${body}${body.length > 0 ? "\n" : ""}`;
}

export function diffAgainstBaseline(current, baseline) {
  const added = [];
  const grown = [];
  const stale = [];
  for (const [file, count] of current) {
    const allowed = baseline.get(file);
    if (allowed === undefined) {
      added.push({ file, count });
    } else if (count > allowed) {
      grown.push({ file, count, allowed });
    } else if (count < allowed) {
      stale.push({ file, count, allowed });
    }
  }
  for (const [file, allowed] of baseline) {
    if (!current.has(file)) {
      stale.push({ file, count: 0, allowed });
    }
  }
  return { added, grown, stale };
}

/**
 * `path#symbol@fingerprint`, `path#fingerprint`, or a bare `path`, split into
 * the file and the identity the entry claims.
 */
function entryFile(entry) {
  const hash = entry.lastIndexOf("#");
  return hash === -1 ? entry : entry.slice(0, hash);
}

/**
 * The one comparison that makes "shrink-only" a property rather than a promise.
 *
 * Everything else here reads the baseline as given, so the file is only as
 * trustworthy as the diff that changed it: append an entry, or delete the file
 * and re-seed, and the working tree agrees with itself and the check passes. A
 * header comment does not stop that. This compares the proposed baseline
 * against the one at the merge base, where an entry that did not exist before,
 * or a count that went up, is a violation no matter how the file got that way.
 *
 * `isMoved(file)` decides whether an entry the base did not have is a re-KEYED
 * site rather than a new one. It is passed in rather than computed here so this
 * stays a pure comparison; `verifyOneBaseline` supplies the one that compares
 * the file's matched lines at the base ref against the working tree.
 *
 * @returns {{added: string[], grown: {entry: string, from: number, to: number}[], moved: {from: string, to: string}[]}}
 *   entries absent from the base baseline, entries whose count went up, and
 *   entries that only changed key.
 */
export function diffBaselines(proposed, base, isMoved = () => false) {
  const added = [];
  const grown = [];
  const moved = [];
  // The only keys a re-keyed entry can have come from: ones the base had and
  // the proposal dropped, in the same file, for the same count.
  const vacated = new Map();
  for (const [entry, count] of base) {
    if (!proposed.has(entry)) {
      const file = entryFile(entry);
      vacated.set(file, [...(vacated.get(file) ?? []), { count, entry }]);
    }
  }

  for (const [entry, count] of proposed) {
    const before = base.get(entry);
    if (before !== undefined) {
      if (count > before) {
        grown.push({ entry, from: before, to: count });
      }
      continue;
    }
    const file = entryFile(entry);
    const candidates = vacated.get(file) ?? [];
    const index = candidates.findIndex(
      (candidate) => candidate.count === count
    );
    if (index === -1 || !isMoved(file)) {
      added.push(entry);
      continue;
    }
    moved.push({ from: candidates[index].entry, to: entry });
    candidates.splice(index, 1);
  }
  return { added, grown, moved };
}

/**
 * The rule AS OF the base ref, found by id rather than by trusting the proposed
 * config. Two bypasses depend on this. Reading the proposed baseline path lets a
 * pull request rename the file, seed a fresh one, and have the comparison find
 * nothing at the base and wave it through as a new rule. Reading the proposed
 * pattern, include or exclude lets it weaken the rule until the offending sites
 * are invisible, prune the now-unseen entries, and pass on an empty baseline.
 * The base rule is the one with authority over what counts.
 */
function fileAtRef(ref, file, root) {
  try {
    return execFileSync("git", ["show", `${ref}:${file}`], {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    // Absent at the base ref: the file is new, so nothing in it can be a move.
    return undefined;
  }
}

function readFileIfPresent(file) {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return undefined;
  }
}

function configAtRef(ref, configPath, root) {
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${ref}:${configPath}`], {
        cwd: root,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    );
  } catch {
    return undefined;
  }
}

function ruleAtRef(ref, configPath, ruleId, root) {
  return (configAtRef(ref, configPath, root)?.rules ?? []).find(
    (rule) => rule.id === ruleId
  );
}

function baselineAtRef(ref, path, root) {
  try {
    return parseBaseline(
      execFileSync("git", ["show", `${ref}:${path}`], {
        cwd: root,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    );
  } catch {
    // Absent at the base ref: this rule is new, so its first baseline is by
    // definition all-new and there is nothing to compare against.
    return undefined;
  }
}

/**
 * Rules that existed at the base ref and are gone from this config.
 *
 * Iterating the PROPOSED rules alone can only check rules that still exist:
 * deleting `bare-catch`, or renaming its id, removes the enforcement and leaves
 * nothing for the per-rule loop to look at, while the scan reads the proposed
 * config too. Both checks then pass on a tree that no longer guards anything. A
 * ratchet may be retired, but not silently, in the change that benefits from it.
 */
function droppedRuleIds(ref, root, configPath, proposedRules) {
  const baseIds = (configAtRef(ref, configPath, root)?.rules ?? []).map(
    (rule) => rule.id
  );
  const proposedIds = new Set(proposedRules.map((rule) => rule.id));
  return baseIds.filter((id) => !proposedIds.has(id));
}

/** @returns true when this rule failed verification. */
function verifyOneBaseline(rule, ref, root, log, configPath) {
  // Whether a rule is new is decided by its ID at the base ref, never by whether
  // some file happens to sit at its baseline path. A new rule reusing an
  // existing path would otherwise be compared against a baseline written for a
  // different rule, with no base rule to rescan with.
  const baseRule = ruleAtRef(ref, configPath, rule.id, root);
  if (!baseRule) {
    log(`  • ${rule.id}: not present at ${ref}; treating this as a new rule.`);
    return false;
  }
  if (baseRule.baseline !== rule.baseline) {
    log(
      `  • ${rule.id}: baseline moved from ${baseRule.baseline} to ${rule.baseline}; comparing against the old path.`
    );
  }
  const base = baselineAtRef(ref, baseRule.baseline, root);
  if (!base) {
    log(`  • ${rule.id}: no baseline at ${ref}; treating this as its first.`);
    return false;
  }

  const proposed = readBaselineFile(path.join(root, rule.baseline));
  // A key is only a MOVE when the file's violations themselves are unchanged.
  // The key embeds a fingerprint of the two lines FOLLOWING the violation, so a
  // declaration inserted nearby — or a tree-wide reformat — re-keys sites nobody
  // touched. Comparing the matched lines is what tells those apart from a new
  // violation: adding one changes the multiset, so this cannot wave one through.
  const unchangedFiles = new Map();
  const isMoved = (file) => {
    if (!unchangedFiles.has(file)) {
      const before = fileAtRef(ref, file, root);
      const after = readFileIfPresent(path.join(root, file));
      unchangedFiles.set(
        file,
        before !== undefined &&
          after !== undefined &&
          matchedLines(before, baseRule).join("\n") ===
            matchedLines(after, baseRule).join("\n")
      );
    }
    return unchangedFiles.get(file) === true;
  };
  const { added, grown, moved } = diffBaselines(proposed, base, isMoved);

  // Shrinking is necessary but not sufficient. A rule can be weakened until its
  // sites stop matching, pruned to an empty baseline, and pass every check
  // above, because the numbers only went down. So the tree is rescanned with the
  // rule AS IT WAS, and anything that definition still finds has to be covered
  // by the baseline being proposed.
  const uncovered = [...scanRule(baseRule, root).keys()].filter(
    (entry) => !proposed.has(entry)
  );

  if (added.length === 0 && grown.length === 0 && uncovered.length === 0) {
    for (const { from, to } of moved) {
      log(`  ↷ ${rule.id}: ${from} → ${to} (same violations, re-keyed)`);
    }
    log(`  ✓ ${rule.id}: baseline only shrank against ${ref}.`);
    return false;
  }

  log(`::error title=Ratchet ${rule.id}::Baseline grew against ${ref}`);
  log(
    `✗ ${rule.id}: the baseline must only shrink, and must cover what the base rule finds.`
  );
  log("");
  for (const entry of added.slice(0, 20)) {
    log(`  ADDED    ${entry}`);
  }
  for (const { entry, from, to } of grown.slice(0, 20)) {
    log(`  RAISED   ${entry} (${from} → ${to})`);
  }
  for (const entry of uncovered.slice(0, 20)) {
    log(`  UNCOVERED ${entry}`);
  }
  if (uncovered.length > 0) {
    log("");
    log(
      `  ${uncovered.length} site(s) that the rule AS OF ${ref} still finds are`
    );
    log(
      "  absent from the proposed baseline. Weakening a rule and pruning what"
    );
    log("  it stops seeing is not the same as fixing anything.");
  }
  log("");
  log(`  Fix:       ${rule.fix}`);
  log(`  Guardrail: ${rule.guardrail}`);
  log("");
  log("  Editing the baseline, or deleting it and re-seeding, does not make a");
  log(
    "  new violation acceptable. It is the diff that is checked, not the file."
  );
  return true;
}

function reportDroppedRules(dropped, ref, log) {
  log(`::error title=Ratchet::Rule(s) removed since ${ref}`);
  log(`✗ ${dropped.join(", ")}: present at ${ref}, absent from this config.`);
  log("");
  log(
    "  Retiring a ratchet is deliberate, not a side effect of a config edit."
  );
  log(
    "  Restore the rule, or remove it in a change whose subject is removing it."
  );
  log("");
}

function verifyBaselines(rules, ref, root, log, configPath, proposedRules) {
  let failed = false;
  const dropped = droppedRuleIds(ref, root, configPath, proposedRules ?? rules);
  if (dropped.length > 0) {
    failed = true;
    reportDroppedRules(dropped, ref, log);
  }
  for (const rule of rules) {
    failed = verifyOneBaseline(rule, ref, root, log, configPath) || failed;
  }
  return failed ? 1 : 0;
}

function readBaselineFile(path) {
  try {
    return parseBaseline(readFileSync(path, "utf-8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return new Map();
    }
    throw error;
  }
}

function reportRule(rule, result, { prune }) {
  const { added, grown, stale } = result;
  const lines = [];
  let failed = false;

  if (added.length > 0 || grown.length > 0) {
    failed = true;
    lines.push(
      `::error title=Ratchet ${rule.id}::${rule.title}`,
      `✗ ${rule.id}: ${rule.title}`,
      "",
      `  ${rule.rationale}`,
      ""
    );
    for (const { file, count } of added) {
      lines.push(`  NEW      ${file} (${count})`);
    }
    for (const { file, count, allowed } of grown) {
      lines.push(`  GREW     ${file} (${allowed} → ${count})`);
    }
    lines.push(
      "",
      `  Fix:       ${rule.fix}`,
      `  Guardrail: ${rule.guardrail}`,
      "",
      "  The baseline cannot be extended to cover these. That is the point:",
      "  every file already on it looked just as reasonable when it was written."
    );
  } else if (stale.length > 0 && !prune) {
    // Stale entries fail too, so an improvement is banked instead of quietly
    // leaving headroom for the next regression to reoccupy.
    failed = true;
    lines.push(
      `::error title=Ratchet ${rule.id}::Baseline is out of date — run pnpm ratchet:prune`,
      `✗ ${rule.id}: ${stale.length} baseline entr(y/ies) now overstate the tree.`,
      ""
    );
    for (const { file, count, allowed } of stale.slice(0, 20)) {
      // A count of 0 must read as "clear", so the falsy branch is the point
      // here — `??` would print the 0 and hide that the file is now clean.
      // oxlint-disable-next-line typescript/prefer-nullish-coalescing
      lines.push(`  FIXED    ${file} (${allowed} → ${count || "clear"})`);
    }
    if (stale.length > 20) {
      lines.push(`  ... and ${stale.length - 20} more`);
    }
    lines.push(
      "",
      "  Run `pnpm ratchet:prune` and commit the baseline so the gain is locked in."
    );
  }
  return { failed, lines };
}

function loadConfig(configPath) {
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  if (!Array.isArray(config.rules) || config.rules.length === 0) {
    throw new Error(`${configPath}: expected a non-empty "rules" array`);
  }
  for (const rule of config.rules) {
    for (const field of [
      "id",
      "title",
      "rationale",
      "guardrail",
      "fix",
      "pattern",
      "baseline",
    ]) {
      if (typeof rule[field] !== "string" || rule[field].trim().length === 0) {
        throw new Error(
          `${configPath}: rule "${rule.id ?? "<unnamed>"}" is missing "${field}"`
        );
      }
    }
    if (!Array.isArray(rule.include) || rule.include.length === 0) {
      throw new Error(
        `${configPath}: rule "${rule.id}" needs a non-empty "include"`
      );
    }
  }
  return config;
}

export function run(argv, { root = REPO_ROOT, log = console.log } = {}) {
  const prune = argv.includes("--prune");
  // Seeding is the one write that may record a violation, so it is allowed
  // exactly once per rule: it refuses when the baseline already exists. Without
  // that guard `--seed` would be the "add an entry" door the ratchet must not
  // have — delete the file and re-seed and every regression since is absolved.
  const seed = argv.includes("--seed");
  const ruleIndex = argv.indexOf("--rule");
  const onlyRule = ruleIndex === -1 ? undefined : argv[ruleIndex + 1];
  const configIndex = argv.indexOf("--config");
  const configPath = path.join(
    root,
    configIndex === -1 ? DEFAULT_CONFIG : argv[configIndex + 1]
  );

  const verifyIndex = argv.indexOf("--verify-baseline");
  const verifyRef = verifyIndex === -1 ? undefined : argv[verifyIndex + 1];

  const config = loadConfig(configPath);
  const rules = onlyRule
    ? config.rules.filter((rule) => rule.id === onlyRule)
    : config.rules;
  if (rules.length === 0) {
    log(`No ratchet rule matches "${onlyRule}".`);
    return 2;
  }

  if (verifyRef) {
    return verifyBaselines(
      rules,
      verifyRef,
      root,
      log,
      path.relative(root, configPath),
      config.rules
    );
  }

  let failed = false;
  for (const rule of rules) {
    failed = processRule(rule, { root, log, prune, seed }) || failed;
  }
  return failed ? 1 : 0;
}

function totalOccurrences(entries) {
  return [...entries.values()].reduce((sum, count) => sum + count, 0);
}

function seedBaseline(rule, current, baselinePath, log) {
  if (existsSync(baselinePath)) {
    log(
      `✗ ${rule.id}: ${rule.baseline} already exists — seeding would absolve every violation added since. Use --prune.`
    );
    return true;
  }
  mkdirSync(path.dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, renderBaseline(rule, current), "utf-8");
  log(
    `  ${rule.id}: baseline seeded (${current.size} file(s), ${totalOccurrences(current)} occurrence(s)).`
  );
  return false;
}

function pruneBaseline(rule, current, baseline, baselinePath, log) {
  // Prune can only lower a count or drop a file: it writes the intersection of
  // baseline and reality, never the scan on its own. A regression the scan just
  // found is therefore not absorbed here — it still fails the report below.
  const pruned = new Map();
  for (const [file, allowed] of baseline) {
    const count = current.get(file) ?? 0;
    if (count > 0) {
      pruned.set(file, Math.min(allowed, count));
    }
  }
  writeFileSync(baselinePath, renderBaseline(rule, pruned), "utf-8");
  log(
    `  ${rule.id}: baseline pruned (${baseline.size} → ${pruned.size} files, ${baseline.size - pruned.size} cleared).`
  );
}

/** @returns true when the rule failed. */
function processRule(rule, { root, log, prune, seed }) {
  const current = scanRule(rule, root);
  const baselinePath = path.join(root, rule.baseline);

  if (seed) {
    return seedBaseline(rule, current, baselinePath, log);
  }

  const baseline = readBaselineFile(baselinePath);
  const result = diffAgainstBaseline(current, baseline);

  if (prune) {
    pruneBaseline(rule, current, baseline, baselinePath, log);
  }

  const { failed, lines } = reportRule(rule, result, { prune });
  if (failed) {
    for (const line of lines) {
      log(line);
    }
    return true;
  }
  if (!prune) {
    log(
      `  ✓ ${rule.id}: no new violations (${current.size} file(s), ${totalOccurrences(current)} remaining).`
    );
  }
  return false;
}

/* ------------------------------------------------------------------------- *
 * Self-test
 *
 * The engine has no unit-test home: vitest is rooted at `src/`, and moving
 * tooling under `src/` to be testable would be the tail wagging the dog. So the
 * engine proves itself on every run instead. Each case asserts a behaviour the
 * ratchet would be worthless without — most importantly that a NEW violation
 * fails and that `--prune` cannot absorb one.
 * ------------------------------------------------------------------------- */

const silently = () => undefined;

function selfTest(log = console.log) {
  const root = mkdtempSync(path.join(tmpdir(), "ratchet-selftest-"));
  const failures = [];
  let asserted = 0;
  const check = (name, actual, expected) => {
    asserted += 1;
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
      failures.push(
        `${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`
      );
    }
  };

  try {
    const write = (relativePath, contents) => {
      const full = path.join(root, relativePath);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, contents, "utf-8");
    };

    const rule = {
      id: "self-test",
      title: "Self-test rule",
      rationale: "Synthetic.",
      guardrail: "none",
      fix: "none",
      pattern: "BANNED",
      exemptMarker: "ratchet-allow",
      include: ["code/**/*.ts"],
      exclude: ["code/**/*.test.ts"],
      baseline: "baseline.txt",
    };

    write(
      "code/kept.ts",
      "function one() {\n  BANNED\n  alpha();\n  beta();\n}\nfunction two() {\n  BANNED\n  gamma();\n  delta();\n}\n"
    );
    write("code/fresh.ts", "function three() {\n  BANNED\n  gamma();\n}\n");
    write("code/clean.ts", "const d = 1;\n");
    write("code/excluded.test.ts", "const e = BANNED;\n");
    write(
      "code/commented.ts",
      "// BANNED is what we must not write\nconst f = 1;\n"
    );
    write("code/exempt.ts", "const g = BANNED; // ratchet-allow\n");

    const idsIn = (map, path) =>
      [...map.keys()]
        .filter((k) => k === path || k.startsWith(`${path}#`))
        .sort();
    const sum = (map) => [...map.values()].reduce((a, b) => a + b, 0);

    const scanned = scanRule(rule, root);
    check(
      "excludes test files",
      idsIn(scanned, "code/excluded.test.ts").length,
      0
    );
    check(
      "ignores comment-only lines",
      idsIn(scanned, "code/commented.ts").length,
      0
    );
    check(
      "honours the exempt marker",
      idsIn(scanned, "code/exempt.ts").length,
      0
    );
    check(
      "two sites in one file are two identities",
      idsIn(scanned, "code/kept.ts").length,
      2
    );

    // The marker belongs to the BLOCK, not to the line that opens it, and it has
    // to be a comment sitting FIRST. Anything looser exempts a catch that merely
    // mentions the words after doing something else.
    check(
      "a comment on the first body line exempts the site",
      findSites("try {\n} BANNED {\n  // ratchet-allow\n}", rule).size,
      0
    );
    check(
      "a trailing comment on the opening line exempts it too",
      findSites("} BANNED { // ratchet-allow\n  a();\n}", rule).size,
      0
    );
    check(
      "a statement before the marker does NOT exempt",
      findSites("} BANNED {\n  a();\n  // ratchet-allow\n}", rule).size,
      1
    );
    check(
      "the marker inside a string literal does NOT exempt",
      findSites('} BANNED {\n  log("ratchet-allow");\n}', rule).size,
      1
    );

    // A per-file total lets a file drop one offending site and gain another
    // while holding its number. Identity has to be finer than the file, and
    // finer than the enclosing declaration too, or the same trick works inside
    // one function.
    const keyed = {
      ...rule,
      siteKeyPattern: "^\\s*function\\s+([A-Za-z0-9_$]+)",
    };
    const twoFns =
      "function alpha() {\n  BANNED\n  a();\n}\nfunction beta() {\n  BANNED\n  b();\n}\n";
    const movedAcross =
      "function alpha() {\n}\nfunction beta() {\n  BANNED\n  b();\n  BANNED\n  c();\n}\n";
    const movedWithin =
      "function alpha() {\n  BANNED\n  z();\n}\nfunction beta() {\n  BANNED\n  b();\n}\n";
    const base = findSites(twoFns, keyed);
    check(
      "keys name the enclosing declaration",
      [...base.keys()].every(
        (k) => k.startsWith("alpha@") || k.startsWith("beta@")
      ),
      true
    );
    check(
      "a swap across declarations holds the total",
      sum(base),
      sum(findSites(movedAcross, keyed))
    );
    check(
      "but it is not the same identity",
      diffAgainstBaseline(findSites(movedAcross, keyed), base).added.length > 0,
      true
    );
    check(
      "a swap INSIDE one declaration holds the total",
      sum(base),
      sum(findSites(movedWithin, keyed))
    );
    check(
      "and that is caught too",
      diffAgainstBaseline(findSites(movedWithin, keyed), base).added.length > 0,
      true
    );
    check(
      "an unkeyed rule still identifies each site",
      findSites(twoFns, rule).size,
      2
    );

    // The baseline holds only kept.ts, so fresh.ts must read as an addition.
    const keptOnly = new Map(
      idsIn(scanned, "code/kept.ts").map((k) => [k, scanned.get(k)])
    );
    write("baseline.txt", renderBaseline(rule, keptOnly));
    const baseline = parseBaseline(
      readFileSync(path.join(root, "baseline.txt"), "utf-8")
    );
    const diff = diffAgainstBaseline(scanned, baseline);
    check(
      "a new file is an addition",
      diff.added.map((e) => e.file).sort(),
      idsIn(scanned, "code/fresh.ts")
    );
    check(
      "an unchanged file is neither",
      diff.grown.length + diff.stale.length,
      0
    );

    // Two identical sites in one declaration share an identity, so the count is
    // what moves: that is growth, not a new key.
    write(
      "code/kept.ts",
      "function one() {\n  BANNED\n  alpha();\n  beta();\n  BANNED\n  alpha();\n  beta();\n}\nfunction two() {\n  BANNED\n  gamma();\n  delta();\n}\n"
    );
    check(
      "growth on a listed site is caught",
      diffAgainstBaseline(scanRule(rule, root), baseline).grown.length,
      1
    );

    write(
      "code/kept.ts",
      "function one() {\n  BANNED\n  alpha();\n  beta();\n}\n"
    );
    check(
      "an improvement shows up as stale",
      diffAgainstBaseline(scanRule(rule, root), baseline).stale.length > 0,
      true
    );

    // Prune shrinks, and cannot launder the still-unlisted `fresh.ts`.
    write("config.json", JSON.stringify({ rules: [rule] }));
    const pruneCode = run(["--prune", "--config", "config.json"], {
      root,
      log: silently,
    });
    const afterPrune = parseBaseline(
      readFileSync(path.join(root, "baseline.txt"), "utf-8")
    );
    check(
      "prune drops the cleared site",
      afterPrune.size < baseline.size,
      true
    );
    check(
      "prune never adds a file",
      idsIn(afterPrune, "code/fresh.ts").length,
      0
    );
    check("prune still fails on the new violation", pruneCode, 1);

    // With the offender gone, a clean tree passes.
    rmSync(path.join(root, "code/fresh.ts"));
    check(
      "clean tree passes",
      run(["--config", "config.json"], { root, log: silently }),
      0
    );

    // Seeding is the only write that may record a violation, so the guard on it
    // is load-bearing: without this arm, deleting a baseline and re-seeding
    // would absolve every regression since it was written.
    check(
      "seed refuses when the baseline exists",
      run(["--seed", "--config", "config.json"], { root, log: silently }),
      1
    );
    const beforeReseed = readFileSync(path.join(root, "baseline.txt"), "utf-8");
    run(["--seed", "--config", "config.json"], { root, log: silently });
    check(
      "a refused seed leaves the baseline untouched",
      readFileSync(path.join(root, "baseline.txt"), "utf-8"),
      beforeReseed
    );

    // ...and that it does write, once, when there is nothing to overwrite.
    rmSync(path.join(root, "baseline.txt"));
    write("code/fresh.ts", "function three() {\n  BANNED\n  gamma();\n}\n");
    check(
      "seed writes a first baseline",
      run(["--seed", "--config", "config.json"], { root, log: silently }),
      0
    );
    const seeded = parseBaseline(
      readFileSync(path.join(root, "baseline.txt"), "utf-8")
    );
    check("the seeded baseline records the tree as found", sum(seeded), 2);

    // The shrink-only property is a claim about the DIFF, not about the file as
    // it stands. Without this comparison, appending an entry or deleting and
    // re-seeding launders a fresh violation past every check above.
    const priorBaseline = new Map([["code/kept.ts#aaaaaa", 2]]);
    check(
      "an appended entry is rejected against the base ref",
      diffBaselines(
        new Map([...priorBaseline, ["code/new.ts#bbbbbb", 1]]),
        priorBaseline
      ).added,
      ["code/new.ts#bbbbbb"]
    );
    check(
      "a raised count is rejected too",
      diffBaselines(new Map([["code/kept.ts#aaaaaa", 3]]), priorBaseline).grown,
      [{ entry: "code/kept.ts#aaaaaa", from: 2, to: 3 }]
    );
    check(
      "shrinking is allowed",
      diffBaselines(new Map([["code/kept.ts#aaaaaa", 1]]), priorBaseline),
      { added: [], grown: [], moved: [] }
    );
    check(
      "removing an entry is allowed",
      diffBaselines(new Map(), priorBaseline),
      { added: [], grown: [], moved: [] }
    );
    // A re-key is a move only when the caller can vouch that the file's
    // violations are unchanged; the default predicate vouches for nothing, so
    // the same input still reads as an addition.
    check(
      "a re-key without the predicate is still an addition",
      diffBaselines(new Map([["code/kept.ts#zzzzzz", 2]]), priorBaseline).added,
      ["code/kept.ts#zzzzzz"]
    );
    check(
      "a re-key with the predicate is a move",
      diffBaselines(
        new Map([["code/kept.ts#zzzzzz", 2]]),
        priorBaseline,
        () => true
      ),
      {
        added: [],
        grown: [],
        moved: [{ from: "code/kept.ts#aaaaaa", to: "code/kept.ts#zzzzzz" }],
      }
    );
    // The base-ref comparison reads git, so it needs a real repository. A
    // renamed baseline is the case that motivated this: without resolving the
    // rule by id in the BASE config, a pull request could move the file, seed a
    // fresh one at the new path, and have the comparison find nothing to compare
    // against and wave it through as a brand-new rule.
    const git = (...args) =>
      execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git("init", "-q");
    git("config", "user.email", "t@t");
    git("config", "user.name", "t");
    write("ratchets.json", JSON.stringify({ rules: [rule] }));
    write("baseline.txt", renderBaseline(rule, scanRule(rule, root)));
    git("add", "-A");
    git("commit", "-qm", "base");
    const committed = readFileSync(path.join(root, "baseline.txt"), "utf-8");

    check(
      "an unchanged baseline verifies",
      run(["--verify-baseline", "HEAD", "--config", "ratchets.json"], {
        root,
        log: silently,
      }),
      0
    );
    write("baseline.txt", `${committed}1\tcode/new.ts#bbbbbb\n`);
    check(
      "an appended entry is rejected",
      run(["--verify-baseline", "HEAD", "--config", "ratchets.json"], {
        root,
        log: silently,
      }),
      1
    );

    // A key is not the violation. The fingerprint hashes the two lines FOLLOWING
    // a site, so renaming a neighbour — or a tree-wide reformat — re-keys a site
    // nobody touched, and a key-only comparison would demand it be "fixed".
    write("baseline.txt", committed);
    const keptPath = path.join(root, "code/kept.ts");
    const keptSource = readFileSync(keptPath, "utf-8");
    // Rename a line that FOLLOWS a violation: the fingerprint hashes those, so
    // this re-keys the site without touching the violation.
    writeFileSync(keptPath, keptSource.replace("alpha();", "alphaRenamed();"));
    write("baseline.txt", renderBaseline(rule, scanRule(rule, root)));
    check(
      "a re-keyed entry whose violations are unchanged verifies",
      run(["--verify-baseline", "HEAD", "--config", "ratchets.json"], {
        root,
        log: silently,
      }),
      0
    );

    // ...and the hole that would open if the move test trusted the key alone:
    // same file, same count, but the violation itself is different text.
    // The key moves AND the violation is different text — the exact shape a
    // key-only move test would wave through.
    writeFileSync(
      keptPath,
      keptSource
        .replace("alpha();", "alphaRenamed();")
        .replace(
          "  BANNED\n  alphaRenamed",
          "  const x = BANNED;\n  alphaRenamed"
        )
    );
    write("baseline.txt", renderBaseline(rule, scanRule(rule, root)));
    check(
      "a re-key is rejected when the violating text changed",
      run(["--verify-baseline", "HEAD", "--config", "ratchets.json"], {
        root,
        log: silently,
      }),
      1
    );

    // A move must not absorb an extra violation: the candidate has to match on
    // count, so a third BANNED in the same file is still an addition.
    writeFileSync(
      keptPath,
      `${keptSource}function three() {\n  BANNED\n  epsilon();\n}\n`
    );
    write("baseline.txt", renderBaseline(rule, scanRule(rule, root)));
    check(
      "a re-key cannot absorb an extra violation",
      run(["--verify-baseline", "HEAD", "--config", "ratchets.json"], {
        root,
        log: silently,
      }),
      1
    );

    // Restore the committed tree for the arms that follow.
    writeFileSync(keptPath, keptSource);
    write("baseline.txt", `${committed}1\tcode/new.ts#bbbbbb\n`);

    // The rename bypass: move the baseline and seed a fresh one at the new path.
    const moved = { ...rule, baseline: "baseline-v2.txt" };
    write("ratchets.json", JSON.stringify({ rules: [moved] }));
    write("baseline-v2.txt", `${committed}1\tcode/new.ts#bbbbbb\n`);
    check(
      "a renamed baseline is still compared against the old path",
      run(["--verify-baseline", "HEAD", "--config", "ratchets.json"], {
        root,
        log: silently,
      }),
      1
    );

    // Weakening the rule until nothing matches, then pruning what it stops
    // seeing, moves every number downward and would otherwise pass.
    const declawed = { ...rule, exclude: ["code/**"] };
    write("ratchets.json", JSON.stringify({ rules: [declawed] }));
    write("baseline.txt", "");
    check(
      "a rule weakened to see nothing is rejected",
      run(["--verify-baseline", "HEAD", "--config", "ratchets.json"], {
        root,
        log: silently,
      }),
      1
    );

    // Deleting the rule outright removes the enforcement and leaves nothing for
    // the per-rule loop to inspect, so the removal has to be caught by id.
    write(
      "ratchets.json",
      JSON.stringify({ rules: [{ ...rule, id: "other" }] })
    );
    check(
      "a rule that disappeared from the config is rejected",
      run(["--verify-baseline", "HEAD", "--config", "ratchets.json"], {
        root,
        log: silently,
      }),
      1
    );

    // ...and the honest case still passes, so the guard is not simply always-on.
    write("ratchets.json", JSON.stringify({ rules: [rule] }));
    write("baseline.txt", committed);
    check(
      "an untouched rule and baseline still verify",
      run(["--verify-baseline", "HEAD", "--config", "ratchets.json"], {
        root,
        log: silently,
      }),
      0
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    log(`✗ ratchet self-test: ${failures.length} failure(s)`);
    for (const failure of failures) {
      log(`    ${failure}`);
    }
    return 1;
  }
  log(`  ✓ ratchet self-test: ${asserted} assertions passed.`);
  return 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  const argv = process.argv.slice(2);
  try {
    process.exitCode = argv.includes("--self-test") ? selfTest() : run(argv);
  } catch (error) {
    console.log(`✗ ratchet: ${error.message}`);
    process.exitCode = 2;
  }
}

export { selfTest };
