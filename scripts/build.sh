#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
BUILD_DIR="$PROJECT_DIR/build"
DIST_DIR="$PROJECT_DIR/dist"
APP_NAME="Codex换肤启动器"
ARCH="$(uname -m)"
APP_DIR="$DIST_DIR/$APP_NAME.app"
ZIP_PATH="$DIST_DIR/CodexSkinLauncher-macos-$ARCH.zip"

rm -rf "$BUILD_DIR" "$DIST_DIR"
mkdir -p "$BUILD_DIR" "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

xcrun clang \
  -fobjc-arc \
  -fmodules \
  -O2 \
  -mmacosx-version-min=13.0 \
  -framework Cocoa \
  -framework UniformTypeIdentifiers \
  "$PROJECT_DIR/Sources/CodexSkinLauncher.m" \
  -o "$APP_DIR/Contents/MacOS/CodexSkinLauncher"

cp "$PROJECT_DIR/Resources/Info.plist" "$APP_DIR/Contents/Info.plist"
cp "$PROJECT_DIR/Resources/skin-injector.js" "$APP_DIR/Contents/Resources/skin-injector.js"
cp "$PROJECT_DIR/Resources/package.json" "$APP_DIR/Contents/Resources/package.json"
cp "$PROJECT_DIR/README.md" "$DIST_DIR/使用说明.md"

chmod 755 "$APP_DIR/Contents/MacOS/CodexSkinLauncher"
chmod 644 "$APP_DIR/Contents/Resources/skin-injector.js" "$APP_DIR/Contents/Resources/package.json" "$APP_DIR/Contents/Info.plist"

plutil -lint "$APP_DIR/Contents/Info.plist"
codesign --force --deep --sign - "$APP_DIR"
codesign --verify --deep --strict "$APP_DIR"
ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$ZIP_PATH"

echo "$APP_DIR"
echo "$ZIP_PATH"
