#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
node --check "$PROJECT_DIR/Resources/layout-themes.js"
node --check "$PROJECT_DIR/Resources/skin-injector.js"
node "$PROJECT_DIR/scripts/test-layout-themes.mjs"
