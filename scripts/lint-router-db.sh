#!/usr/bin/env bash
# Reject direct database reads and writes in oRPC routers: every query goes
# through a service in src/server/services/ (AGENTS.md § API).
#
#   bash scripts/lint-router-db.sh
#   bash scripts/lint-router-db.sh --self-test
#
# konsistent bans a router's drizzle-orm imports, but it sees files, imports
# and declarations, not member access: `context.db.query.post.findFirst()`
# needs no import at all. This closes that half.
#
# `db.transaction(...)` stays allowed: a transaction that composes service
# calls is a boundary, not a query. Passing the client on
# (`createPost(context.db, …)`) is not member access and is not matched.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
routers="src/server/api/routers"

# A database client followed by a query entry point. `db` also matches the
# tail of `context.db`; `tx`/`trx` cover the handle inside an allowed
# `db.transaction(async (tx) => …)`. `\??\.` catches optional chaining.
#
# The entry points are every query member of drizzle-orm's PgDatabase except
# `transaction`. Re-derive them after a Drizzle upgrade with:
#   grep -oE '^\s{4}\$?[a-zA-Z]+[<(?:]' node_modules/drizzle-orm/pg-core/db.d.ts
pattern='\b(db|tx|trx)\??\.(\$count|query|selectDistinctOn|selectDistinct|select|insert|update|delete|execute|refreshMaterializedView|with)\b'

self_test() {
  local failures=0 line
  for line in \
    'await context.db.query.post.findMany({' \
    'context.db.insert(post).values(input)' \
    'await db?.select().from(post)' \
    'await tx.update(post).set({ name })' \
    'trx.delete(post)' \
    'db.$count(post)' \
    'db.execute(sql`select 1`)'; do
    grep -qE "$pattern" <<<"$line" || {
      echo "FAIL: must flag: $line" >&2
      failures=$((failures + 1))
    }
  done
  for line in \
    'await createPost(context.db, input)' \
    'await context.db.transaction(async (tx) => createPost(tx, input))' \
    'const database = context.db;' \
    'selection.update(x)'; do
    if grep -qE "$pattern" <<<"$line"; then
      echo "FAIL: must allow: $line" >&2
      failures=$((failures + 1))
    fi
  done
  if ((failures)); then
    echo "lint-router-db self-test: ${failures} failure(s)" >&2
    return 1
  fi
  echo "lint-router-db self-test: all assertions passed"
}

main() {
  if [[ ${1:-} == --self-test ]]; then
    self_test
    return $?
  fi

  cd "$root"
  local violations=0 file matches line
  while IFS= read -r file; do
    # Tests seed and inspect the database directly; that's their job.
    [[ $file == *.test.ts ]] && continue
    matches="$(grep -nE "$pattern" "$file" || true)"
    [[ -z $matches ]] && continue
    while IFS= read -r line; do
      if [[ -n ${GITHUB_ACTIONS:-} ]]; then
        echo "::error file=${file},line=${line%%:*}::Direct database access in a router: move this query into a service (AGENTS.md § API)."
      fi
      echo "  ${file}:${line}"
      violations=$((violations + 1))
    done <<<"$matches"
  done < <(git ls-files "$routers/*.ts")

  if ((violations)); then
    echo "" >&2
    echo "${violations} direct database access(es) in routers. Every read and write goes through a service in src/server/services/ (AGENTS.md § API)." >&2
    return 1
  fi
  echo "No direct database access in routers."
}

main "$@"
