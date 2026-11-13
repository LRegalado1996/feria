#!/usr/bin/env bash
# Per-worktree dev stack. Each git worktree gets its own Postgres (and, on
# request, an app container) on ports derived from its path, so worktrees never
# share a database or a port. The stack is lazy and tiered:
#
#   tier 0  provision  .env + host node_modules, no containers
#   tier 1  ensure     Postgres up, migrated, seeded once. The db:*, dev,
#                      test:integration and e2e scripts run it for you.
#   tier 2  app        the dev-server container, only when asked for
#
# `bash scripts/worktree.sh help` lists every command. The agent guide is the
# worktree-env skill (.agents/skills/worktree-env/SKILL.md).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
readonly PROJECT_ROOT

# Hoisted before any git call. Wrapped pnpm scripts run `ensure` in places that
# bring their own database and may have no usable git: CI and Vercel builds
# (CI=1, and a CLI deploy has no .git at all) and the app container (its .git
# file points at a host path). They must exit here, before the context below
# dies on them.
if [[ "${1:-}" == "ensure" ]]; then
  if [[ "${CI:-}" == "true" || "${CI:-}" == "1" || -n "${SKIP_WT_ENSURE:-}" || -n "${WT_STACK_CONTAINER:-}" ]]; then
    for arg in "$@"; do
      if [[ "$arg" == "--json" ]]; then printf '{"ok":true,"skipped":true}\n'; fi
    done
    exit 0
  fi
fi

if [[ -t 1 ]]; then
  RESET=$'\033[0m' BOLD=$'\033[1m' DIM=$'\033[38;5;102m' CYAN=$'\033[38;5;117m'
  GREEN=$'\033[38;5;114m' YELLOW=$'\033[38;5;221m' RED=$'\033[38;5;203m'
else
  RESET='' BOLD='' DIM='' CYAN='' GREEN='' YELLOW='' RED=''
fi

has_command() { command -v "$1" >/dev/null 2>&1; }
info() { printf '  %s→ %s%s\n' "$DIM" "$1" "$RESET"; }
ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn_msg() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
title() { printf '\n  %s%s%s  %s(%s)%s\n\n' "$BOLD" "$1" "$RESET" "$DIM" "${WORKTREE_ID:-?}" "$RESET"; }
# `ensure` runs inside wrapped pnpm scripts: their stdout belongs to the
# wrapped command (or to --json), so its progress goes to stderr.
ensure_action() { printf '  %s[wt]%s %s\n' "$CYAN" "$RESET" "$1" >&2; }

die() {
  printf '  %sError:%s %s\n' "$RED" "$RESET" "$1" >&2
  exit 1
}

# Releases the ensure mutex on every exit path, die included, so a crashed
# ensure never blocks the next wrapped command.
WT_LOCK_HELD=0
cleanup() {
  if [[ "$WT_LOCK_HELD" == 1 ]]; then
    rm -rf "$WT_ENSURE_LOCK"
    WT_LOCK_HELD=0
  fi
}
trap cleanup EXIT

sed_inplace() {
  if [[ "$OSTYPE" == darwin* ]]; then sed -i '' "$@"; else sed -i "$@"; fi
}

file_mtime() {
  if [[ "$OSTYPE" == darwin* ]]; then stat -f %m "$1" 2>/dev/null || echo 0; else stat -c %Y "$1" 2>/dev/null || echo 0; fi
}

set_env_var() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed_inplace "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

# ---------------------------------------------------------------------------
# Worktree identity and ports. Ports are always derived from the worktree
# path, never stored, so two worktrees can never pick the same ones.
# ---------------------------------------------------------------------------

# Compose project names allow only [a-z0-9_-] and must start alphanumeric.
slugify_id() {
  local cleaned
  cleaned="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]+/-/g; s/-+/-/g; s/^-+//; s/-+$//')"
  [[ -n "$cleaned" ]] || cleaned="wt"
  [[ "$cleaned" =~ ^[a-z0-9] ]] || cleaned="w${cleaned}"
  printf '%s' "$cleaned"
}

path_hash() { printf '%s' "$1" | cksum | awk '{ print $1 }'; }

# Compose project of any worktree path (gc uses it for worktrees other than this one).
project_for_path() {
  if [[ "$1" == "$MAIN_WORKTREE" ]]; then
    printf 'feria-main'
    return
  fi
  printf 'feria-%s-%x' "$(slugify_id "$(basename "$1")")" "$(path_hash "$1")"
}

MAIN_WORKTREE="$(git -C "$PROJECT_ROOT" worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p')" || true
[[ -n "$MAIN_WORKTREE" ]] || die "not inside a git checkout: $PROJECT_ROOT"
readonly MAIN_WORKTREE

if [[ "$(git -C "$PROJECT_ROOT" rev-parse --git-dir)" == "$(git -C "$PROJECT_ROOT" rev-parse --git-common-dir)" ]]; then
  WORKTREE_ID="main"
  OFFSET=0
  APP_ALIAS="feria"
else
  WORKTREE_ID="$(slugify_id "$(basename "$PROJECT_ROOT")")-$(printf '%x' "$(path_hash "$PROJECT_ROOT")")"
  OFFSET=$((($(path_hash "$PROJECT_ROOT") % 500) * 10))
  APP_ALIAS="${WORKTREE_ID}.feria"
fi
readonly WORKTREE_ID OFFSET APP_ALIAS
readonly COMPOSE_PROJECT="feria-${WORKTREE_ID}"
readonly APP_PORT=$((13000 + OFFSET))
readonly PG_PORT=$((15432 + OFFSET))
readonly DB_URL="postgresql://feria:feria@localhost:${PG_PORT}/feria"

# `.wt/` (gitignored) holds only re-derivable state: stamps that let `ensure`
# skip work, its lock, and the host dev server's PID.
readonly WT_DIR="$PROJECT_ROOT/.wt"
readonly WT_MIGRATIONS_STAMP="$WT_DIR/migrations-stamp"
readonly WT_SEED_STAMP="$WT_DIR/seed-stamp"
readonly WT_COMPOSE_STAMP="$WT_DIR/compose-stamp"
readonly WT_DEV_SERVER_PID="$WT_DIR/dev-server.pid"
readonly WT_ENSURE_LOCK="$WT_DIR/ensure.lock"
readonly WT_JOURNAL="$PROJECT_ROOT/src/server/db/drizzle/meta/_journal.json"

# ---------------------------------------------------------------------------
# URLs. portless gives each worktree a stable *.feria.localhost URL, but only
# while its proxy runs: a URL written while it is down breaks BETTER_AUTH_URL.
# ---------------------------------------------------------------------------

remove_portless_alias() {
  if has_command portless; then
    portless alias --remove "$APP_ALIAS" >/dev/null 2>&1 || true
  fi
}

# Registers this worktree's alias and prints the URL portless serves it at
# (https on 443, or http on its fallback port). Fails while the proxy is down:
# `portless list` prints stored routes and exits 0 even then, so only a
# connection to the URL proves the proxy runs.
portless_url() {
  has_command portless || return 1
  portless alias "$APP_ALIAS" "$APP_PORT" --force >/dev/null 2>&1 || return 1
  local url
  url="$(portless list 2>/dev/null | awk -v host="${APP_ALIAS}.localhost" '
    { u = $1; sub(/^[a-z]+:\/\//, "", u); sub(/:[0-9]+$/, "", u) }
    !found && u == host { print $1; found = 1 }')" || return 1
  [[ -n "$url" ]] || return 1
  curl -sk -o /dev/null --max-time 2 "$url" || return 1
  printf '%s' "$url"
}

app_url() {
  portless_url || printf 'http://localhost:%s' "$APP_PORT"
}

# Creates .env when missing (a linked worktree inherits the main checkout's
# shared secrets), then points it at this worktree's database and URL.
generate_env() {
  local env_file="$PROJECT_ROOT/.env"
  if [[ ! -f "$env_file" ]]; then
    if [[ "$PROJECT_ROOT" != "$MAIN_WORKTREE" && -f "$MAIN_WORKTREE/.env" ]]; then
      cp "$MAIN_WORKTREE/.env" "$env_file"
    elif [[ -f "$PROJECT_ROOT/.env.example" ]]; then
      cp "$PROJECT_ROOT/.env.example" "$env_file"
    else
      : >"$env_file"
    fi
  fi

  if [[ -z "$(sed -n 's/^BETTER_AUTH_SECRET=//p' "$env_file" | tr -d "\"'")" ]]; then
    has_command openssl || die "openssl is required to generate BETTER_AUTH_SECRET"
    set_env_var "$env_file" "BETTER_AUTH_SECRET" "\"$(openssl rand -base64 32)\""
  fi

  local url
  url="$(app_url)"
  set_env_var "$env_file" "DATABASE_URL" "\"${DB_URL}\""
  set_env_var "$env_file" "BETTER_AUTH_URL" "\"${url}\""
  set_env_var "$env_file" "E2E_BASE_URL" "\"${url}\""
}

env_targets_this_worktree() { grep -qF "\"${DB_URL}\"" "$PROJECT_ROOT/.env" 2>/dev/null; }

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------

# A host that trusts an extra CA (a TLS-intercepting proxy, as in a Claude Code
# cloud session) hands it to the app container through the proxy-CA overlay.
proxy_ca_file() {
  [[ -n "${NODE_EXTRA_CA_CERTS:-}" && -r "${NODE_EXTRA_CA_CERTS:-}" ]] && printf '%s' "$NODE_EXTRA_CA_CERTS"
}

compose_files() {
  printf '%s\n' "$PROJECT_ROOT/docker-compose.base.yaml" "$PROJECT_ROOT/docker-compose.worktree.yaml"
  if proxy_ca_file >/dev/null; then printf '%s\n' "$PROJECT_ROOT/docker-compose.proxy-ca.yaml"; fi
}

run_compose() {
  local args=() file
  while IFS= read -r file; do args+=(-f "$file"); done < <(compose_files)
  env FERIA_APP_PORT="$APP_PORT" FERIA_PG_PORT="$PG_PORT" FERIA_WORKTREE_DIR="$PROJECT_ROOT" \
    FERIA_PROXY_CA_FILE="$(proxy_ca_file || true)" \
    docker compose -p "$COMPOSE_PROJECT" "${args[@]}" "$@"
}

compose_or_die() {
  local label="$1" out
  shift
  if ! out="$(run_compose "$@" 2>&1)"; then
    printf '%s\n' "$out" >&2
    die "$label failed (pnpm wt:doctor)"
  fi
}

require_docker() {
  has_command docker || die "docker is required"
  docker info >/dev/null 2>&1 || die "Docker is not running: start Docker Desktop or OrbStack, then re-run"
}

container_name() { printf '%s-%s-1' "$COMPOSE_PROJECT" "$1"; }

# One of: running-healthy | starting | running | stopped | absent
container_state() {
  local out
  out="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$(container_name "$1")" 2>/dev/null)" || {
    printf 'absent'
    return
  }
  case "$out" in
    "running healthy") printf 'running-healthy' ;;
    "running starting") printf 'starting' ;;
    running*) printf 'running' ;;
    *) printf 'stopped' ;;
  esac
}

is_running() {
  case "$(container_state "$1")" in running-healthy | running | starting) return 0 ;; esac
  return 1
}

psql_db() {
  docker exec -e PGPASSWORD=feria "$(container_name db)" psql -U feria -d feria -qAt -c "$1" 2>/dev/null
}

wait_for_db_ready() {
  local ticks=0
  while ((ticks < $1 * 10)); do
    docker exec "$(container_name db)" pg_isready -U feria -d feria -q 2>/dev/null && return 0
    sleep 0.1
    ticks=$((ticks + 1))
  done
  return 1
}

wait_for_app() {
  local elapsed=0
  printf '  Waiting for the app at http://localhost:%s ...\n' "$APP_PORT" >&2
  while ((elapsed < $1)); do
    curl -sf -o /dev/null "http://127.0.0.1:${APP_PORT}" 2>/dev/null && return 0
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

# ---------------------------------------------------------------------------
# Stamps: let the hot path of `ensure` skip the database probe entirely.
# ---------------------------------------------------------------------------

file_stamp() { cksum "$@" 2>/dev/null | cksum | awk '{ print $1 "-" $2 }'; }

# Fails on a missing journal: "cannot stamp" must never compare equal.
journal_stamp() {
  [[ -f "$WT_JOURNAL" ]] || return 1
  file_stamp "$WT_JOURNAL"
}

migrations_stamp_matches() {
  local current
  current="$(journal_stamp)" || return 1
  [[ -f "$WT_MIGRATIONS_STAMP" && "$(cat "$WT_MIGRATIONS_STAMP")" == "$current" ]]
}

compose_stamp() {
  local files=() file
  while IFS= read -r file; do files+=("$file"); done < <(compose_files)
  file_stamp "${files[@]}"
}

compose_stamp_matches() {
  [[ -f "$WT_COMPOSE_STAMP" && "$(cat "$WT_COMPOSE_STAMP")" == "$(compose_stamp)" ]]
}

# mkdir mutex: two panes racing `ensure` must not both drive compose. A holder
# is stale only when its PID is dead; an age window would break the mutex under
# long legitimate work such as a cold image pull.
acquire_ensure_lock() {
  mkdir -p "$WT_DIR"
  local waited=0 holder
  while ! mkdir "$WT_ENSURE_LOCK" 2>/dev/null; do
    holder="$(cat "$WT_ENSURE_LOCK/pid" 2>/dev/null || true)"
    if [[ "$holder" =~ ^[0-9]+$ ]] && kill -0 "$holder" 2>/dev/null; then
      : # live holder: keep waiting
    elif (($(date +%s) - $(file_mtime "$WT_ENSURE_LOCK") > 5)); then
      # Dead or never-written PID (5 s covers a healthy acquirer's mkdir→write window).
      rm -rf "$WT_ENSURE_LOCK"
      continue
    fi
    sleep 0.5
    waited=$((waited + 1))
    ((waited < 720)) || die "ensure: a concurrent ensure (pid ${holder:-unknown}) has held the lock for 6 min; remove $WT_ENSURE_LOCK if it is wedged"
  done
  printf '%s' "$$" >"$WT_ENSURE_LOCK/pid"
  WT_LOCK_HELD=1
}

# Answers t (migrated), f (fresh) or error through PROBE_MIGRATION_STATE, and
# writes nothing to stdout: a `x="$(probe_migration_state)"` caller would run it
# in a subshell and lose PROBE_ATTEMPTS_USED. Retried because on a container's
# first start initdb's temporary server can satisfy pg_isready and then restart,
# so a single-shot probe fails against a database that is healthy a second later.
PROBE_ATTEMPTS_USED=0
PROBE_MIGRATION_STATE=""
probe_migration_state() {
  local max_attempts="${WT_PROBE_MAX_ATTEMPTS:-30}"
  PROBE_ATTEMPTS_USED=0
  while :; do
    PROBE_MIGRATION_STATE="$(psql_db "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL" || printf 'error')"
    case "$PROBE_MIGRATION_STATE" in t | f) return 0 ;; esac
    PROBE_ATTEMPTS_USED=$((PROBE_ATTEMPTS_USED + 1))
    ((PROBE_ATTEMPTS_USED < max_attempts)) || return 0
    sleep "${WT_PROBE_SLEEP_SECONDS:-1}"
  done
}

# Prints the PID of the host `next dev` the PID file names, while it is alive.
# A live PID alone proves nothing: the file survives a reboot, and by then its
# number can belong to another process.
host_dev_server_pid() {
  local pid args
  pid="$(cat "$1" 2>/dev/null)" || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  args="$(ps -p "$pid" -o args= 2>/dev/null)" || return 1
  [[ "$args" == *"next dev"* ]] || return 1
  printf '%s' "$pid"
}

host_step_or_die() {
  local label="$1" out
  shift
  if ! out="$(cd "$PROJECT_ROOT" && "$@" 2>&1)"; then
    printf '%s\n' "$out" >&2
    die "$label failed"
  fi
}

# ---------------------------------------------------------------------------
# Tiered lifecycle
# ---------------------------------------------------------------------------

cmd_provision() {
  title "Provision (tier 0: no containers)"
  has_command pnpm || die "pnpm is required (corepack enable)"
  generate_env
  ok "Generated .env for worktree ${WORKTREE_ID}"

  info "pnpm install --frozen-lockfile"
  host_step_or_die "pnpm install" env SKIP_WT_ENSURE=1 pnpm install --frozen-lockfile
  ok "Installed host node_modules"

  if [[ -x "$PROJECT_ROOT/node_modules/.bin/playwright" ]]; then
    if (cd "$PROJECT_ROOT" && pnpm exec playwright install chromium >/dev/null 2>&1); then
      ok "Playwright Chromium present"
    else
      warn_msg "Playwright Chromium not installed (e2e installs it on first run)"
    fi
  fi

  printf '\n'
  info "app       $(app_url)  (pnpm dev, or pnpm wt:app for the container)"
  info "postgres  localhost:${PG_PORT}  (starts with the first command that needs it)"
}

cmd_ensure() {
  local include_app=0 json=0 no_seed=0 arg
  for arg in "$@"; do
    case "$arg" in
      --app) include_app=1 ;;
      --json) json=1 ;;
      # The db:seed wrapper passes it: the wrapped command IS the seed.
      --no-seed) no_seed=1 ;;
      --quiet | -q) : ;; # accepted for wrapper readability; ensure is terse already
      *) die "ensure: unknown option $arg" ;;
    esac
  done

  # Internal callers (dev, app) reach here without the hoisted guard.
  if [[ "${CI:-}" == "true" || "${CI:-}" == "1" || -n "${SKIP_WT_ENSURE:-}" || -n "${WT_STACK_CONTAINER:-}" ]]; then
    if ((json)); then printf '{"ok":true,"skipped":true}\n'; fi
    return 0
  fi

  local t0=$SECONDS actions=()
  docker info >/dev/null 2>&1 || die "Docker is not running: this command needs the worktree database (start Docker, then re-run)"
  acquire_ensure_lock

  # A copied .env would silently target a sibling worktree's Postgres.
  if ! env_targets_this_worktree; then
    generate_env
    actions+=("env")
  fi

  # `up`, never `start`: start would resurrect a container built from an older
  # compose definition (an old Postgres image, above all). The compose stamp
  # lets the healthy hot path skip `up` and still converge after a checkout
  # changes the compose files. A running app converges in the same pass; a
  # stopped one is left alone, because `up` would start the expensive tier.
  local db_state created=0 converged=0
  db_state="$(container_state db)"
  if [[ "$db_state" == "absent" ]]; then
    ensure_action "creating the db container"
    compose_or_die "ensure: creating the db container" up -d db
    created=1
    converged=1
    actions+=("db-created")
  elif [[ "$db_state" != "running-healthy" ]] || ! compose_stamp_matches; then
    ensure_action "starting the db container"
    local services=(db)
    is_running app && services+=(app)
    compose_or_die "ensure: starting the db container" up -d "${services[@]}"
    converged=1
    actions+=("db-started")
  fi
  if ((converged)); then
    compose_stamp >"$WT_COMPOSE_STAMP"
    wait_for_db_ready 90 || die "ensure: Postgres did not become ready (pnpm wt:logs db, pnpm wt:doctor)"
  fi

  # The stamps skip the probe on the hot path. A created container may sit on
  # a wiped volume, so creation always probes.
  if ((created)) || ! migrations_stamp_matches || [[ ! -f "$WT_SEED_STAMP" ]]; then
    probe_migration_state
    local fresh=0
    case "$PROBE_MIGRATION_STATE" in
      t) fresh=0 ;;
      f) fresh=1 ;;
      *) die "ensure: could not read the migration state after ${PROBE_ATTEMPTS_USED} attempts (psql said: ${PROBE_MIGRATION_STATE:-nothing})" ;;
    esac

    if ((fresh)) || ! migrations_stamp_matches; then
      [[ -x "$PROJECT_ROOT/node_modules/.bin/drizzle-kit" ]] || {
        ensure_action "installing host node_modules"
        host_step_or_die "ensure: pnpm install" env SKIP_WT_ENSURE=1 pnpm install --frozen-lockfile
        actions+=("install")
      }
      ensure_action "applying migrations"
      host_step_or_die "ensure: migrations" env SKIP_WT_ENSURE=1 DATABASE_URL="$DB_URL" pnpm db:migrate
      journal_stamp >"$WT_MIGRATIONS_STAMP" || true
      actions+=("migrate")
    fi

    # The seed stamp is written only after a seed succeeds, so an interrupted
    # seed is retried. A populated database (seeded by hand, or before stamps
    # existed) is adopted rather than seeded twice.
    local seed=0 users
    if ((fresh)); then
      seed=1
    elif [[ ! -f "$WT_SEED_STAMP" ]]; then
      users="$(psql_db 'SELECT count(*) FROM "user"' || printf 'error')"
      case "$users" in
        0) seed=1 ;;
        *[!0-9]* | "") die "ensure: could not read the seed state (psql said: ${users:-nothing})" ;;
        *) printf 'adopted' >"$WT_SEED_STAMP" ;;
      esac
    fi
    if ((seed)); then
      if ((no_seed)); then
        ensure_action "fresh database left unseeded (the wrapped command seeds it)"
      else
        ensure_action "seeding the fresh database"
        host_step_or_die "ensure: seed" env SKIP_WT_ENSURE=1 DATABASE_URL="$DB_URL" pnpm db:seed
        printf 'seeded' >"$WT_SEED_STAMP"
        actions+=("seed")
      fi
    fi
  fi

  # A host `next dev` (pnpm dev) already serves APP_PORT; the container could
  # not bind it, so the app tier uses that server instead.
  local app_state="not-requested"
  if ((include_app)) && host_dev_server_pid "$WT_DEV_SERVER_PID" >/dev/null; then
    app_state="host-dev"
    include_app=0
  fi
  if ((include_app)); then
    is_running app || {
      ensure_action "starting the app container (first start installs its node_modules)"
      actions+=("app-started")
    }
    # Unconditional `up`: a running app whose compose config changed is recreated.
    compose_or_die "ensure: starting the app container" up -d app
    # A timeout is a failure: reporting ok would hand callers a dead URL.
    wait_for_app 240 || die "ensure: the app container did not serve HTTP within 240s (pnpm wt:logs, pnpm wt:doctor)"
    app_state="$(container_state app)"
  fi

  if ((${#actions[@]})); then
    ensure_action "ready in $((SECONDS - t0))s (${actions[*]})"
  fi
  if ((json)); then
    local list="" action
    for action in ${actions[@]+"${actions[@]}"}; do list+="${list:+,}\"$action\""; done
    printf '{"ok":true,"worktree":"%s","project":"%s","tookSeconds":%s,"actions":[%s],"services":{"db":"%s","app":"%s"}}\n' \
      "$WORKTREE_ID" "$COMPOSE_PROJECT" "$((SECONDS - t0))" "$list" "$(container_state db)" "$app_state"
  fi
  cleanup
}

cmd_app() {
  require_docker
  cmd_ensure --app
  title "App container (tier 2)"
  ok "$(app_url)"
  info "Logs: pnpm wt:logs   Stop it when done: pnpm wt:pause --app"
}

cmd_dev() {
  local running
  if running="$(host_dev_server_pid "$WT_DEV_SERVER_PID")"; then
    ok "next dev already serves this worktree (pid ${running}): $(app_url)"
    return 0
  fi
  cmd_ensure
  if is_running app; then
    die "the app container already serves port ${APP_PORT}: stop it first (pnpm wt:pause --app)"
  fi
  title "next dev on port ${APP_PORT}"
  info "$(app_url)"
  cd "$PROJECT_ROOT"
  mkdir -p "$WT_DIR"
  # exec keeps this PID, so the file names the live dev server.
  printf '%s' "$$" >"$WT_DEV_SERVER_PID"
  exec env SKIP_WT_ENSURE=1 node node_modules/next/dist/bin/next dev --hostname 0.0.0.0 --port "$APP_PORT"
}

cmd_pause() {
  local app_only=0 arg
  for arg in "$@"; do if [[ "$arg" == "--app" ]]; then app_only=1; fi; done
  # Harness settle hooks call this after every turn, Docker running or not.
  if ! docker info >/dev/null 2>&1; then
    ok "Docker is not running: nothing to pause"
    return 0
  fi
  # A host `next dev` keeps using the database, so it keeps it running.
  local running
  if ((!app_only)) && running="$(host_dev_server_pid "$WT_DEV_SERVER_PID")"; then
    warn_msg "next dev (pid ${running}) is using the database: pausing only the app container"
    app_only=1
  fi
  if ((app_only)); then
    compose_or_die "pause --app" stop app
    ok "App container stopped (pnpm wt:app brings it back)"
  else
    compose_or_die "pause" stop
    ok "Paused; volumes kept. The next command that needs the database resumes it in about a second"
  fi
}

cmd_down() {
  local args=() arg
  for arg in "$@"; do
    case "$arg" in --volumes | -v) args+=(--volumes) ;; esac
  done
  require_docker
  remove_portless_alias
  title "Stop and remove containers${args[*]:+ and volumes}"
  run_compose down ${args[@]+"${args[@]}"} || die "compose down failed"
  ok "Stopped"
}

# Reclaims stacks and volumes of DELETED worktrees. Liveness comes from
# `git worktree list`, and each candidate's recorded directory must really be
# gone, so a stopped stack of a living worktree, or another clone's stack, is
# never touched. Destructive, so it only lists until --yes.
cmd_gc() {
  local yes=0 arg
  for arg in "$@"; do if [[ "$arg" == "--yes" || "$arg" == "-y" ]]; then yes=1; fi; done
  require_docker

  # A prunable entry (directory deleted without `git worktree remove`) is
  # exactly what gc reclaims, so it does not count as live. A failed listing is
  # fatal: an empty live set would mark every stack on the machine an orphan.
  local listing known="" wt_path
  listing="$(git -C "$PROJECT_ROOT" worktree list --porcelain)" || die "gc: could not list git worktrees"
  while IFS= read -r wt_path; do
    if [[ -n "$wt_path" && -d "$wt_path" ]]; then known+=" $(project_for_path "$wt_path") "; fi
  done < <(printf '%s\n' "$listing" | awk '
    /^worktree / { path = substr($0, 10) }
    /^prunable/ { path = "" }
    /^$/ { if (path != "") print path; path = "" }
    END { if (path != "") print path }')
  [[ -n "$known" ]] || die "gc: no registered worktree resolved; refusing to reclaim anything"

  title "Stacks of deleted worktrees"
  local proj found=0 n_containers n_volumes owner cid vol note
  while IFS= read -r proj; do
    [[ -n "$proj" && "$known" != *" $proj "* ]] || continue
    found=1
    n_containers="$(docker ps -aq --filter "label=com.docker.compose.project=$proj" | grep -c . || true)"
    n_volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=$proj" | grep -c . || true)"
    # Provenance: delete only what provably belonged to a directory that is gone.
    owner=""
    cid="$(docker ps -aq --filter "label=com.docker.compose.project=$proj" | head -1)"
    if [[ -n "$cid" ]]; then
      owner="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$cid" 2>/dev/null || true)"
    else
      vol="$(docker volume ls -q --filter "label=com.docker.compose.project=$proj" | head -1)"
      [[ -z "$vol" ]] || owner="$(docker volume inspect -f '{{index .Labels "feria.worktree-dir"}}' "$vol" 2>/dev/null || true)"
    fi
    note="${n_containers} container(s), ${n_volumes} volume(s)"
    if [[ -z "$owner" || "$owner" == "unknown" || "$owner" == "<no value>" ]]; then
      printf '  %s%s%s  %s, owner unknown %s(never auto-deleted: docker volume rm by hand)%s\n' "$CYAN" "$proj" "$RESET" "$note" "$DIM" "$RESET"
    elif [[ -d "$owner" ]]; then
      printf '  %s%s%s  directory still exists: %s %s(skipped)%s\n' "$CYAN" "$proj" "$RESET" "$owner" "$DIM" "$RESET"
    elif ((yes)); then
      docker ps -aq --filter "label=com.docker.compose.project=$proj" | xargs docker rm -f >/dev/null 2>&1 || true
      docker volume ls -q --filter "label=com.docker.compose.project=$proj" | xargs docker volume rm >/dev/null 2>&1 || true
      printf '  %s%s%s  %s %s(removed)%s\n' "$CYAN" "$proj" "$RESET" "$note" "$DIM" "$RESET"
    else
      printf '  %s%s%s  %s, was %s %s(would remove)%s\n' "$CYAN" "$proj" "$RESET" "$note" "$owner" "$DIM" "$RESET"
    fi
  done < <({
    docker ps -a --format '{{.Label "com.docker.compose.project"}}'
    docker volume ls --format '{{.Label "com.docker.compose.project"}}'
  } | grep '^feria-' | sort -u)

  if ((!found)); then
    ok "No orphaned stacks: every feria-* project belongs to a registered worktree"
  elif ((!yes)); then
    printf '\n'
    warn_msg "Listing only. pnpm wt:gc --yes deletes them, databases included"
  fi
}

DOCTOR_CHECKS=()
doctor_check() { DOCTOR_CHECKS+=("$1|$2|$3"); }

cmd_doctor() {
  local json=0 arg
  for arg in "$@"; do if [[ "$arg" == "--json" ]]; then json=1; fi; done

  local docker_ok=0
  if docker info >/dev/null 2>&1; then
    docker_ok=1
    doctor_check docker.daemon pass "docker daemon reachable"
    if run_compose config -q >/dev/null 2>&1; then
      doctor_check compose.config pass "compose files parse for $COMPOSE_PROJECT"
    else
      doctor_check compose.config fail "compose config invalid: run_compose config shows why"
    fi
  else
    doctor_check docker.daemon fail "docker daemon not reachable: start Docker Desktop or OrbStack"
  fi

  if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
    doctor_check env.file warn ".env missing: pnpm wt:provision (or any db command) creates it"
  elif env_targets_this_worktree; then
    doctor_check env.file pass ".env targets this worktree's database on port $PG_PORT"
  else
    doctor_check env.file fail ".env DATABASE_URL is not this worktree's database on port $PG_PORT: pnpm wt:env"
  fi

  if [[ -x "$PROJECT_ROOT/node_modules/.bin/drizzle-kit" && -x "$PROJECT_ROOT/node_modules/.bin/next" ]]; then
    doctor_check host.toolchain pass "host node_modules present"
  else
    doctor_check host.toolchain warn "host node_modules incomplete: pnpm wt:provision"
  fi

  if [[ ! -f "$WT_JOURNAL" ]]; then
    doctor_check db.migrations fail "drizzle journal missing at src/server/db/drizzle/meta/_journal.json"
  elif migrations_stamp_matches; then
    doctor_check db.migrations pass "migrations applied up to the current journal"
  else
    doctor_check db.migrations warn "migrations pending: the next ensure applies them"
  fi

  if ((docker_ok)); then
    doctor_check service.db pass "$(container_state db)"
    doctor_check service.app pass "$(container_state app)"

    # An old container on a bumped Postgres pin is the "works locally, fails
    # in production" class.
    local want have
    want="$(awk '/^[[:space:]]*image: postgres/ { print $2; exit }' "$PROJECT_ROOT/docker-compose.base.yaml")"
    have="$(docker inspect -f '{{.Config.Image}}' "$(container_name db)" 2>/dev/null || true)"
    if [[ -z "$have" || "$have" == "$want" ]]; then
      doctor_check db.image pass "db image ${have:-not created yet} matches the pin ${want}"
    else
      doctor_check db.image fail "db runs $have but compose pins $want: pnpm wt:down --volumes, then any db command (a major bump cannot reuse the volume)"
    fi

    local stale="" proj dir
    while IFS= read -r proj; do
      [[ -n "$proj" ]] || continue
      dir="$(docker ps -a --filter "label=com.docker.compose.project=$proj" --format '{{.Label "com.docker.compose.project.working_dir"}}' | head -1)"
      [[ -z "$dir" || -d "$dir" ]] || stale+="$proj "
    done < <(docker ps -a --format '{{.Label "com.docker.compose.project"}}' | grep '^feria-' | sort -u)
    if [[ -n "$stale" ]]; then
      doctor_check machine.stale-stacks warn "stacks of deleted worktrees: ${stale}(pnpm wt:gc lists them; --yes deletes)"
    else
      doctor_check machine.stale-stacks pass "no stacks of deleted worktrees"
    fi
  fi

  local failed=0 check id status msg
  for check in "${DOCTOR_CHECKS[@]}"; do
    if [[ "$check" == *"|fail|"* ]]; then failed=1; fi
  done
  if ((json)); then
    node -e '
      const checks = process.argv.slice(1).map((c) => {
        const [id, status, ...rest] = c.split("|");
        return { id, status, message: rest.join("|") };
      });
      console.log(JSON.stringify({ ok: checks.every((c) => c.status !== "fail"), checks }));
    ' "${DOCTOR_CHECKS[@]}"
  else
    title "Worktree doctor"
    for check in "${DOCTOR_CHECKS[@]}"; do
      IFS='|' read -r id status msg <<<"$check"
      case "$status" in
        pass) printf '  %s✓%s %-22s %s\n' "$GREEN" "$RESET" "$id" "$msg" ;;
        warn) printf '  %s!%s %-22s %s\n' "$YELLOW" "$RESET" "$id" "$msg" ;;
        *) printf '  %s✗%s %-22s %s\n' "$RED" "$RESET" "$id" "$msg" ;;
      esac
    done
  fi
  return "$failed"
}

cmd_env() {
  generate_env
  ok "Generated .env for worktree ${WORKTREE_ID}"
  info "DATABASE_URL  localhost:${PG_PORT}"
  info "app           $(app_url)"
}

cmd_ports() {
  title "Ports"
  printf '  %-16s %s\n' "Compose project" "$COMPOSE_PROJECT" "Port offset" "$OFFSET" \
    "App" "localhost:${APP_PORT}" "Postgres" "localhost:${PG_PORT}" "URL" "$(app_url)"
}

cmd_status() {
  require_docker
  title "Containers"
  run_compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
  local running
  if running="$(host_dev_server_pid "$WT_DEV_SERVER_PID")"; then
    info "host next dev running (pid ${running})"
  fi
  info "app: $(app_url)"
}

# Deterministic coverage for the probe and the dev-server check, driven by a
# stubbed docker on PATH: the race the probe retries needs a container caught
# mid-restart, which cannot be reproduced on demand.
cmd_self_test() {
  local failures=0 tmp
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064 # expand tmp now, not when the trap fires
  trap "rm -rf '$tmp'" EXIT
  mkdir -p "$tmp/bin"

  # Fails until the call count passes STUB_FAIL_UNTIL, then answers STUB_ANSWER.
  cat >"$tmp/bin/docker" <<'STUB'
#!/bin/sh
n=$(( $(cat "$STUB_COUNT_FILE" 2>/dev/null || echo 0) + 1 ))
printf '%s' "$n" > "$STUB_COUNT_FILE"
[ "$n" -le "${STUB_FAIL_UNTIL:-0}" ] && exit 1
printf '%s' "${STUB_ANSWER:-t}"
STUB
  chmod +x "$tmp/bin/docker"

  # Called directly, never in a pipe: a subshell would count failures in a copy.
  assert() {
    if [[ "$2" == "$3" ]]; then
      printf '  ok   %s\n' "$1"
    else
      printf '  FAIL %s (expected %s, got %s)\n' "$1" "$3" "$2"
      failures=$((failures + 1))
    fi
  }

  # Sources the file it was invoked as, so a broken copy cannot test a good one.
  run_probe() {
    : >"$tmp/count"
    PATH="$tmp/bin:$PATH" STUB_COUNT_FILE="$tmp/count" STUB_FAIL_UNTIL="$1" STUB_ANSWER="$2" \
      WT_PROBE_MAX_ATTEMPTS="${3:-5}" WT_PROBE_SLEEP_SECONDS=0 \
      bash -c "source '${BASH_SOURCE[0]}' --source-only; probe_migration_state; printf '%s %s' \"\$PROBE_MIGRATION_STATE\" \"\$PROBE_ATTEMPTS_USED\""
  }

  printf 'worktree.sh self-test\n'
  assert "a healthy database answers on the first call" "$(run_probe 0 t)" "t 0"
  assert "a database answering f is fresh, not an error" "$(run_probe 0 f)" "f 0"
  assert "transient failures are retried and the real answer wins" "$(run_probe 2 f)" "f 2"
  assert "a persistent failure stops at the limit and reports error" "$(run_probe 99 t 4)" "error 4"
  assert "the probe writes nothing to stdout" \
    "$(PATH="$tmp/bin:$PATH" STUB_COUNT_FILE="$tmp/count" bash -c "source '${BASH_SOURCE[0]}' --source-only; probe_migration_state")" ""

  # dev, pause and `ensure --app` trust this answer: a wrong "alive" leaves no
  # app, a wrong "dead" starts a second server.
  dev_server_state() {
    bash -c "source '${BASH_SOURCE[0]}' --source-only; host_dev_server_pid '$tmp/dev.pid' >/dev/null && echo alive || echo dead"
  }
  (exec -a "node next dev --port 1" sleep 30) &
  local dev_pid=$!
  sleep 30 &
  local other_pid=$!
  printf '%s' "$dev_pid" >"$tmp/dev.pid"
  assert "a live next dev named by the PID file counts as running" "$(dev_server_state)" "alive"
  printf '%s' "$other_pid" >"$tmp/dev.pid"
  assert "a PID file naming another live process does not" "$(dev_server_state)" "dead"
  printf 'garbage' >"$tmp/dev.pid"
  assert "an unreadable PID does not" "$(dev_server_state)" "dead"
  rm -f "$tmp/dev.pid"
  assert "no PID file does not" "$(dev_server_state)" "dead"
  kill "$dev_pid" "$other_pid" 2>/dev/null || true
  wait "$dev_pid" "$other_pid" 2>/dev/null || true

  if ((failures)); then
    printf '%s self-test assertion(s) failed\n' "$failures" >&2
    exit 1
  fi
  printf 'worktree self-test: all assertions passed\n'
}

show_help() {
  cat <<EOF
Usage: bash scripts/worktree.sh <command> [options]   (pnpm wt <command>, or pnpm wt:<command>)

Lifecycle (containers start on demand):
  provision          tier 0: .env + host node_modules, no containers
  ensure [--app] [--no-seed] [--json] [--quiet]
                     tier 1: Postgres up, migrated, seeded once; --app adds tier 2
  app                tier 2: the app container, waits for HTTP
  dev                tier 1 + host \`next dev\` on this worktree's port (pnpm dev)
  pause [--app]      stop containers, keep volumes; --app stops only the app
  down [--volumes]   remove containers; --volumes also deletes the database
  gc [--yes]         list (or with --yes delete) stacks of deleted worktrees
  doctor [--json]    diagnose this worktree's environment

Other:
  env                regenerate .env      logs [service]   follow logs (default app)
  ports              print ports and URL  status           show containers
  self-test          check the probe logic against a stubbed docker

Worktree ${WORKTREE_ID}: app localhost:${APP_PORT}, Postgres localhost:${PG_PORT}
EOF
}

main() {
  local action="${1:-}"
  [[ $# -eq 0 ]] || shift
  case "$action" in
    provision) cmd_provision ;;
    ensure) cmd_ensure "$@" ;;
    app) cmd_app ;;
    dev) cmd_dev ;;
    pause) cmd_pause "$@" ;;
    down) cmd_down "$@" ;;
    gc) cmd_gc "$@" ;;
    doctor) cmd_doctor "$@" ;;
    env) cmd_env ;;
    logs) require_docker && run_compose logs -f "${1:-app}" ;;
    ports) cmd_ports ;;
    status) cmd_status ;;
    self-test | --self-test) cmd_self_test ;;
    help | -h | --help) show_help ;;
    "")
      show_help
      exit 1
      ;;
    *) die "unknown command: $action (bash scripts/worktree.sh help)" ;;
  esac
}

if [[ "${1:-}" == "--source-only" ]]; then
  return 0 2>/dev/null || exit 0
fi

main "$@"
