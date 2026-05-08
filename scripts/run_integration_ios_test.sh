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
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-75}"
LOG_STREAM_SETTLE_SECONDS="${LOG_STREAM_SETTLE_SECONDS:-1}"
LOG_FILE="${LOG_FILE:-${TMPDIR:-/tmp}/kirie-integration-${TEST_NAME}.log}"
LOG_PREDICATE="${LOG_PREDICATE:-process == \"integration\" OR eventMessage CONTAINS \"KIRIE_TEST_\" OR eventMessage CONTAINS \"[Kirie]\" OR eventMessage CONTAINS \"Godot\"}"

cleanup() {
    if [ -n "${LOG_PID:-}" ]; then
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
    > "${LOG_FILE}" 2>&1 &
LOG_PID="$!"
sleep "${LOG_STREAM_SETTLE_SECONDS}"

xcrun simctl launch \
    "${SIMULATOR_ID}" \
    "${BUNDLE_ID}" \
    -- "--kirie-test=${TEST_NAME}" \
    >/dev/null

deadline=$((SECONDS + TIMEOUT_SECONDS))
while [ "${SECONDS}" -lt "${deadline}" ]; do
    if fail_line="$(grep -m 1 -E "KIRIE_TEST_FAIL (${TEST_NAME}|unknown)( |$)" "${LOG_FILE}" 2>/dev/null)"; then
        echo "${fail_line}" >&2
        exit 1
    fi

    if pass_line="$(grep -m 1 -E "KIRIE_TEST_PASS ${TEST_NAME}( |$)" "${LOG_FILE}" 2>/dev/null)"; then
        echo "${pass_line}"
        exit 0
    fi

    sleep 0.5
done

echo "Timed out waiting for KIRIE_TEST_PASS or KIRIE_TEST_FAIL for ${TEST_NAME}" >&2
echo "=== Last 120 Kirie/Godot/test lines ===" >&2
grep -E "KIRIE_TEST_|\\[Kirie\\]|Godot" "${LOG_FILE}" | tail -n 120 >&2 || true
exit 1
