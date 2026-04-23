#!/usr/bin/env bash

set -euo pipefail

PLUGIN_DIR="./packages/kirie/native/ios/Kirie"
BUILD_DIR="${PLUGIN_DIR}/.build"
GENERATED_DIR="${PLUGIN_DIR}/.generated"
PROJECT_PATH="${GENERATED_DIR}/Kirie.xcodeproj"
OUTPUT_DIR="./examples/basic-ipc/ios/plugins/kirie"
OUTPUT_XCFRAMEWORK="${OUTPUT_DIR}/Kirie.xcframework"
DERIVED_DATA_PATH="${BUILD_DIR}/DerivedData"
GODOT_SOURCE_ROOT="${GODOT_SOURCE_ROOT:-/Users/lemonneko/Projects/godot-swiftgodotkit}"

if [ ! -f "${GODOT_SOURCE_ROOT}/core/config/engine.h" ]; then
    echo "GODOT_SOURCE_ROOT must point to a Godot source checkout with core/config/engine.h" >&2
    exit 1
fi

mkdir -p "${BUILD_DIR}" "${GENERATED_DIR}" "${OUTPUT_DIR}"

xcodegen generate \
    --spec "${PLUGIN_DIR}/project.yml" \
    --project-root "${PLUGIN_DIR}" \
    --project "${GENERATED_DIR}"

DEVICE_ARCHIVE_PATH="${BUILD_DIR}/Kirie-iOS.xcarchive"
SIMULATOR_ARCHIVE_PATH="${BUILD_DIR}/Kirie-Simulator.xcarchive"

rm -rf \
    "${DEVICE_ARCHIVE_PATH}" \
    "${SIMULATOR_ARCHIVE_PATH}" \
    "${OUTPUT_XCFRAMEWORK}" \
    "${OUTPUT_DIR}/Kirie.debug.xcframework" \
    "${OUTPUT_DIR}/Kirie.release.xcframework"

COMMON_ARCHIVE_ARGS=(
    -project "${PROJECT_PATH}"
    -scheme Kirie
    -configuration Release
    -derivedDataPath "${DERIVED_DATA_PATH}"
    GODOT_SOURCE_ROOT="${GODOT_SOURCE_ROOT}"
    SKIP_INSTALL=NO
    BUILD_LIBRARY_FOR_DISTRIBUTION=YES
    CODE_SIGNING_ALLOWED=NO
)

xcodebuild archive \
    "${COMMON_ARCHIVE_ARGS[@]}" \
    -destination "generic/platform=iOS" \
    -archivePath "${DEVICE_ARCHIVE_PATH}"

xcodebuild archive \
    "${COMMON_ARCHIVE_ARGS[@]}" \
    -destination "generic/platform=iOS Simulator" \
    -archivePath "${SIMULATOR_ARCHIVE_PATH}"

xcodebuild -create-xcframework \
    -framework "${DEVICE_ARCHIVE_PATH}/Products/Library/Frameworks/Kirie.framework" \
    -framework "${SIMULATOR_ARCHIVE_PATH}/Products/Library/Frameworks/Kirie.framework" \
    -output "${OUTPUT_XCFRAMEWORK}"

echo "Wrote ${OUTPUT_XCFRAMEWORK}"
