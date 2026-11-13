#!/usr/bin/env bash
# The one entry point for turbo's cached `build` task.
#
#   bash scripts/turbo-build.sh [turbo flags]
#
# `.next/standalone` traces the producing machine's native sharp binary
# (`@img/sharp-<os>-<arch>`), and turbo hashes no platform of its own, so one
# tree would share one cache entry across an arm64 laptop and an x64 runner.
# BUILD_TARGET_ARCH, declared in the task's `env` in turbo.json, partitions
# the entries. It comes from `uname`, not RUNNER_ARCH, so the partition also
# holds off CI. Calling `turbo run build` directly hashes it as unset.
set -euo pipefail

BUILD_TARGET_ARCH="$(uname -s)-$(uname -m)"
export BUILD_TARGET_ARCH

exec pnpm turbo run build "$@"
