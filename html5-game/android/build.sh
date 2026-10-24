#!/usr/bin/env bash
# Builds the HTML5 game into a signed Android APK (WebView wrapper, no Gradle).
# Needs: JDK 17, Android SDK (build-tools 35.0.0, platforms;android-35).
# Usage: KEYSTORE=... KS_PASS=... KS_ALIAS=... ./build.sh [output.apk]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
GAME="$(dirname "$HERE")"
SDK="${ANDROID_HOME:-/opt/android-sdk}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-35/android.jar"
OUT="${1:-$GAME/../apk/HordeHighway-HTML5.apk}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/assets/www/vendor" "$WORK/gen" "$WORK/classes" "$WORK/dex"
"$GAME/bundle.sh"
# Game files only (bundled JS, no sources) go into assets/www.
cp -r "$GAME/index.html" "$GAME/style.css" "$GAME/dist" "$GAME/assets" "$GAME/CREDITS.md" "$WORK/assets/www/"
cp "$GAME"/vendor/LICENSE-*.txt "$WORK/assets/www/vendor/"

"$BT/aapt2" compile --dir "$HERE/res" -o "$WORK/res.zip"
"$BT/aapt2" link -o "$WORK/unsigned.apk" -I "$JAR" --manifest "$HERE/AndroidManifest.xml" \
  -A "$WORK/assets" --java "$WORK/gen" "$WORK/res.zip"
javac --release 8 -classpath "$JAR" -d "$WORK/classes" \
  "$HERE/src/com/hordehighway/web/MainActivity.java" "$WORK/gen/com/hordehighway/web/R.java" 2>&1 | grep -v -E 'JAVA_TOOL|warning: \[options\]|^1 warning' || true
"$BT/d8" --lib "$JAR" --min-api 24 --output "$WORK/dex" $(find "$WORK/classes" -name '*.class')
(cd "$WORK/dex" && zip -q -j "$WORK/unsigned.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$WORK/unsigned.apk" "$WORK/aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias "$KS_ALIAS" --out "$OUT" "$WORK/aligned.apk"
rm -f "$OUT.idsig"
echo "Built $OUT"
