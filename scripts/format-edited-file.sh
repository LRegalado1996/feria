#!/usr/bin/env bash
# Editor hook: format and lint-fix ONLY the file an agent just wrote.
#
#   bash scripts/format-edited-file.sh < hook-event.json
#   bash scripts/format-edited-file.sh --self-test
#
# Claude Code (PostToolUse on Write|Edit) and Cursor (afterFileEdit) both hand
# the edited path over stdin as JSON, under `tool_input.file_path` and
# `file_path` respectively. A whole-repo `ultracite fix` costs ~25 s per edit
# and fails in a worktree whose node_modules are not installed yet; per-file it
# takes about a second. It is the fast feedback path, so it is never
# type-aware: the commit and push hooks and CI still run the full checks.
#
# Exits 0 when there is nothing to do (no path, an unsupported file type, a
# missing file, an unprovisioned worktree). Otherwise it reports ultracite's
# failure as 1, never 2: a lint diagnostic is feedback, not a blocking hook
# error.
set -uo pipefail

format_edited_file() {
  local file root absolute
  file=$(node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => {
      try {
        const event = JSON.parse(raw);
        const path = event?.tool_input?.file_path ?? event?.file_path ?? "";
        process.stdout.write(typeof path === "string" ? path : "");
      } catch {
        process.stdout.write("");
      }
    });
  ')
  [ -n "$file" ] || return 0

  # The same set lint-staged routes to ultracite (package.json § lint-staged).
  case "$file" in
    *.js | *.jsx | *.mjs | *.cjs | *.ts | *.tsx | *.json | *.jsonc | *.css | *.scss | *.md | *.mdx | *.yml | *.yaml | *.toml) ;;
    *) return 0 ;;
  esac

  root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2> /dev/null)}"
  [ -n "$root" ] || return 0
  cd "$root" || return 0

  case "$file" in
    /*) absolute="$file" ;;
    *) absolute="$root/$file" ;;
  esac
  [ -f "$absolute" ] || return 0
  # An unprovisioned worktree has no toolchain yet; the commit hook covers it.
  # The pinned binary, never `pnpm dlx`, which fetches the newest release.
  [ -x node_modules/.bin/ultracite ] || return 0

  node_modules/.bin/ultracite fix "$absolute" || return 1
}

self_test() {
  local failures=0 tmp root status
  fail() {
    echo "FAIL: $1" >&2
    failures=$((failures + 1))
  }
  # Runs the hook in a fake project whose `ultracite` records its arguments
  # and exits with $FAKE_EXIT. Sets `status`.
  hook() { # $1 = stdin JSON
    rm -f "$root/calls"
    printf '%s' "$1" | CLAUDE_PROJECT_DIR="$root" bash "$0" > /dev/null 2>&1
    status=$?
  }
  calls() {
    cat "$root/calls" 2> /dev/null
  }

  tmp="$(mktemp -d "${TMPDIR:-/tmp}/format-edited-file.XXXXXX")" || return 1
  root="$tmp/project"
  mkdir -p "$root/node_modules/.bin" "$root/src"
  touch "$root/src/a.ts" "$root/src/b.png"
  # shellcheck disable=SC2016 # expanded by the fake binary, not here
  printf '#!/usr/bin/env bash\necho "$*" >> "%s/calls"\nexit "${FAKE_EXIT:-0}"\n' "$root" \
    > "$root/node_modules/.bin/ultracite"
  chmod +x "$root/node_modules/.bin/ultracite"

  hook "{\"tool_input\":{\"file_path\":\"$root/src/a.ts\"}}"
  ((status == 0)) || fail "a Claude Code edit must exit 0, got ${status}"
  [[ "$(calls)" == "fix $root/src/a.ts" ]] || fail "a Claude Code edit must fix that file only, got: $(calls)"

  hook '{"file_path":"src/a.ts"}'
  [[ "$(calls)" == "fix $root/src/a.ts" ]] || fail "a relative Cursor path must resolve against the root, got: $(calls)"

  for event in '' 'not json' '{}' '{"file_path":"src/b.png"}' '{"file_path":"src/missing.ts"}'; do
    hook "$event"
    ((status == 0)) || fail "nothing to do must exit 0 for '${event}', got ${status}"
    [[ -z "$(calls)" ]] || fail "nothing to do must not run ultracite for '${event}', got: $(calls)"
  done

  FAKE_EXIT=2 hook '{"file_path":"src/a.ts"}'
  ((status == 1)) || fail "an ultracite failure must exit 1, never 2, got ${status}"

  rm -rf "$root/node_modules"
  hook '{"file_path":"src/a.ts"}'
  ((status == 0)) || fail "an unprovisioned worktree must exit 0, got ${status}"

  rm -rf "$tmp"
  if ((failures)); then
    echo "format-edited-file self-test: ${failures} failure(s)" >&2
    return 1
  fi
  echo "format-edited-file self-test: all assertions passed"
}

if [[ ${1:-} == --self-test ]]; then
  self_test
  exit $?
fi
format_edited_file
