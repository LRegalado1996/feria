#!/usr/bin/env bash
# Shellcheck the shell scripts held to a clean bar.
#
#   bash scripts/lint-sh.sh              every script in CLEAN
#   bash scripts/lint-sh.sh <file>...    the given files that CLEAN lists (lint-staged)
#   bash scripts/lint-sh.sh --self-test
#
# CLEAN is the only list: lint-staged hands over every staged script and this
# keeps the listed ones, so the list never drifts between places. A script
# joins it once `shellcheck -S warning` passes on it, so new shell is covered
# from the day it lands. Without shellcheck installed it skips with exit 0
# (CI images have it; locally `brew install shellcheck`).

set -euo pipefail

CLEAN=(
  scripts/check-playwright-pin.sh
  scripts/cloud-session-setup.sh
  scripts/cloud-session-start.sh
  scripts/format-edited-file.sh
  scripts/lint-router-db.sh
  scripts/lint-sh.sh
  scripts/run-parallel.sh
  scripts/turbo-build.sh
  scripts/vercel-ignore.sh
  scripts/verify-ci.sh
  scripts/worktree-entrypoint.sh
  scripts/worktree.sh
)

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Prints the CLEAN entries among the arguments (absolute or repo-relative
# paths), or every entry when there are none.
selected() {
  local file entry
  if (($# == 0)); then
    printf '%s\n' "${CLEAN[@]}"
    return 0
  fi
  for file in "$@"; do
    file="${file#"$root"/}"
    for entry in "${CLEAN[@]}"; do
      if [[ $file == "$entry" ]]; then
        printf '%s\n' "$entry"
      fi
    done
  done
}

self_test() {
  local failures=0 out entry
  fail() {
    echo "FAIL: $1" >&2
    failures=$((failures + 1))
  }

  out="$(selected)"
  [[ $out == "$(printf '%s\n' "${CLEAN[@]}")" ]] || fail "no arguments must select all of CLEAN, got: ${out}"

  out="$(selected "$root/scripts/run-parallel.sh" scripts/setup.sh README.md scripts/worktree-entrypoint.sh)"
  [[ $out == $'scripts/run-parallel.sh\nscripts/worktree-entrypoint.sh' ]] ||
    fail "arguments must be narrowed to CLEAN, absolute or relative, got: ${out}"

  out="$(selected scripts/setup.sh)"
  [[ -z $out ]] || fail "a script outside CLEAN must select nothing, got: ${out}"

  for entry in "${CLEAN[@]}"; do
    [[ -f "$root/$entry" ]] || fail "CLEAN lists ${entry}, which does not exist"
  done

  if ((failures)); then
    echo "lint-sh self-test: ${failures} failure(s)" >&2
    return 1
  fi
  echo "lint-sh self-test: all assertions passed"
}

main() {
  local files=() file
  if [[ ${1:-} == --self-test ]]; then
    self_test
    return $?
  fi
  if ! command -v shellcheck > /dev/null 2>&1; then
    echo "lint-sh: shellcheck not installed, skipping (brew install shellcheck)" >&2
    return 0
  fi
  while IFS= read -r file; do
    files+=("$file")
  done < <(selected "$@")
  # bash 3.2 treats an empty array as unbound under `set -u`.
  ((${#files[@]})) || return 0
  cd "$root"
  shellcheck -S warning "${files[@]}"
}

main "$@"
