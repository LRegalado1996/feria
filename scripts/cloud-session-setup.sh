#!/usr/bin/env bash
# Setup script for a Claude Code cloud environment (claude.ai/code → environment
# → Setup script; docs/agents/cloud-sessions.md). Runs as root on Ubuntu BEFORE
# Claude Code launches. Anthropic then snapshots the disk and reuses it, so
# what this installs (Node, images, browsers) is there for every later session.
#
# Two hard constraints:
#   - it must exit 0 or the session fails to start: no `set -e`, every step is
#     guarded, and the script always ends on `exit 0`;
#   - it must finish in about 5 minutes or the snapshot is not cached:
#     independent steps run in parallel.
#
# It runs from /home/user, the parent of the checkout, so it locates the repo
# from its own path. Running containers do not survive the snapshot; the
# SessionStart hook (scripts/cloud-session-start.sh) provisions the checkout.
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_DIR
# Both paths are read back by cloud-session-start.sh; keep them in sync.
readonly NODE_PREFIX="/opt/node"
readonly PLAYWRIGHT_BROWSERS_DIR="/opt/ms-playwright"
# agent-browser is a global CLI, not a dependency, so nothing else pins it.
readonly AGENT_BROWSER_VERSION="0.29.1"

log() { printf '[cloud-setup] %s\n' "$1"; }
warn() { printf '[cloud-setup] WARN: %s\n' "$1" >&2; }

# The VM ships an older Node; the repo's .nvmrc wins. nodejs.org is on the
# default allowlist.
install_node() {
  local version arch tarball
  version="$(tr -d '[:space:]v' <"$REPO_DIR/.nvmrc")"
  if [[ "$("$NODE_PREFIX/bin/node" --version 2>/dev/null)" == "v$version" ]]; then
    log "node v$version already installed"
  else
    case "$(uname -m)" in
      x86_64) arch="x64" ;;
      aarch64 | arm64) arch="arm64" ;;
      *)
        warn "unsupported architecture $(uname -m): keeping the preinstalled Node"
        return 1
        ;;
    esac
    tarball="node-v${version}-linux-${arch}.tar.xz"
    log "installing node v$version ($arch)"
    curl -fsSL --retry 3 -o "/tmp/$tarball" "https://nodejs.org/dist/v${version}/${tarball}" || {
      warn "could not download node v$version: the preinstalled Node stays on PATH"
      return 1
    }
    rm -rf "$NODE_PREFIX" && mkdir -p "$NODE_PREFIX"
    tar -xJf "/tmp/$tarball" -C "$NODE_PREFIX" --strip-components=1 || {
      warn "could not unpack node v$version"
      return 1
    }
    rm -f "/tmp/$tarball"
  fi

  # /usr/local/bin covers the non-login shell the Bash tool runs.
  local binary
  for binary in node corepack; do ln -sf "$NODE_PREFIX/bin/$binary" "/usr/local/bin/$binary"; done
  # pnpm comes from package.json#packageManager through corepack, fetched now
  # so it lands in the snapshot instead of behind a download prompt later.
  "$NODE_PREFIX/bin/corepack" enable --install-directory /usr/local/bin pnpm >/dev/null 2>&1 ||
    warn "corepack enable failed: the preinstalled pnpm will be used"
  (cd "$REPO_DIR" && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 "$NODE_PREFIX/bin/corepack" install >/dev/null 2>&1) ||
    warn "corepack could not prefetch pnpm: sessions will download it"
  log "node $("$NODE_PREFIX/bin/node" --version) ready"
}

# Playwright's Chromium with its system libraries (wt:provision runs without
# root, so it cannot install those), agent-browser on the same Chromium, and
# the shell linter. The Playwright hosts must be allowed (docs/agents/cloud-sessions.md).
install_browser_tooling() {
  local version
  version="$(node -p "require('$REPO_DIR/package.json').devDependencies['@playwright/test']" 2>/dev/null)"
  if [[ -n "$version" ]]; then
    log "installing Playwright $version chromium with system deps"
    (cd /tmp && PLAYWRIGHT_BROWSERS_PATH="$PLAYWRIGHT_BROWSERS_DIR" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
      pnpm dlx "playwright@$version" install --with-deps chromium) >/dev/null 2>&1 ||
      warn "playwright install failed: are cdn.playwright.dev and playwright.download.prss.microsoft.com allowed?"
  else
    warn "could not read the @playwright/test pin: skipping the browser install"
  fi

  # pnpm, not npm (banned here). Its global bin dir is linked onto PATH.
  export PNPM_HOME=/opt/pnpm-global
  mkdir -p "$PNPM_HOME"
  if (cd /tmp && PATH="$PNPM_HOME:$PATH" COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    pnpm add --global "agent-browser@$AGENT_BROWSER_VERSION") >/dev/null 2>&1; then
    ln -sf "$PNPM_HOME/agent-browser" /usr/local/bin/agent-browser
  else
    warn "agent-browser install failed"
  fi

  # After Playwright's apt run, never beside it: both want the apt lock.
  { apt-get update -qq && apt-get install -y -qq shellcheck; } >/dev/null 2>&1 || warn "shellcheck install failed"
  log "browser tooling ready"
}

# .husky/pre-commit runs gitleaks, so without it no commit succeeds. GitHub
# release assets answer 403 through the session proxy, so it is built from the
# Go module proxy at the version CI pins.
install_gitleaks() {
  local version
  version="$(sed -n 's/^ *GITLEAKS_VERSION: *//p' "$REPO_DIR/.github/workflows/ci.yml" | head -n 1)"
  if [[ -z "$version" ]] || ! command -v go >/dev/null 2>&1; then
    warn "gitleaks not installed (no go toolchain or no pin in ci.yml): commits will fail the pre-commit hook"
    return 1
  fi
  log "building gitleaks v$version"
  GOBIN=/usr/local/bin go install "github.com/zricethezav/gitleaks/v8@v$version" >/dev/null 2>&1 || {
    warn "gitleaks build failed: commits will fail the pre-commit hook"
    return 1
  }
  log "gitleaks ready"
}

start_docker() {
  docker info >/dev/null 2>&1 && return 0
  command -v dockerd >/dev/null 2>&1 || {
    warn "dockerd is not installed in this image"
    return 1
  }
  log "starting dockerd"
  dockerd >/var/log/dockerd-setup.log 2>&1 &
  local waited=0
  until docker info >/dev/null 2>&1; do
    waited=$((waited + 1))
    ((waited < 150)) || {
      warn "dockerd did not come up (see /var/log/dockerd-setup.log)"
      return 1
    }
    sleep 0.2
  done
}

# Docker Hub rate-limits anonymous pulls per IP, and the VM's egress IP is
# shared. ECR Public mirrors the official images; a fallback pull is retagged
# under the Docker Hub name compose asks for.
pull_image() {
  local image="$1" mirror
  docker pull --quiet "$image" >/dev/null 2>&1 && return 0
  [[ "$image" != */* ]] || return 1
  mirror="public.ecr.aws/docker/library/$image"
  docker pull --quiet "$mirror" >/dev/null 2>&1 && docker tag "$mirror" "$image" && log "pulled $image from $mirror"
}

# The images the compose files pin, so `wt ensure` is fast in every session.
pull_images() {
  local image pids=() pid
  for image in $(awk '$1 == "image:" { print $2 }' "$REPO_DIR"/docker-compose.*.yaml | sort -u); do
    log "pulling $image"
    pull_image "$image" &
    pids+=("$!")
  done
  for pid in ${pids[@]+"${pids[@]}"}; do
    wait "$pid" || warn "an image pull failed: wt ensure retries it per session"
  done
}

main() {
  log "start ($(uname -s)/$(uname -m))"
  # Three independent chains, because the ~5 minute cache budget binds.
  {
    install_node
    PATH="$NODE_PREFIX/bin:$PATH" install_browser_tooling
  } &
  local node_pid=$!
  install_gitleaks &
  local gitleaks_pid=$!
  if start_docker; then pull_images; fi
  wait "$node_pid" 2>/dev/null || true
  wait "$gitleaks_pid" 2>/dev/null || true
  log "done in ${SECONDS}s (the environment is cached only under ~300s)"
  exit 0
}

main "$@"
