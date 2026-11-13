#!/usr/bin/env bash
# Run several commands at the same time; fail if any of them fails.
#
#   bash scripts/run-parallel.sh <command>...   each argument is one `bash -c` command
#   bash scripts/run-parallel.sh --self-test
#
# Every command runs to the end even after another one has failed, so a single
# run reports every failure rather than the first. Each command's output is
# buffered and printed as one block, in argument order, once that command and
# every command before it have finished: put the slowest command last and the
# others print as soon as they are done.
#
# Not `pnpm run "/<regex>/"`: measured on pnpm 10.9, it stops every other
# script at the first failure, and its `--no-bail` exits 0 when a script FAILS.
#
# Written for macOS's bash 3.2 as well: no `wait -n`, no associative arrays,
# and no expansion of a possibly-empty array without a `+` guard under `set -u`.

set -uo pipefail

RUN_DIR=""
PIDS=()

cleanup() {
	[[ -n $RUN_DIR ]] && rm -rf "$RUN_DIR"
}

# Stop every command, then die of the same signal. Each command is its own
# process group (see `set -m` below), so signalling the group reaches everything
# the command started, not just its outer shell. Dying of the signal, rather
# than exiting 130, is what stops the caller: a calling bash that receives the
# same SIGINT keeps running if its child merely exited, and a `cmd && next`
# chain would then go on to `next` after the interrupt.
interrupted() { # $1 = signal name
	local groups pid
	trap - INT TERM
	# The job table, not PIDS: a signal handled between a fork and its
	# `PIDS[i]=$!` would otherwise leave that command running.
	groups="$(jobs -p)"
	# Out of the job table first, so bash does not print a "Terminated" line,
	# with the command's source, for every command it is about to stop.
	disown -a
	for pid in $groups; do
		kill -TERM -- "-$pid" 2> /dev/null
	done
	cleanup
	kill -s "$1" $$
}

run() {
	local started=$SECONDS i=0 cmd status seconds failed=0 failed_list=""

	RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/run-parallel.XXXXXX")" || return 2
	trap cleanup EXIT
	trap 'interrupted INT' INT
	trap 'interrupted TERM' TERM

	# Without job control, the background commands of a non-interactive shell
	# ignore SIGINT and share this shell's process group, so an interrupted run
	# would leave them running with nothing to stop them.
	set -m

	for cmd in "$@"; do
		(
			begun=$SECONDS
			bash -c "$cmd" < /dev/null
			code=$?
			echo "$((SECONDS - begun))" > "$RUN_DIR/$i.seconds"
			exit "$code"
		) > "$RUN_DIR/$i.out" 2>&1 &
		PIDS[i]=$!
		i=$((i + 1))
	done

	i=0
	for cmd in "$@"; do
		wait "${PIDS[i]}"
		status=$?
		seconds="$(cat "$RUN_DIR/$i.seconds" 2> /dev/null || echo '?')"
		if ((status == 0)); then
			echo "── ${cmd} · ok · ${seconds}s"
		else
			echo "── ${cmd} · FAILED (exit ${status}) · ${seconds}s"
			failed=$((failed + 1))
			failed_list="${failed_list}  ${cmd}"$'\n'
		fi
		cat "$RUN_DIR/$i.out"
		# A block that does not end in a newline would swallow the next header.
		[[ -s "$RUN_DIR/$i.out" && -n "$(tail -c 1 "$RUN_DIR/$i.out")" ]] && echo
		i=$((i + 1))
	done

	if ((failed)); then
		printf 'run-parallel: %d of %d commands FAILED:\n%s' "$failed" "$#" "$failed_list"
		return 1
	fi
	echo "run-parallel: all $# commands passed in $((SECONDS - started))s"
}

self_test() {
	local failures=0 out status started caller sleeper tmp tries signal piece expected
	fail() {
		echo "FAIL: $1" >&2
		failures=$((failures + 1))
	}
	# `kill -0` alone answers yes for a zombie, a process that has exited and
	# only awaits reaping. An orphan's reaper is PID 1, and a container whose
	# PID 1 never reaps (the devcontainer runs `sleep infinity`) keeps it a
	# zombie forever. Without `ps`, `kill -0` is all there is to go on.
	running() { # $1 = pid
		kill -0 "$1" 2> /dev/null || return 1
		[[ "$(ps -o stat= -p "$1" 2> /dev/null)" != Z* ]]
	}

	# No commands is a usage error, never a pass: a caller whose list came out
	# empty would otherwise report success for having checked nothing.
	bash "$0" > /dev/null 2>&1
	status=$?
	((status == 2)) || fail "no commands must exit 2, got ${status}"

	out="$(bash "$0" 'echo first-ok' 'echo second-ok' 2>&1)"
	status=$?
	((status == 0)) || fail "two passing commands must exit 0, got ${status}"
	[[ $out == *first-ok*second-ok* ]] || fail "both blocks must print in argument order, got: ${out}"

	# The failure sits between two passing commands: the run must still fail,
	# and the command after it must still have run to completion.
	out="$(bash "$0" 'echo before-ok' 'echo broken-output; exit 3' 'echo after-ok' 2>&1)"
	status=$?
	((status == 1)) || fail "one failing command must fail the run with 1, got ${status}"
	[[ $out == *broken-output* && $out == *"FAILED (exit 3)"* ]] ||
		fail "the failing command's output and exit code must be printed, got: ${out}"
	[[ $out == *after-ok* ]] || fail "a command after a failure must still run, got: ${out}"

	# Run one after another these take 4s or more.
	started=$SECONDS
	bash "$0" 'sleep 1' 'sleep 1' 'sleep 1' 'sleep 1' > /dev/null 2>&1
	((SECONDS - started < 4)) ||
		fail "four 1s commands took $((SECONDS - started))s, so they are not running concurrently"

	# A terminal or turbo signals the whole foreground process group, so the
	# caller gets the signal as well. The run must stop its commands, including
	# the processes those started, and die of the signal: a caller that sees it
	# merely exit keeps going, which is how an interrupt during `--self-test`
	# went on to start the real run anyway.
	tmp="$(mktemp -d "${TMPDIR:-/tmp}/run-parallel-self-test.XXXXXX")" || return 1
	for signal in INT TERM; do
		rm -f "${tmp}/pid" "${tmp}/caller-continued"
		piece="sleep 5 & echo \$! > '${tmp}/pid'; wait"
		# Its own process group, so one signal reaches caller and run together,
		# and SIGINT is not ignored the way it is for a plain background job.
		# The same isolation means an interrupt aimed at this self-test misses
		# it; `sleep 5` is what bounds that leftover.
		set -m
		# shellcheck disable=SC2016 # expanded by the inner bash, not here
		bash -c 'bash "$1" "$2"; touch "$3"' _ "$0" "$piece" "${tmp}/caller-continued" > /dev/null 2>&1 &
		caller=$!
		set +m
		for ((tries = 0; tries < 100; tries++)); do
			[[ -s "${tmp}/pid" ]] && break
			sleep 0.1
		done
		sleeper="$(cat "${tmp}/pid" 2> /dev/null)"
		kill -s "$signal" -- "-$caller"
		wait "$caller" 2> /dev/null
		status=$?
		expected=$((128 + $(kill -l "$signal")))
		((status == expected)) || fail "SIG${signal} must end the caller with ${expected}, got ${status}"
		[[ -e "${tmp}/caller-continued" ]] &&
			fail "the caller kept going after SIG${signal}: the run exited instead of dying of the signal"
		if [[ -z $sleeper ]]; then
			fail "the command meant to receive SIG${signal} never started"
			continue
		fi
		for ((tries = 0; tries < 20; tries++)); do
			running "$sleeper" || break
			sleep 0.1
		done
		if running "$sleeper"; then
			fail "a process started by a command survived SIG${signal}"
			kill "$sleeper" 2> /dev/null
		fi
	done
	rm -rf "$tmp"

	if ((failures)); then
		echo "run-parallel self-test: ${failures} failure(s)" >&2
		return 1
	fi
	echo "run-parallel self-test: all assertions passed"
}

main() {
	if [[ ${1:-} == --self-test ]]; then
		self_test
		return $?
	fi
	if (($# == 0)); then
		echo "usage: run-parallel.sh <command>... | --self-test" >&2
		return 2
	fi
	run "$@"
}

main "$@"
