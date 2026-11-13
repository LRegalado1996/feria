/**
 * Pure rendering for the PR summary block. No network and no GitHub API, so
 * the classification rules can be self-tested without a PR to run against.
 *
 * The block answers the question a raw "+40,312" cannot: how much of this
 * change is code a human has to read? One generated Drizzle snapshot is
 * thousands of lines, enough to make a small change read as a huge one.
 */

export const BLOCK_START = "<!-- pr-summary -->";
export const BLOCK_END = "<!-- /pr-summary -->";
export const HANDS_OFF =
  "<!-- Written by .github/workflows/pr-summary.yml. Do not edit by hand; rewritten on every push. -->";

/**
 * Files a reviewer never reads line by line: Drizzle's `meta/` snapshots and
 * journal, wherever the migrations folder lives, and the lockfile. The
 * migration SQL beside them is NOT here: that is reviewed by hand.
 *
 * Deliberately narrow: anything not proven generated counts as production,
 * so the honest failure is over-reporting work, never hiding it.
 */
const GENERATED_PATTERNS = [
  /(?:^|\/)drizzle\/meta\//,
  /(?:^|\/)pnpm-lock\.yaml$/,
];

/**
 * Test surfaces: co-located unit and integration tests, Playwright specs, and
 * the directories that exist only to support them (`src/test/`,
 * `src/server/test/`).
 */
const TEST_PATTERNS = [
  /\.(?:test|e2e)\.[cm]?[jt]sx?$/,
  /^src\/e2e\//,
  /(?:^|\/)(?:test|tests|__tests__)\//,
  /(?:^|\/)__mocks__\//,
];

/**
 * GitHub's pull-request Files API lists at most this many files, and it ends
 * there with no next-page link whether or not the pull request has more. So
 * reaching the ceiling proves nothing on its own; see {@link isTruncated}.
 */
export const FILES_CEILING = 3000;

/**
 * @param {{ listed: number; reported?: number; cap?: number }} counts how many
 *   files the API listed, how many the pull request itself reports, and the
 *   API ceiling
 * @returns {boolean} whether the listed files are known, or must be assumed,
 *   to fall short of the whole pull request
 */
export function isTruncated({ listed, reported, cap = FILES_CEILING }) {
  if (reported !== undefined) {
    return listed < reported;
  }
  return listed >= cap;
}

const LEADING_BLANK_LINES = /^\r?\n+/;
// CodeRabbit stamps the commit it judged: `**Merge Risk:** _🔵 Low_ · up to `d9d48``.
const RISK_PATTERN =
  /\*\*Merge Risk:\*\*\s*_([^_]+)_(?:\s*·\s*up to\s*`?([0-9a-f]+)`?)?/;
const RATE_LIMIT_PATTERN = /rate limit/i;

/**
 * @param {string} path repository-relative path, forward-slashed
 * @returns {boolean} whether a reviewer can skip the file wholesale
 */
export function isGeneratedPath(path) {
  return GENERATED_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * @param {string} path repository-relative path, forward-slashed
 * @returns {boolean} whether the file belongs to a test surface
 */
export function isTestPath(path) {
  return TEST_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * @param {string} path repository-relative path, in either slash style
 * @returns {"generated" | "prod" | "test"} the bucket the file counts towards
 */
export function classifyPath(path) {
  const normalized = path.split("\\").join("/");
  if (isGeneratedPath(normalized)) {
    return "generated";
  }
  if (isTestPath(normalized)) {
    return "test";
  }
  return "prod";
}

/**
 * @typedef {{ added: number; deleted: number; files: number }} Bucket
 * @typedef {{ generated: Bucket; prod: Bucket; test: Bucket }} Totals
 */

/** @returns {Totals} a zeroed tally, one bucket per class */
export function emptyTotals() {
  return {
    prod: { files: 0, added: 0, deleted: 0 },
    test: { files: 0, added: 0, deleted: 0 },
    generated: { files: 0, added: 0, deleted: 0 },
  };
}

/**
 * @param {{ additions?: number; deletions?: number; filename?: string | null }[]} files
 *   the GitHub "list pull request files" payload
 * @returns {Totals} the per-class file and line tallies
 */
export function sumChangedFiles(files) {
  const totals = emptyTotals();
  for (const file of files) {
    if (file.filename == null) {
      continue;
    }
    const bucket = totals[classifyPath(file.filename)];
    bucket.files += 1;
    bucket.added += file.additions ?? 0;
    bucket.deleted += file.deletions ?? 0;
  }
  return totals;
}

/**
 * Size bands over PRODUCTION lines only, added plus deleted. Tests and
 * generated output are excluded on purpose: a well-tested change must not
 * read as bigger than a bare one, and a snapshot must not make a small change
 * XXL. The names and cut-offs follow the common `size:*` label convention.
 */
const SIZE_BANDS = [
  ["size:XS", 10],
  ["size:S", 30],
  ["size:M", 100],
  ["size:L", 500],
  ["size:XL", 1000],
];

/** Every label this script manages; any other label on the PR is left alone. */
export const SIZE_LABELS = [
  ...SIZE_BANDS.map(([label]) => String(label)),
  "size:XXL",
];

/**
 * At this many production lines or more, the description has to say why the
 * change cannot be split (docs/agents/ci.md § Pull requests).
 */
export const SPLIT_THRESHOLD = 500;

/**
 * @param {Totals} totals the per-class tallies
 * @returns {number} production lines touched, added plus deleted
 */
export function productionLines(totals) {
  return totals.prod.added + totals.prod.deleted;
}

/**
 * @param {Totals} totals the per-class tallies
 * @returns {string} the `size:*` label the production line count falls in
 */
export function sizeLabel(totals) {
  const lines = productionLines(totals);
  for (const [label, ceiling] of SIZE_BANDS) {
    if (lines < Number(ceiling)) {
      return String(label);
    }
  }
  return "size:XXL";
}

/**
 * @typedef {{ truncated?: boolean }} RenderOptions whether the file list the
 *   totals came from was cut short
 */

/**
 * @param {Totals} totals the per-class tallies
 * @param {RenderOptions} [options] whether the totals are a lower bound
 * @returns {string} the one-line size summary
 */
export function formatSize(totals, { truncated = false } = {}) {
  const lines = productionLines(totals);
  if (truncated) {
    return `**Size** _not assessed: the changed-file list is incomplete, so ${lines} production lines is a lower bound._`;
  }
  const summary = `**Size** \`${sizeLabel(totals)}\` · ${lines} production lines`;
  if (lines < SPLIT_THRESHOLD) {
    return summary;
  }
  return `${summary}. At ${SPLIT_THRESHOLD} or more, the description must say why this cannot be split.`;
}

const GREEN = "#1a7f37";
const RED = "#cf222e";

/**
 * Only the sign is rendered as math, so a client that does not render LaTeX
 * still shows the number rather than a wall of markup.
 *
 * @param {number} count a signed line delta
 * @returns {string} the delta with a coloured sign
 */
function signed(count) {
  if (count === 0) {
    return "0";
  }
  const color = count > 0 ? GREEN : RED;
  const glyph = count > 0 ? "+" : "−";
  return `$\\color{${color}}{\\mathbf{${glyph}}}$\u200B${Math.abs(count)}`;
}

/**
 * @param {string} label the row's leading cell
 * @param {Bucket} bucket the tallies rendered across the row
 * @returns {string} one markdown table row
 */
function row(label, bucket) {
  const { files, added, deleted } = bucket;
  return `| ${label} | ${files} | ${signed(added)} | ${signed(-deleted)} | ${signed(added - deleted)} |`;
}

/**
 * @param {Totals} totals the per-class tallies
 * @returns {string} the markdown table
 */
export function formatTable(totals) {
  const lines = [
    "| | Files | Added | Deleted | Net |",
    "| :--- | ---: | ---: | ---: | ---: |",
    row("Prod", totals.prod),
    row("Test", totals.test),
  ];
  // A zero row every time trains the reader to skip the table, and most PRs
  // carry no generated files. Show the row only when it changes the reading.
  if (totals.generated.files > 0) {
    lines.push(row("Generated", totals.generated));
  }
  return lines.join("\n");
}

/**
 * @typedef {{ level?: string; sha?: string; state: "ok" | "pending" | "rate-limited" | "stale" }} Risk
 */

/**
 * CodeRabbit's own merge-risk verdict, lifted out of its collapsed comment so
 * it is legible without expanding anything.
 *
 * The states are deliberately distinct. A rate-limited CodeRabbit run still
 * posts a passing check with an empty review, which reads as approval; saying
 * so here is the point, not a nicety.
 *
 * @param {Risk} risk the verdict lifted from CodeRabbit's comment
 * @returns {string} the one-line merge-risk summary
 */
export function formatRisk(risk) {
  if (risk.state === "ok") {
    return `**Merge risk** ${risk.level} · CodeRabbit`;
  }
  if (risk.state === "stale") {
    return `**Merge risk** _${risk.level} was assessed at \`${risk.sha}\`, which is not the current head._ Treat it as pending until CodeRabbit re-reviews.`;
  }
  if (risk.state === "rate-limited") {
    return "**Merge risk** _not assessed: CodeRabbit was rate limited._ Its passing check is not a review; re-run it before relying on one.";
  }
  return "**Merge risk** _pending: CodeRabbit has not posted a verdict yet._";
}

/**
 * The verdict is only about the commit CodeRabbit read. Its comment is edited
 * in place, so between a push and the next review the body still carries the
 * old one, and reporting that as the current risk would vouch for an
 * unreviewed head. A verdict stamped with another commit is its own state.
 *
 * @param {string[]} commentBodies every CodeRabbit comment body on the PR
 * @param {string} [headSha] the pull request's current head
 * @returns {Risk} the verdict and how far it can be trusted
 */
export function extractRisk(commentBodies, headSha) {
  for (const body of commentBodies) {
    const match = RISK_PATTERN.exec(body);
    if (match) {
      const level = match[1]?.trim();
      const sha = match[2];
      if (headSha && sha && !headSha.startsWith(sha)) {
        return { state: "stale", level, sha };
      }
      return { state: "ok", level, sha };
    }
  }
  if (commentBodies.some((body) => RATE_LIMIT_PATTERN.test(body))) {
    return { state: "rate-limited" };
  }
  return { state: "pending" };
}

/**
 * @param {Totals} totals the per-class tallies
 * @param {Risk} risk the merge-risk verdict
 * @param {RenderOptions} [options] whether the totals are a lower bound
 * @returns {string} the delimited summary block
 */
export function renderBlock(totals, risk, { truncated = false } = {}) {
  const lines = [BLOCK_START, HANDS_OFF, ""];
  if (truncated) {
    lines.push(
      "_GitHub returned an incomplete changed-file list, so every count below is a lower bound._",
      ""
    );
  }
  lines.push(
    formatTable(totals),
    "",
    formatSize(totals, { truncated }),
    "",
    formatRisk(risk),
    "",
    BLOCK_END
  );
  return lines.join("\n");
}

/**
 * Replace the block in place when it exists, otherwise prepend it. The
 * author's prose is never reordered or reflowed: only the delimited region is
 * touched.
 *
 * @param {string | null | undefined} body the pull request body as it stands
 * @param {Totals} totals the per-class tallies
 * @param {Risk} risk the merge-risk verdict
 * @param {RenderOptions} [options] whether the totals are a lower bound
 * @returns {string} the body with the block in place
 */
export function mergeBlock(body, totals, risk, options = {}) {
  const block = renderBlock(totals, risk, options);
  const current = body ?? "";
  const start = current.indexOf(BLOCK_START);
  const end = current.indexOf(BLOCK_END);

  if (start !== -1 && end !== -1 && end > start) {
    const head = current.slice(0, start);
    const tail = current
      .slice(end + BLOCK_END.length)
      .replace(LEADING_BLANK_LINES, "");
    return tail.length === 0
      ? `${head}${block}\n`
      : `${head}${block}\n\n${tail}`;
  }
  if (current.trim().length === 0) {
    return `${block}\n`;
  }
  return `${block}\n\n${current.replace(LEADING_BLANK_LINES, "")}`;
}
