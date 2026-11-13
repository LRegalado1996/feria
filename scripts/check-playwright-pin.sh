#!/usr/bin/env bash
# Fail when a Playwright container image tag in the workflows disagrees with the
# exact `@playwright/test` pin in package.json.
#
#   bash scripts/check-playwright-pin.sh
#   bash scripts/check-playwright-pin.sh --self-test
#
# CI's e2e job runs in mcr.microsoft.com/playwright:v<version>-noble, whose
# browsers match one Playwright release. Dependabot bumps the package and never
# the image, so a drift kills every e2e test at browser launch, with an error
# that names nothing about the change behind it.

set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG="${PKG:-$root/package.json}"
WORKFLOW_DIR="${WORKFLOW_DIR:-$root/.github/workflows}"

# Given the pin and the newline-separated image versions, prints every
# disagreement; prints nothing when they agree.
pin_mismatch() {
  local pinned="$1" found="$2" v seen=0
  if [[ -z $pinned ]]; then
    echo "could not read an exact @playwright/test pin from package.json"
    return 0
  fi
  while IFS= read -r v; do
    [[ -z $v ]] && continue
    seen=1
    [[ $v == "$pinned" ]] || echo "image tag v${v} does not match the @playwright/test pin ${pinned}"
  done <<< "$found"
  # No tag at all fails: a reworded `container:` line would otherwise turn
  # this check into a silent pass.
  ((seen)) || echo "found no playwright image tag in ${WORKFLOW_DIR}"
  return 0
}

read_pin() {
  grep -oE '"@playwright/test": *"[0-9]+\.[0-9]+\.[0-9]+"' "$PKG" |
    grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1
}

read_image_versions() {
  grep -rhoE 'playwright:v[0-9]+\.[0-9]+\.[0-9]+' "$WORKFLOW_DIR" |
    grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | sort -u
}

self_test() {
  local failures=0 got
  # Counts in this shell: never call it through a pipe.
  expect() { # $1 expected substring ("" = agreement), $2 label, $3 pin, $4 found
    got="$(pin_mismatch "$3" "$4")"
    if [[ -z $1 && -n $got ]] || [[ -n $1 && $got != *"$1"* ]]; then
      echo "FAIL: $2: expected '${1:-agreement}', got '${got}'" >&2
      failures=$((failures + 1))
    fi
  }

  expect "" "a matching tag agrees" 1.63.0 "1.63.0"
  expect "does not match" "a drifted tag fails" 1.63.0 "1.62.0"
  expect "does not match" "one drifted tag of two fails" 1.63.0 $'1.63.0\n1.62.0'
  expect "found no playwright image tag" "no tag at all fails" 1.63.0 ""
  expect "could not read" "a missing pin fails" "" "1.63.0"

  # The repository itself must agree, so a green self-test never sits beside
  # a drifted tree.
  got="$(pin_mismatch "$(read_pin)" "$(read_image_versions)")"
  if [[ -n $got ]]; then
    echo "FAIL: the repository is drifted: ${got}" >&2
    failures=$((failures + 1))
  fi

  if ((failures)); then
    echo "check-playwright-pin self-test: ${failures} failure(s)" >&2
    return 1
  fi
  echo "check-playwright-pin self-test: all assertions passed"
}

main() {
  local problems
  if [[ ${1:-} == --self-test ]]; then
    self_test
    return $?
  fi
  problems="$(pin_mismatch "$(read_pin)" "$(read_image_versions)")"
  if [[ -n $problems ]]; then
    echo "check-playwright-pin: ${problems}" >&2
    echo "Move the image tag in ${WORKFLOW_DIR}/ci.yml to the @playwright/test version (or the reverse)." >&2
    return 1
  fi
  echo "check-playwright-pin: image tags match @playwright/test"
}

main "$@"
