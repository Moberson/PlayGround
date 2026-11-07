#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "$0")" && pwd)}"
cd "$PROJECT_DIR"
PORT="${PORT:-3000}"
BUILD_DIR="$PROJECT_DIR/dist"

run_timed() {
  /usr/bin/time -p "$@"
}

run_timed mkdir -p "$BUILD_DIR"
if [[ -f package.json ]]; then
  if [[ -f package-lock.json ]]; then
    run_timed npm ci --no-audit --no-fund
  else
    run_timed npm install --no-audit --no-fund
  fi
  if run_timed node -e "process.exit(require('./package.json').scripts?.build ? 0 : 1)"; then
    run_timed npm run build
  else
    run_timed cp -a index.html "$BUILD_DIR/index.html"
    if [[ -d assets ]]; then run_timed cp -a assets "$BUILD_DIR/"; fi
  fi
else
  run_timed cp -a index.html "$BUILD_DIR/index.html"
  if [[ -d assets ]]; then run_timed cp -a assets "$BUILD_DIR/"; fi
fi

if [[ ! -f "$BUILD_DIR/index.html" ]]; then
  echo "Build output is missing $BUILD_DIR/index.html" >&2
  exit 1
fi
if [[ -n "${OPENCODE_WEB_DIR:-}" ]]; then
  run_timed mkdir -p "$OPENCODE_WEB_DIR"
  run_timed env PROJECT_DIR="$PROJECT_DIR" BUILD_DIR="$BUILD_DIR" node -e 'const fs=require("node:fs"); fs.writeFileSync(`${process.env.OPENCODE_WEB_DIR}/deployment-output.json`, JSON.stringify({project:process.env.PROJECT_DIR,directory:process.env.BUILD_DIR}));'
fi
run_timed python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$BUILD_DIR"
