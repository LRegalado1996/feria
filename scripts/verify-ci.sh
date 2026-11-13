#!/usr/bin/env bash
# CI on this machine. Runs CI's sequence against an isolated database on this
# worktree's Postgres, then e2e under CI=1 against `next start` on a port
# derived from the worktree, so neither the dev database nor the dev server is
# touched. CI's e2e runs against a production build and an empty database,
# which `next dev` on a seeded database never exercises.
#
#   pnpm verify:ci          check, typecheck, unit (coverage), integration, build, e2e
#   pnpm e2e:ci [spec...]   e2e only; builds when .next/BUILD_ID is missing
#   pnpm verify:ci:reset    recreate the verify database and stop
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

mode="full"
args=()
for arg in "$@"; do
  case "$arg" in
    --only-e2e) mode="e2e" ;;
    --reset-db-only) mode="reset" ;;
    # `pnpm e2e:ci -- spec` forwards the separator; Playwright would read it
    # as the start of its file filters and run everything.
    --) ;;
    *) args+=("$arg") ;;
  esac
done

if ! bash scripts/worktree.sh ensure --quiet; then
  echo "verify-ci: could not start this worktree's Postgres (pnpm wt:doctor)" >&2
  exit 1
fi
# Postgres is up; the nested pnpm wrappers can skip their own ensure.
export SKIP_WT_ENSURE=1

# Same ports, ids and container as the dev stack.
# shellcheck source=scripts/worktree.sh
source scripts/worktree.sh --source-only

VERIFY_DB="template_verify_$(printf '%s' "$WORKTREE_ID" | tr -c 'a-zA-Z0-9' '_' | cut -c1-40)"
VERIFY_DB_URL="postgresql://template:template@localhost:${PG_PORT}/${VERIFY_DB}"
# Derived, not probed: a probed free port is a race with whatever binds next.
# Offsets are multiples of 10 and 23xxx sits outside the OS ephemeral range.
VERIFY_PORT=$((23000 + OFFSET))

psql_admin() {
  docker exec -e PGPASSWORD=template -e PGOPTIONS=--client-min-messages=warning "$(container_name db)" \
    psql -U template -d postgres -q -v ON_ERROR_STOP=1 -c "$1"
}

reset_db() {
  echo "verify-ci: recreating database $VERIFY_DB"
  psql_admin "DROP DATABASE IF EXISTS \"$VERIFY_DB\" WITH (FORCE)" >/dev/null
  psql_admin "CREATE DATABASE \"$VERIFY_DB\"" >/dev/null
}

migrate() { DATABASE_URL="$VERIFY_DB_URL" pnpm db:migrate; }

# CI's job environment. NODE_ENV is unset for the build: a leaked
# `development` makes `next build` fail its prerender.
ci_env=(NODE_ENV=test SKIP_ENV_VALIDATION=true DATABASE_URL="$VERIFY_DB_URL" BETTER_AUTH_URL=http://localhost:3000)
build() { env -u NODE_ENV SKIP_ENV_VALIDATION=true DATABASE_URL=postgresql://localhost:5432/stub BETTER_AUTH_URL=http://localhost:3000 bash scripts/turbo-build.sh; }

if [[ "$mode" == "reset" ]]; then
  reset_db
  exit 0
fi

trap 'psql_admin "DROP DATABASE IF EXISTS \"$VERIFY_DB\" WITH (FORCE)" >/dev/null 2>&1 || true' EXIT
reset_db
migrate

if [[ "$mode" == "full" ]]; then
  echo "verify-ci: check and typecheck" && pnpm turbo run check typecheck --continue
  echo "verify-ci: unit tests with coverage" && env "${ci_env[@]}" pnpm turbo run test:unit:coverage
  echo "verify-ci: integration tests" && env "${ci_env[@]}" pnpm test:integration
  echo "verify-ci: build" && build
  # CI runs integration and e2e against separate databases.
  reset_db
  migrate
elif [[ ! -f .next/BUILD_ID ]]; then
  echo "verify-ci: no build in .next, building first"
  build
else
  # Reusing .next is silent otherwise: specs are read fresh, src/ is not, so a
  # "revert the fix and watch the test fail" check would pass for the wrong reason.
  echo "verify-ci: reusing the build from $(date -r .next/BUILD_ID '+%Y-%m-%d %H:%M:%S'); src/ changes since then are NOT in it (pnpm build first)"
fi

if lsof -nP -iTCP:"$VERIFY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "verify-ci: port $VERIFY_PORT is busy, likely a stray next start from an aborted run: lsof -nP -iTCP:$VERIFY_PORT -sTCP:LISTEN" >&2
  exit 1
fi
pnpm exec playwright install chromium >/dev/null

echo "verify-ci: e2e on port $VERIFY_PORT against $VERIFY_DB"
env "${ci_env[@]}" CI=1 PORT="$VERIFY_PORT" E2E_BASE_URL="http://localhost:${VERIFY_PORT}" \
  BETTER_AUTH_URL="http://localhost:${VERIFY_PORT}" BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  pnpm exec playwright test --config=src/e2e/playwright.config.ts --reporter=list ${args[@]+"${args[@]}"}
