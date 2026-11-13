#!/usr/bin/env bash
# SessionStart hook (.claude/settings.json): provision this checkout inside a
# Claude Code cloud session. It exits at once anywhere else; locally the
# harness configs run `pnpm wt:provision` on worktree creation instead.
#
# It runs on every start, resume and compaction, because a resumed VM keeps
# its disk but not its processes. The heavy work (install, migrate, seed) runs
# in the BACKGROUND: the hook holds the session open until it returns. It
# prints where the log and the ready marker are, so the agent can wait on the
# marker instead of guessing. It does not start the app: `pnpm dev` does, when
# a task needs it. docs/agents/cloud-sessions.md covers the environment.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
readonly PROJECT_DIR
# .wt/ is worktree.sh's gitignored state directory, so nothing here can be
# staged by accident.
readonly STATE_DIR="$PROJECT_DIR/.wt"
readonly LOG_FILE="$STATE_DIR/cloud-session-provision.log"
readonly READY_MARKER="$STATE_DIR/cloud-session-ready"
readonly DOCKERD_LOG="$STATE_DIR/dockerd.log"
# Written by scripts/cloud-session-setup.sh; keep the paths in sync.
readonly NODE_PREFIX="/opt/node"
readonly PLAYWRIGHT_BROWSERS_DIR="/opt/ms-playwright"

# CLAUDE_CODE_REMOTE=true is the documented marker. `check-tools` exists only
# on the cloud VM, for a shell that did not inherit it. WT_CLOUD_SESSION is
# what `pnpm cloud:provision` sets.
is_cloud_session() {
  [[ "${CLAUDE_CODE_REMOTE:-}" == "true" || -n "${WT_CLOUD_SESSION:-}" ]] && return 0
  command -v check-tools >/dev/null 2>&1
}

# Lines for $CLAUDE_ENV_FILE, which Claude Code sources before every command.
# The cloud exports CI=true and NODE_ENV=production to every command: CI makes
# every `wt ensure` a silent no-op, and NODE_ENV=production makes pnpm skip
# devDependencies. The .nvmrc Node must win over the VM's own.
session_env() {
  printf 'unset CI NODE_ENV\n'
  if [[ -d "$NODE_PREFIX/bin" ]]; then
    # shellcheck disable=SC2016 # $PATH expands when the line is sourced
    printf 'export PATH="%s/bin:$PATH"\n' "$NODE_PREFIX"
  fi
  # One Chromium for e2e and agent-browser, filled by the setup script.
  printf 'export PLAYWRIGHT_BROWSERS_PATH="%s"\n' "$PLAYWRIGHT_BROWSERS_DIR"
  local candidate
  for candidate in "$PLAYWRIGHT_BROWSERS_DIR"/chromium-*/chrome-linux*/chrome; do
    if [[ -x "$candidate" ]]; then printf 'export AGENT_BROWSER_EXECUTABLE_PATH="%s"\n' "$candidate"; fi
  done
}

# Starts "$@" in a session of its own: Claude Code may reap the hook's process
# group once it returns. setsid is Linux-only; the fallback serves the
# self-test on macOS.
detach() {
  if command -v setsid >/dev/null 2>&1; then
    setsid "$@" </dev/null &
  else
    "$@" </dev/null &
  fi
}

# dockerd dies with the VM; images and the database volume survive on disk.
start_docker() {
  docker info >/dev/null 2>&1 && return 0
  command -v dockerd >/dev/null 2>&1 || return 1
  # A PID file from the previous VM can name a PID now held by another process.
  pgrep -x dockerd >/dev/null 2>&1 || rm -f /var/run/docker.pid
  detach dockerd >"$DOCKERD_LOG" 2>&1
  local waited=0
  until docker info >/dev/null 2>&1; do
    waited=$((waited + 1))
    ((waited < 150)) || return 1
    sleep 0.2
  done
}

# The background half, run detached by main() through `--provision`. Each step
# fails the run on its own: without `set -e`, a trailing printf would make a
# failed run exit 0 and leave a marker for an environment with no database.
provision() {
  cd "$PROJECT_DIR" || exit 1
  exec >>"$LOG_FILE" 2>&1
  step_failed() {
    printf '=== FAILED at %s after %ss: the ready marker was NOT created ===\n' "$1" "$SECONDS"
    exit 1
  }
  printf '=== %s: provisioning cloud session ===\n' "$(date -u +%FT%TZ)"
  printf -- '--- wt provision (.env + node_modules) ---\n'
  bash scripts/worktree.sh provision || step_failed "wt provision"
  printf -- '--- wt ensure (Postgres, migrate, seed) ---\n'
  bash scripts/worktree.sh ensure || step_failed "wt ensure"
  printf '=== done in %ss ===\n' "$SECONDS"
  touch "$READY_MARKER"
  exit 0
}

# Guards what review rounds caught: a failing step leaves no ready marker and
# says FAILED (the wait loop ends on it), the provisioning run and later
# commands see neither CI nor NODE_ENV, and a resumed session gets its docker
# daemon back without being provisioned again. Runs the real script against
# stubbed worktree.sh, docker and dockerd in a temp tree: no cloud, no docker.
self_test() {
  local failures=0 present tmp
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064 # expand tmp now, not when the trap fires
  trap "rm -rf '$tmp'" EXIT
  mkdir -p "$tmp/scripts" "$tmp/bin"
  cp "${BASH_SOURCE[0]}" "$tmp/scripts/cloud-session-start.sh"
  # The daemon is a file: `docker info` succeeds while it exists.
  printf '#!/bin/sh\n[ -f "%s/docker-up" ]\n' "$tmp" >"$tmp/bin/docker"
  printf '#!/bin/sh\ntouch "%s/docker-up"\n' "$tmp" >"$tmp/bin/dockerd"
  chmod +x "$tmp/bin/docker" "$tmp/bin/dockerd"

  invoke() {
    rm -f "$tmp/claude-env"
    (cd "$tmp" && PATH="$tmp/bin:$PATH" WT_CLOUD_SESSION=1 CLAUDE_PROJECT_DIR="$tmp" \
      CLAUDE_ENV_FILE="$tmp/claude-env" CI=true NODE_ENV=production \
      bash scripts/cloud-session-start.sh >/dev/null 2>&1)
  }

  # The worktree.sh stub records the environment `ensure` saw and exits $1.
  run_case() {
    {
      printf '[ "$1" = ensure ] && printf "CI=[%%s] NODE_ENV=[%%s]\\n" "${CI:-}" "${NODE_ENV:-}" > %s/env-seen\n' "$tmp"
      printf 'exit %s\n' "$1"
    } >"$tmp/scripts/worktree.sh"
    rm -rf "$tmp/.wt" "$tmp/env-seen"
    touch "$tmp/docker-up"
    invoke
    local waited=0
    until grep -qE 'done in|FAILED at' "$tmp/.wt/cloud-session-provision.log" 2>/dev/null; do
      waited=$((waited + 1))
      ((waited < 300)) || break
      sleep 0.1
    done
    # The last line is written just before the run exits; wait for the exit.
    while pgrep -f "$tmp/scripts/cloud-session-start.sh --provision" >/dev/null 2>&1; do
      waited=$((waited + 1))
      ((waited < 350)) || break
      sleep 0.1
    done
  }

  # Called directly, never in a pipe: a subshell would count failures in a copy.
  assert() {
    if [[ "$2" == "$3" ]]; then
      printf '  ok   %s\n' "$1"
    else
      printf '  FAIL %s (expected %s, got %s)\n' "$1" "$3" "$2"
      failures=$((failures + 1))
    fi
  }
  exists() { if [[ -e "$1" ]]; then printf yes; else printf no; fi; }

  printf 'cloud-session-start.sh self-test\n'

  run_case 1
  assert "a failing provisioning step leaves no ready marker" "$(exists "$tmp/.wt/cloud-session-ready")" "no"
  present="no"
  if grep -q 'FAILED at' "$tmp/.wt/cloud-session-provision.log" 2>/dev/null; then present="yes"; fi
  assert "a failed run records FAILED at, which ends the wait loop" "$present" "yes"

  run_case 0
  assert "a successful run creates the ready marker" "$(exists "$tmp/.wt/cloud-session-ready")" "yes"
  assert "the provisioning run sees neither CI nor NODE_ENV" "$(cat "$tmp/env-seen" 2>/dev/null)" "CI=[] NODE_ENV=[]"
  present="no"
  if grep -qx 'unset CI NODE_ENV' "$tmp/claude-env" 2>/dev/null; then present="yes"; fi
  assert "every later command drops CI and NODE_ENV too" "$present" "yes"

  # A resumed session: provisioned before, its daemon gone with the old VM.
  rm -f "$tmp/docker-up" "$tmp/.wt/cloud-session-provision.log"
  invoke
  assert "a provisioned session that lost its daemon gets it back" "$(exists "$tmp/docker-up")" "yes"
  assert "a provisioned session is not provisioned again" "$(exists "$tmp/.wt/cloud-session-provision.log")" "no"

  if ((failures)); then
    printf '%s self-test assertion(s) failed\n' "$failures" >&2
    exit 1
  fi
  printf 'cloud-session-start self-test: all assertions passed\n'
  exit 0
}

main() {
  case "${1:-}" in
    --self-test) self_test ;;
    --provision) provision ;;
  esac

  is_cloud_session || exit 0

  local env_lines
  env_lines="$(session_env)"
  eval "$env_lines"
  if [[ -n "${CLAUDE_ENV_FILE:-}" ]]; then printf '%s\n' "$env_lines" >>"$CLAUDE_ENV_FILE"; fi

  mkdir -p "$STATE_DIR"
  if ! start_docker; then
    printf 'WARN: the docker daemon is not running (log: %s); database commands fail until it is.\n' "$DOCKERD_LOG"
  fi

  if [[ -f "$READY_MARKER" ]]; then
    printf 'Cloud session provisioned. Start the app with `pnpm dev` (in the background) when a task needs it.\n'
    exit 0
  fi

  # A compaction or resume during the first run must not start a second install.
  if ! pgrep -f "$PROJECT_DIR/scripts/cloud-session-start.sh --provision" >/dev/null 2>&1; then
    rm -f "$LOG_FILE"
    detach bash "$PROJECT_DIR/scripts/cloud-session-start.sh" --provision
  fi

  cat <<EOF
Cloud session detected: provisioning in the background.

  log:    $LOG_FILE
  ready:  $READY_MARKER (created only on success)

Wait for it before any database command. The loop ends on either outcome,
because a failed run never writes the marker:
  until [ -f "$READY_MARKER" ] || grep -q 'FAILED at' "$LOG_FILE" 2>/dev/null; do sleep 5; done; tail -5 "$LOG_FILE"

The app does not start by itself: run \`pnpm dev\` in the background when a task
needs it, and drive it from inside the session with agent-browser (nothing in
the session is reachable from outside). docs/agents/cloud-sessions.md has the details.
EOF
  exit 0
}

main "$@"
