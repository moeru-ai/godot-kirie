#!/usr/bin/env bash

set -euo pipefail

if [ ! -f "tests/integration/project.godot" ]; then
    echo "This script must be run from the repository root." >&2
    exit 1
fi

if [ "$#" -ne 1 ]; then
    echo "Usage: scripts/run_integration_ios_test.sh <test_name>" >&2
    exit 1
fi

TEST_NAME="$1"
BUNDLE_ID="${BUNDLE_ID:-ai.moeru.kirie.integrationtests}"
SIMULATOR_ID="${SIMULATOR_ID:-booted}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-120}"
LOG_STREAM_SETTLE_SECONDS="${LOG_STREAM_SETTLE_SECONDS:-1}"
LOG_FILE="${LOG_FILE:-${TMPDIR:-/tmp}/kirie-integration-${TEST_NAME}.log}"
LOG_PREDICATE="${LOG_PREDICATE:-eventMessage CONTAINS \"KIRIE_TEST_\" OR eventMessage CONTAINS \"[Kirie]\" OR eventMessage CONTAINS \"Godot\"}"
LOG_PID=""
CONSOLE_PID=""

cleanup() {
    if [ -n "${CONSOLE_PID}" ]; then
        kill "${CONSOLE_PID}" >/dev/null 2>&1 || true
        wait "${CONSOLE_PID}" >/dev/null 2>&1 || true
    fi
    if [ -n "${LOG_PID}" ]; then
        kill "${LOG_PID}" >/dev/null 2>&1 || true
        wait "${LOG_PID}" >/dev/null 2>&1 || true
    fi
    xcrun simctl terminate "${SIMULATOR_ID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

: > "${LOG_FILE}"
xcrun simctl terminate "${SIMULATOR_ID}" "${BUNDLE_ID}" >/dev/null 2>&1 || true

xcrun simctl spawn "${SIMULATOR_ID}" log stream \
    --level debug \
    --style compact \
    --predicate "${LOG_PREDICATE}" \
    >> "${LOG_FILE}" 2>&1 &
LOG_PID="$!"
sleep "${LOG_STREAM_SETTLE_SECONDS}"

xcrun simctl launch --console \
    "${SIMULATOR_ID}" \
    "${BUNDLE_ID}" \
    -- "--kirie-test=${TEST_NAME}" \
    >> "${LOG_FILE}" 2>&1 &
CONSOLE_PID="$!"

dump_log() {
    sleep 0.3
    echo "=== Full log: ${LOG_FILE} ===" >&2
    cat "${LOG_FILE}" >&2 || true
    echo "=== End of log ===" >&2
}

deadline=$((SECONDS + TIMEOUT_SECONDS))
while [ "${SECONDS}" -lt "${deadline}" ]; do
    if fail_line="$(grep -m 1 -E "KIRIE_TEST_FAIL (${TEST_NAME}|unknown)( |$)" "${LOG_FILE}" 2>/dev/null)"; then
        dump_log
        echo "${fail_line}" >&2
        exit 1
    fi

    if pass_line="$(grep -m 1 -E "KIRIE_TEST_PASS ${TEST_NAME}( |$)" "${LOG_FILE}" 2>/dev/null)"; then
        echo "${pass_line}"
        exit 0
    fi

    if ! kill -0 "${CONSOLE_PID}" 2>/dev/null; then
        echo "App process exited before KIRIE_TEST_PASS/FAIL for ${TEST_NAME}" >&2
        break
    fi

    sleep 0.5
done

echo "Timed out (or app exited early) waiting for KIRIE_TEST_PASS or KIRIE_TEST_FAIL for ${TEST_NAME}" >&2
dump_log
exit 1