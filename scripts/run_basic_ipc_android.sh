#!/usr/bin/env bash

set -euo pipefail

if [ ! -f "examples/basic-ipc/project.godot" ]; then
    echo "This script must be run from the repository root." >&2
    exit 1
fi

APK_PATH="dist/basic-ipc/android_debug.apk"

mkdir -p "$(dirname "${APK_PATH}")"

pnpm --filter @kirie/basic-ipc-web run build

packages/kirie/native/android/gradlew \
    --project-dir packages/kirie/native/android \
    :plugin:assembleDebug

mise x -- godot \
    --headless \
    --path examples/basic-ipc \
    --export-debug "Android" \
    "../../${APK_PATH}"

adb install -r "${APK_PATH}"
adb shell monkey -p "com.example.kiriebasicipc" -c android.intent.category.LAUNCHER 1
