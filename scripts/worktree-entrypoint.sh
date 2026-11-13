#!/bin/sh
# Entrypoint of the worktree app container (docker-compose.worktree.yaml).
set -eu

# Trust the host's TLS-intercepting proxy (docker-compose.proxy-ca.yaml),
# rebuilt from the pristine bundle so a restart does not append it twice.
if [ -n "${WT_PROXY_CA_FILE:-}" ] && [ -r "$WT_PROXY_CA_FILE" ]; then
  bundle=/etc/ssl/certs/ca-certificates.crt
  [ -f "$bundle.orig" ] || cp "$bundle" "$bundle.orig"
  cat "$bundle.orig" "$WT_PROXY_CA_FILE" >"$bundle"
fi

apk add --no-cache libc6-compat git bash
corepack enable
# Installs the pnpm pinned in package.json#packageManager, so the version
# lives in one place.
corepack install
# Frozen only: a fallback plain install would rewrite pnpm-lock.yaml on the
# host through the bind mount.
pnpm install --frozen-lockfile
# `exec node …/next` rather than `exec pnpm dev`: pnpm would stay resident as a
# supervisor (~100 MB per stack), and `pnpm dev` is the host dev server.
exec node node_modules/next/dist/bin/next dev --hostname 0.0.0.0
