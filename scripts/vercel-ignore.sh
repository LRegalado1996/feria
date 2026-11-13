#!/usr/bin/env bash
# Vercel Ignored Build Step (vercel.json `ignoreCommand`): skip a deployment
# whose push cannot change what gets deployed.
#
# Vercel's exit codes are inverted: 1 continues the build, 0 skips it. Every
# uncertain case builds. A wrongly skipped deployment serves stale code while
# looking current, which costs far more to debug than the build it saved.
#
# `vercel.json`, `scripts/**` (this file and the build's helpers),
# `drizzle.config.ts`, `src/server/db/drizzle/` (the build runs `db:migrate`)
# and `.nvmrc` change the deployment without changing a module, so they always
# build.
#
#   bash scripts/vercel-ignore.sh --self-test

set -euo pipefail

# Paths that cannot affect the deployed output. Anything not listed builds.
is_ignorable() {
  case "$1" in
    *.md) return 0 ;;
    docs/*) return 0 ;;
    .github/*) return 0 ;;
    .agents/* | .claude/* | .cursor/* | .vscode/* | .superset/* | .husky/*) return 0 ;;
    src/e2e/* | src/test/* | src/server/test/*) return 0 ;;
    *.test.ts | *.test.tsx) return 0 ;;
    .coderabbit.yaml | .env.example | .gitleaks.toml | skills-lock.json) return 0 ;;
    *) return 1 ;;
  esac
}

# Reads paths on stdin, one per line; echoes "build" or "skip".
# Split from decide() so the self-test exercises the real decision.
classify() {
  local saw_path=0 path
  while IFS= read -r path; do
    [[ -z $path ]] && continue
    saw_path=1
    if ! is_ignorable "$path"; then
      echo build
      return 0
    fi
  done
  # An explicit redeployment of the same commit has an empty diff: build it.
  if [[ $saw_path -eq 0 ]]; then
    echo build
    return 0
  fi
  echo skip
}

decide() {
  local base head files
  # Production advances an alias and is a rollback candidate: never skip it.
  if [[ ${VERCEL_ENV:-} == "production" ]]; then
    echo "production deployment" >&2
    echo build
    return 0
  fi

  base="${VERCEL_GIT_PREVIOUS_SHA:-}"
  head="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
  if [[ -z $base ]]; then
    echo "no VERCEL_GIT_PREVIOUS_SHA (first deployment of this branch)" >&2
    echo build
    return 0
  fi

  # The previous deployment can sit outside a shallow clone. One bounded
  # fetch, then give up and build.
  if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
    git fetch --depth=1 origin "$base" >/dev/null 2>&1 || true
  fi
  if ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
    echo "previous SHA ${base} unreachable in this clone" >&2
    echo build
    return 0
  fi

  # --no-renames is load-bearing: with rename detection a rename reports only
  # its destination, so moving src/foo.ts to docs/foo.md would read as a lone
  # docs path and skip a build that deleted a module.
  if ! files="$(git diff --name-only --no-renames "$base" "$head" 2>/dev/null)"; then
    echo "git diff ${base}..${head} failed" >&2
    echo build
    return 0
  fi

  echo "changed files vs ${base}:" >&2
  printf '%s\n' "$files" | sed 's/^/  /' >&2
  printf '%s\n' "$files" | classify
}

SELF_TEST_FAILURES=0

# $1 = expected verdict, $2 = label, $3... = changed paths.
# Paths are arguments, not stdin: piping into this function would run it in a
# subshell, where a failure increments a copy of the counter and the suite
# still reports success.
assert_verdict() {
  local expected="$1" label="$2" got
  shift 2
  got="$(printf '%s\n' "$@" | classify)"
  if [[ $got != "$expected" ]]; then
    echo "FAIL: ${label}: expected ${expected}, got ${got}" >&2
    SELF_TEST_FAILURES=$((SELF_TEST_FAILURES + 1))
  fi
}

# $1 = expected verdict, $2 = label, $3 = env assignments for decide(),
# $4 = shell commands that turn a throwaway repository's HEAD^..HEAD into
# the case. Drives decide() end to end: the only way to falsify --no-renames,
# the unreachable-SHA fallback and the production rule.
assert_decision() {
  local expected="$1" label="$2" env_vars="$3" change="$4" tmp got
  tmp="$(mktemp -d)"
  if ! (
    cd "$tmp" || exit 1
    git init -q .
    git config user.email self-test@example.invalid
    git config user.name "self test"
    mkdir -p src docs
    printf 'export const x = 1;\n' >src/foo.ts
    printf '# docs\n' >docs/a.md
    git add -A
    git commit -qm base
    eval "$change"
    git add -A
    git commit -qm change --allow-empty
  ) >/dev/null 2>&1; then
    echo "FAIL: ${label}: fixture setup failed" >&2
    SELF_TEST_FAILURES=$((SELF_TEST_FAILURES + 1))
    rm -rf "$tmp"
    return
  fi

  got="$(
    cd "$tmp" || exit 1
    export VERCEL_ENV=preview
    VERCEL_GIT_PREVIOUS_SHA="$(git rev-parse HEAD^)"
    VERCEL_GIT_COMMIT_SHA="$(git rev-parse HEAD)"
    export VERCEL_GIT_PREVIOUS_SHA VERCEL_GIT_COMMIT_SHA
    if [[ -n $env_vars ]]; then eval "export $env_vars"; fi
    decide 2>/dev/null
  )"
  rm -rf "$tmp"

  if [[ $got != "$expected" ]]; then
    echo "FAIL: ${label}: expected ${expected}, got ${got}" >&2
    SELF_TEST_FAILURES=$((SELF_TEST_FAILURES + 1))
  fi
}

self_test() {
  SELF_TEST_FAILURES=0

  assert_verdict skip "docs only" "README.md" "docs/agents/ci.md"
  assert_verdict skip "unit test" "src/server/api/routers/post.test.ts"
  assert_verdict skip "tsx test" "src/lib/hooks/post/use-get-posts.test.tsx"
  assert_verdict skip "integration test" "src/server/api/routers/post.integration.test.ts"
  assert_verdict skip "e2e spec" "src/e2e/tests/posts.spec.ts"
  assert_verdict skip "test setup" "src/test/setup.ts"
  assert_verdict skip "server test helpers" "src/server/test/context.ts"
  assert_verdict skip "workflow" ".github/workflows/ci.yml"
  assert_verdict skip "agent config" ".claude/settings.json" ".agents/skills/orpc/SKILL.md"
  assert_verdict skip "editor config" ".cursor/rules/a.mdc" ".vscode/settings.json" ".superset/config.json"

  # Each of these must flip an otherwise skippable push to build.
  assert_verdict build "router source" "src/server/api/routers/post.ts"
  assert_verdict build "test alongside source" \
    "src/server/api/routers/post.test.ts" "src/server/api/routers/post.ts"
  assert_verdict build "deployment config" "vercel.json"
  assert_verdict build "this script" "scripts/vercel-ignore.sh"
  assert_verdict build "drizzle config" "drizzle.config.ts"
  assert_verdict build "migration" "src/server/db/drizzle/0001_add_column.sql"
  assert_verdict build "migration journal" "src/server/db/drizzle/meta/_journal.json"
  assert_verdict build "node version" ".nvmrc"
  assert_verdict build "manifest" "package.json"
  assert_verdict build "lockfile" "pnpm-lock.yaml"
  assert_verdict build "component" "src/app/_components/atoms/button/button.tsx"
  assert_verdict build "static asset" "public/favicon.ico"
  assert_verdict build "a directory merely named like an inert one" "src/docs/page.tsx"
  assert_verdict build "empty diff" ""

  assert_decision skip "docs-only push" "" "printf 'more\n' >>docs/a.md"
  assert_decision build "source renamed into docs (--no-renames)" "" "git mv src/foo.ts docs/foo.md"
  assert_decision build "production always builds" "VERCEL_ENV=production" "printf 'more\n' >>docs/a.md"
  assert_decision build "unreachable previous SHA" \
    "VERCEL_GIT_PREVIOUS_SHA=0123456789abcdef0123456789abcdef01234567" "printf 'more\n' >>docs/a.md"
  assert_decision build "no previous SHA" "VERCEL_GIT_PREVIOUS_SHA=" "printf 'more\n' >>docs/a.md"

  if [[ $SELF_TEST_FAILURES -gt 0 ]]; then
    echo "vercel-ignore self-test: ${SELF_TEST_FAILURES} failure(s)" >&2
    return 1
  fi
  echo "vercel-ignore self-test: all assertions passed"
}

main() {
  if [[ ${1:-} == "--self-test" ]]; then
    self_test
    return $?
  fi

  local verdict
  # A crash inside decide() exits non-zero under `set -e`, which Vercel reads
  # as "build": the fail-open direction.
  verdict="$(decide)"
  if [[ $verdict == "skip" ]]; then
    echo "vercel-ignore: no deployable change, skipping the build"
    exit 0
  fi
  echo "vercel-ignore: building"
  exit 1
}

main "$@"
