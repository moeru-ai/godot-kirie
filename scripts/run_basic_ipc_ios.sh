#!/usr/bin/env bash

set -euo pipefail

if [ ! -f "packages/kirie/native/ios/Kirie/project.yml" ]; then
    echo "This script must be run from the repository root." >&2
    exit 1
fi

PROJECT_ROOT="packages/kirie/native/ios/Kirie"
GENERATED_DIR="${PROJECT_ROOT}/.generated"
PROJECT_PATH="${GENERATED_DIR}/Kirie.xcodeproj"
SCHEME="KirieIpcSerializationTests"
DESTINATION="${IOS_TEST_DESTINATION:-platform=iOS Simulator,name=iPhone 16}"

if ! command -v xcodegen >/dev/null 2>&1; then
    echo "xcodegen is required. Install it with: brew install xcodegen" >&2
    exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
    echo "xcodebuild is required. Install Xcode and select it with xcode-select." >&2
    exit 1
fi

xcodegen generate \
    --spec "${PROJECT_ROOT}/project.yml" \
    --project-root "${PROJECT_ROOT}" \
    --project "${GENERATED_DIR}"

xcodebuild test \
    -project "${PROJECT_PATH}" \
    -scheme "${SCHEME}" \
    -destination "${DESTINATION}" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO
