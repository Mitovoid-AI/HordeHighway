#!/usr/bin/env bash
# Bundles src/ + vendor/ into dist/game.js (single file, Chrome 70+ / Android WebView 70+,
# no import maps). Run after editing anything in src/. Needs Node.js (fetches esbuild via npx).
set -euo pipefail
cd "$(dirname "$0")"
npx --yes esbuild@0.25.0 src/main.js --bundle --format=esm --target=chrome70 \
  --alias:three=./vendor/three.module.js --alias:three/addons=./vendor/addons --alias:cannon-es=./vendor/cannon-es.js \
  --minify --legal-comments=eof --outfile=dist/game.js
