#!/usr/bin/env node
/// <reference types="node" />
/**
 * Maintains the summary block at the top of a pull request body (a
 * prod/test/generated line-count table, the size band and CodeRabbit's merge
 * risk) and keeps exactly one `size:*` label on the PR.
 *
 *   node .github/scripts/pr-summary.mjs <pr-number>
 *   node .github/scripts/pr-summary.mjs --self-test
 *
 * Needs GITHUB_TOKEN and GITHUB_REPOSITORY. The job that runs this holds a
 * write-scoped token, so it must never execute code from the pull request
 * head: the workflow fetches these scripts from the default branch.
 */

import process from "node:process";

import {
  classifyPath,
  emptyTotals,
  extractRisk,
  FILES_CEILING,
  formatRisk,
  formatSize,
  formatTable,
  isTruncated,
  mergeBlock,
  renderBlock,
  SIZE_LABELS,
  sizeLabel,
  sumChangedFiles,
} from "./pr-summary-table.mjs";

const NEXT_LINK_PATTERN = /<([^>]+)>\s*;\s*rel="next"/;
const BLOCK_MARKER_PATTERN = /<!-- \/?pr-summary -->/g;
const LABELS_URL_PATTERN = /^.*\/issues\/7\/labels/;
const EM_DASH = "—";

/**
 * @typedef {{ filename: string; additions: number; deletions: number }} ChangedFile
 * @typedef {{ user?: { login?: string } | null; body?: string | null }} IssueComment
 * @typedef {{ owner: string; repo: string; pullNumber: string; token: string; fetchImpl?: typeof fetch }} PullRef
 */

/**
 * @param {string} token a GitHub token
 * @returns {Record<string, string>} the headers every API call carries
 */
function headers(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": "pr-summary",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * @param {string | null | undefined} linkHeader a raw `Link` response header
 * @returns {string | undefined} the `rel="next"` URL, when there is one
 */
export function nextLink(linkHeader) {
  for (const part of (linkHeader ?? "").split(",")) {
    const match = NEXT_LINK_PATTERN.exec(part);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

/**
 * @template T
 * @param {string} url absolute URL of the first page
 * @param {{ token: string; fetchImpl: typeof fetch; cap?: number }} options request plumbing
 * @returns {Promise<{ items: T[] }>} the collected items, at most `cap`
 */
async function paginate(
  url,
  { token, fetchImpl, cap = Number.POSITIVE_INFINITY }
) {
  /** @type {T[]} */
  const items = [];
  /** @type {string | undefined} */
  let next = url;
  while (next) {
    const response = await fetchImpl(next, { headers: headers(token) });
    if (!response.ok) {
      throw new Error(
        `GitHub API ${response.status} ${response.statusText} for ${next}`
      );
    }
    /** @type {unknown} */
    const page = await response.json();
    if (!Array.isArray(page)) {
      throw new TypeError(`Unexpected payload for ${next}`);
    }
    // GitHub's REST payloads arrive as untyped JSON. `Array.isArray` is the
    // only shape this pager can check; the element type is the caller's
    // declared reading of the documented API contract.
    // oxlint-disable-next-line typescript/no-unsafe-argument
    items.push(...page);
    if (items.length >= cap) {
      return { items: items.slice(0, cap) };
    }
    next = nextLink(response.headers.get("link"));
  }
  return { items };
}

/**
 * @param {PullRef} ref the pull request to read
 * @returns {Promise<{ items: ChangedFile[] }>} the changed files GitHub lists;
 *   the API stops at {@link FILES_CEILING}, so compare with {@link isTruncated}
 */
export async function listPullFiles({
  owner,
  repo,
  pullNumber,
  token,
  fetchImpl = fetch,
}) {
  return await paginate(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`,
    { token, fetchImpl, cap: FILES_CEILING }
  );
}

/**
 * @param {PullRef} ref the pull request to read
 * @returns {Promise<string[]>} the body of every CodeRabbit comment on it
 */
export async function listCodeRabbitComments({
  owner,
  repo,
  pullNumber,
  token,
  fetchImpl = fetch,
}) {
  /** @type {{ items: IssueComment[] }} */
  const { items } = await paginate(
    `https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/comments?per_page=100`,
    { token, fetchImpl }
  );
  return items
    .filter((comment) => comment.user?.login === "coderabbitai[bot]")
    .map((comment) => comment.body ?? "");
}

/**
 * @param {PullRef} ref the pull request to read
 * @returns {Promise<{ body: string; headSha?: string; changedFiles?: number }>}
 *   the current body, head SHA and the PR's own changed-file count
 */
async function readPull({ owner, repo, pullNumber, token, fetchImpl = fetch }) {
  const response = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
    { headers: headers(token) }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to read PR #${pullNumber}: ${response.status} ${response.statusText}`
    );
  }
  /** @type {unknown} */
  const pull = await response.json();
  /** @type {object} */
  const record = typeof pull === "object" && pull !== null ? pull : {};
  /** @type {object} */
  const head =
    "head" in record && typeof record.head === "object" && record.head !== null
      ? record.head
      : {};
  return {
    body:
      "body" in record && typeof record.body === "string" ? record.body : "",
    headSha:
      "sha" in head && typeof head.sha === "string" ? head.sha : undefined,
    changedFiles:
      "changed_files" in record && typeof record.changed_files === "number"
        ? record.changed_files
        : undefined,
  };
}

/**
 * @param {PullRef & { body: string; log?: (message: string) => void }} ref
 *   the pull request and its new body
 * @returns {Promise<boolean>} whether the body was written
 */
async function writePullBody({
  owner,
  repo,
  pullNumber,
  token,
  body,
  fetchImpl = fetch,
  log = console.log,
}) {
  const write = await fetchImpl(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
    {
      method: "PATCH",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }
  );
  if (write.status === 403) {
    log("Skipping body update: the token cannot write (fork pull request).");
    return false;
  }
  if (!write.ok) {
    throw new Error(
      `Failed to update PR #${pullNumber}: ${write.status} ${write.statusText}`
    );
  }
  log(`PR #${pullNumber} summary updated.`);
  return true;
}

/**
 * @param {unknown} payload the Issues "list labels" payload
 * @returns {string[]} the label names it carries
 */
function labelNames(payload) {
  if (!Array.isArray(payload)) {
    return [];
  }
  /** @type {unknown[]} */
  const entries = payload;
  /** @type {string[]} */
  const names = [];
  for (const entry of entries) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      "name" in entry &&
      typeof entry.name === "string"
    ) {
      names.push(entry.name);
    }
  }
  return names;
}

/**
 * Keep exactly one `size:*` label on the pull request: the band its
 * production lines fall in. The label is a convenience view of the block, so
 * a GitHub refusal is logged, never thrown, and never costs the body its
 * summary.
 *
 * @param {PullRef & { totals: ReturnType<typeof sumChangedFiles>; truncated?: boolean; log?: (message: string) => void }} ref
 *   the pull request, its tallies and whether the file list was cut short
 * @returns {Promise<{ added?: string; removed: string[] }>} what changed
 */
export async function syncSizeLabel({
  owner,
  repo,
  pullNumber,
  token,
  totals,
  truncated = false,
  fetchImpl = fetch,
  log = console.log,
}) {
  if (truncated) {
    log(
      "Skipping size label: the file list is incomplete, so the band would be a guess."
    );
    return { removed: [] };
  }
  const target = sizeLabel(totals);
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/labels`;
  const read = await fetchImpl(`${url}?per_page=100`, {
    headers: headers(token),
  });
  if (!read.ok) {
    log(`Skipping size label: could not read labels (${read.status}).`);
    return { removed: [] };
  }
  const names = labelNames(await read.json());
  // Add before removing, so a refused add leaves the previous band in place
  // rather than no band at all.
  /** @type {string | undefined} */
  let added;
  if (!names.includes(target)) {
    const add = await fetchImpl(url, {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ labels: [target] }),
    });
    if (!add.ok) {
      log(
        `Could not add ${target} (${add.status}); the labels stay as they are.`
      );
      return { removed: [] };
    }
    added = target;
  }
  /** @type {string[]} */
  const removed = [];
  for (const name of names) {
    if (!SIZE_LABELS.includes(name) || name === target) {
      continue;
    }
    const remove = await fetchImpl(`${url}/${encodeURIComponent(name)}`, {
      method: "DELETE",
      headers: headers(token),
    });
    if (remove.ok || remove.status === 404) {
      removed.push(name);
    } else {
      log(`Could not remove ${name} (${remove.status}).`);
    }
  }
  return added === undefined ? { removed } : { added, removed };
}

/**
 * @param {string} pullNumber the pull request to summarize
 * @returns {Promise<void>} resolves once the body and label are current
 */
async function main(pullNumber) {
  const token = process.env.GITHUB_TOKEN;
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? "").split("/");
  if (!(token && owner && repo)) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
  }
  const ref = { owner, repo, pullNumber, token };
  const { items: files } = await listPullFiles(ref);
  const comments = await listCodeRabbitComments(ref);
  // Read last, so the body this run rewrites is as fresh as it can be.
  const pull = await readPull(ref);
  const truncated = isTruncated({
    listed: files.length,
    reported: pull.changedFiles,
  });
  const totals = sumChangedFiles(files);
  const risk = extractRisk(comments, pull.headSha);
  console.log(formatTable(totals));
  console.log(formatSize(totals, { truncated }));
  console.log(formatRisk(risk));
  const body = mergeBlock(pull.body, totals, risk, { truncated });
  if (body === pull.body) {
    console.log(`PR #${pullNumber} summary already current.`);
  } else {
    await writePullBody({ ...ref, body });
  }
  await syncSizeLabel({ ...ref, totals, truncated });
}

/* ------------------------------------------------------------------------- *
 * Self-test: runs in CI before the block is written, so a classifier that
 * would label production code as generated fails the job instead of quietly
 * shrinking the number a reviewer sizes the change by.
 * ------------------------------------------------------------------------- */

/**
 * @param {number} lines production lines, all added
 * @returns {ReturnType<typeof emptyTotals>} totals with only production lines
 */
function sized(lines) {
  return { ...emptyTotals(), prod: { files: 1, added: lines, deleted: 0 } };
}

/**
 * Runs `syncSizeLabel` against a recording fetch: which calls it makes is the
 * behaviour, and a wrong call is a wrong label on every PR.
 *
 * @param {string[]} onPr labels already on the pull request
 * @param {{ addStatus?: number; truncated?: boolean }} [options] the add
 *   endpoint's answer and whether the totals are short
 * @returns {Promise<{ calls: string[]; result: Awaited<ReturnType<typeof syncSizeLabel>> }>}
 *   the calls made and the reported change
 */
async function labelSync(onPr, { addStatus = 200, truncated = false } = {}) {
  /** @type {string[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const fetchImpl = async (input, init = {}) => {
    const method = init.method ?? "GET";
    const url = input instanceof Request ? input.url : String(input);
    const path = url.replace(LABELS_URL_PATTERN, "labels");
    const body = typeof init.body === "string" ? ` ${init.body}` : "";
    calls.push(`${method} ${path}${body}`);
    await Promise.resolve();
    return new Response(
      method === "GET" ? JSON.stringify(onPr.map((name) => ({ name }))) : "[]",
      { status: method === "POST" ? addStatus : 200 }
    );
  };
  const result = await syncSizeLabel({
    owner: "o",
    repo: "r",
    pullNumber: "7",
    token: "t",
    totals: sized(120),
    truncated,
    fetchImpl,
    log: () => undefined,
  });
  return { calls, result };
}

/**
 * @returns {Promise<number>} the process exit code: 0 when every case holds
 */
export async function selfTest() {
  const failures = [];
  let asserted = 0;
  const check = (name, actual, expected) => {
    asserted += 1;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(
        `${name}\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`
      );
    }
  };

  // Classification. "A schema file is not a test" guards against a vacuous
  // pass: a classifier answering "test" for everything would pass the rest.
  for (const [path, bucket] of [
    ["src/server/db/drizzle/meta/0001_snapshot.json", "generated"],
    ["src/server/db/drizzle/meta/_journal.json", "generated"],
    ["pnpm-lock.yaml", "generated"],
    ["src/server/db/drizzle/0001_add_column.sql", "prod"],
    ["src/app/_components/atoms/button/button.test.tsx", "test"],
    ["src/server/api/routers/post.integration.test.ts", "test"],
    ["src/e2e/tests/posts.spec.ts", "test"],
    ["src/e2e/page-objects/base.ts", "test"],
    ["src/test/setup.ts", "test"],
    ["src/server/test/context.ts", "test"],
    ["src/server/db/__tests__/helpers.ts", "test"],
    ["src/server/api/routers/post.ts", "prod"],
    ["src/lib/schemas/post/index.ts", "prod"],
    ["src/lib/contest/page.tsx", "prod"],
    ["scripts/vercel-ignore.sh", "prod"],
    ["drizzle\\meta\\0001_snapshot.json", "generated"],
  ]) {
    check(`${path} is ${bucket}`, classifyPath(path), bucket);
  }

  const totals = sumChangedFiles([
    { filename: "src/server/api/routers/post.ts", additions: 40, deletions: 5 },
    {
      filename: "src/server/api/routers/post.test.ts",
      additions: 120,
      deletions: 0,
    },
    {
      filename: "src/server/db/drizzle/meta/0002_snapshot.json",
      additions: 40_000,
      deletions: 0,
    },
  ]);
  check("prod bucket", totals.prod, { files: 1, added: 40, deleted: 5 });
  check("test bucket", totals.test, { files: 1, added: 120, deleted: 0 });
  check("generated bucket", totals.generated, {
    files: 1,
    added: 40_000,
    deleted: 0,
  });
  check(
    "generated row shown when present",
    formatTable(totals).includes("| Generated |"),
    true
  );
  check(
    "generated row hidden when empty",
    formatTable(sized(1)).includes("Generated"),
    false
  );

  // Merge risk. A verdict is about the commit it was made on; CodeRabbit
  // edits one comment in place, so an older verdict must read as stale.
  check(
    "risk parsed from CodeRabbit",
    extractRisk(["noise", "**Merge Risk:** _⚪ Minimal_ · up to `abc`"]),
    { state: "ok", level: "⚪ Minimal", sha: "abc" }
  );
  check(
    "rate limit is not silence",
    extractRisk(["> [!WARNING]\n> Review rate limited."]),
    { state: "rate-limited" }
  );
  check("no comment is pending", extractRisk([]), { state: "pending" });
  const stamped = ["**Merge Risk:** _🔵 Low_ · up to `d9d48`"];
  check(
    "a verdict stamped with the head is current",
    extractRisk(stamped, "d9d48c0ffee1234").state,
    "ok"
  );
  check(
    "a verdict stamped with an older commit is stale",
    extractRisk(stamped, "ffffffffffffff").state,
    "stale"
  );
  check(
    "a stale verdict never reads as assessed",
    formatRisk({ state: "stale", level: "🔵 Low", sha: "d9d48" }).includes(
      "not the current head"
    ),
    true
  );
  check(
    "with no head to compare, the verdict is reported as given",
    extractRisk(stamped).state,
    "ok"
  );
  check(
    "a rate-limited run never reads as low risk",
    formatRisk({ state: "rate-limited" }).includes("not assessed"),
    true
  );

  // The block becomes PR description text, where the PR template bans the em
  // dash; a bot that emitted one would reinstate it on every push.
  for (const state of ["ok", "pending", "rate-limited", "stale"]) {
    check(
      `the ${state} risk line carries no em dash`,
      formatRisk({ state, level: "⚪ Minimal", sha: "abc" }).includes(EM_DASH),
      false
    );
  }
  check(
    "the rendered block carries no em dash",
    mergeBlock(
      "prose",
      sized(500),
      { state: "rate-limited" },
      { truncated: true }
    ).includes(EM_DASH) ||
      mergeBlock("prose", sized(500), { state: "pending" }).includes(EM_DASH),
    false
  );

  // Body merge.
  const withBlock = mergeBlock("Existing prose.", totals, { state: "pending" });
  check("prose survives", withBlock.includes("Existing prose."), true);
  check(
    "block is idempotent",
    mergeBlock(withBlock, totals, { state: "pending" }),
    withBlock
  );
  check(
    "a second run does not stack blocks",
    (
      mergeBlock(withBlock, totals, { state: "pending" }).match(
        BLOCK_MARKER_PATTERN
      ) ?? []
    ).length,
    2
  );
  check(
    "an empty body gets the block alone",
    mergeBlock(null, totals, { state: "pending" }).startsWith(
      "<!-- pr-summary -->"
    ),
    true
  );

  // Size bands: both sides of every edge, so a shifted cut-off fails.
  for (const [lines, label] of [
    [0, "size:XS"],
    [9, "size:XS"],
    [10, "size:S"],
    [29, "size:S"],
    [30, "size:M"],
    [99, "size:M"],
    [100, "size:L"],
    [499, "size:L"],
    [500, "size:XL"],
    [999, "size:XL"],
    [1000, "size:XXL"],
  ]) {
    check(
      `${lines} production lines is ${label}`,
      sizeLabel(sized(Number(lines))),
      label
    );
  }
  check(
    "deleted production lines count too",
    sizeLabel({ ...emptyTotals(), prod: { files: 1, added: 5, deleted: 5 } }),
    "size:S"
  );
  check(
    "tests never move the band",
    sizeLabel({ ...sized(5), test: { files: 3, added: 5000, deleted: 0 } }),
    "size:XS"
  );
  check(
    "generated output never moves the band",
    sizeLabel({
      ...sized(5),
      generated: { files: 1, added: 40_000, deleted: 0 },
    }),
    "size:XS"
  );
  check(
    "the size line names the label and the count",
    formatSize(sized(120)),
    "**Size** `size:L` · 120 production lines"
  );
  check(
    "under the split threshold there is no split demand",
    formatSize(sized(499)).includes("cannot be split"),
    false
  );
  check(
    "at the split threshold the demand appears",
    formatSize(sized(500)).includes("cannot be split"),
    true
  );
  check(
    "the block carries the size line",
    renderBlock(totals, { state: "pending" }).includes("**Size** `size:M`"),
    true
  );

  // Truncation: the Files API ends at the ceiling with no next-page link
  // either way, so only the PR's own count says whether the list is whole.
  check(
    "ceiling with equal count is complete",
    isTruncated({ listed: 3000, reported: 3000 }),
    false
  );
  check(
    "shorter than the count is cut",
    isTruncated({ listed: 10, reported: 12 }),
    true
  );
  check(
    "no count, at the ceiling, is cut",
    isTruncated({ listed: 3000 }),
    true
  );
  check(
    "no count, under the ceiling, is complete",
    isTruncated({ listed: 2999 }),
    false
  );
  const cut = { truncated: true };
  check(
    "cut totals render no band, only a lower bound",
    formatSize(sized(120), cut),
    "**Size** _not assessed: the changed-file list is incomplete, so 120 production lines is a lower bound._"
  );
  check(
    "the cut block says every count is a lower bound",
    renderBlock(totals, { state: "pending" }, cut).includes(
      "every count below is a lower bound"
    ),
    true
  );
  check(
    "a complete block carries no lower-bound notice",
    renderBlock(totals, { state: "pending" }).includes("lower bound"),
    false
  );

  // Label sync.
  check(
    "a stale size label is swapped, add first",
    (await labelSync(["size:M", "bug"])).calls,
    [
      "GET labels?per_page=100",
      'POST labels {"labels":["size:L"]}',
      "DELETE labels/size%3AM",
    ]
  );
  check(
    "a refused add keeps the previous band",
    await labelSync(["size:M"], { addStatus: 500 }),
    {
      calls: ["GET labels?per_page=100", 'POST labels {"labels":["size:L"]}'],
      result: { removed: [] },
    }
  );
  check(
    "short totals get no label and no calls",
    (await labelSync(["size:M"], { truncated: true })).calls,
    []
  );
  check(
    "a foreign label is never touched",
    (await labelSync(["bug"])).calls.some((call) => call.includes("bug")),
    false
  );
  check("a current label is left alone", (await labelSync(["size:L"])).calls, [
    "GET labels?per_page=100",
  ]);
  check(
    "the sync reports what it changed",
    (await labelSync(["size:XS"])).result,
    {
      added: "size:L",
      removed: ["size:XS"],
    }
  );
  check(
    "a token that cannot write reports no label",
    (await labelSync([], { addStatus: 403 })).result,
    { removed: [] }
  );

  if (failures.length > 0) {
    console.log(`✗ pr-summary self-test: ${failures.length} failure(s)`);
    for (const failure of failures) {
      console.log(`    ${failure}`);
    }
    return 1;
  }
  console.log(`✓ pr-summary self-test: ${asserted} assertions passed.`);
  return 0;
}

const [arg] = process.argv.slice(2);
if (arg === "--self-test") {
  process.exitCode = await selfTest();
} else if (arg) {
  try {
    await main(arg);
  } catch (error) {
    console.log(
      `✗ pr-summary: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
} else {
  console.log("Usage: pr-summary.mjs <pr-number> | --self-test");
  process.exitCode = 2;
}
