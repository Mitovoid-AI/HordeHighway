# Horde Highway — Android APKs

| File | Engine | Size | Package |
|---|---|---|---|
| `HordeHighway-Godot.apk` | Godot 4.7 (native, OpenGL ES 3) | ~53 MB | `com.hordehighway.godot` |
| `HordeHighway-HTML5.apk` | three.js in a WebView | ~0.8 MB | `com.hordehighway.web` |

Both: Android 7.0+ (API 24), portrait, no permissions, no ads, no network use.

**Download** (open these links on your phone):
[HordeHighway-Godot.apk](https://github.com/Mitovoid-AI/HordeHighway/raw/main/apk/HordeHighway-Godot.apk) ·
[HordeHighway-HTML5.apk](https://github.com/Mitovoid-AI/HordeHighway/raw/main/apk/HordeHighway-HTML5.apk)

## Install on your phone

1. Copy the `.apk` to the phone (USB, cloud drive, or email).
2. Open it from the Files app. Android asks to allow installs from that app — allow it once.
3. Tap **Install**. Play Protect may warn "unknown developer" — that is because
   it is self-signed; choose **Install anyway**.

Or with a cable: `adb install HordeHighway-Godot.apk`.

## Signing key

Both APKs are signed with a sideload key that is **not in this repository**
(`*.keystore` is git-ignored). Future updates must be signed with the same key,
or Android refuses to install them over the old version. To build your own,
create a keystore with `keytool -genkeypair` and pass it to the build commands in
`html5-game/README.md` and `godot-game/README.md`.

**Before publishing to Google Play**, use a private key with a strong password
and never commit it.

## What was tested, and how

Tested on an **Android 11 emulator** (software-only, no GPU, no KVM — very slow),
not on a physical phone.

- **HTML5 APK** (this exact file): installed, launched, menu shown, PLAY tapped,
  run played with shooting/coins, swipe steering worked. Emulator WebView was v83.
  Two bugs found there were fixed before this build (blank screen from import maps,
  hidden menu from CSS `inset`) — so it now also runs on older WebViews (70+).
- **Godot APK**: the delivered ARM build installs and the engine starts, but the
  emulator's ARM→x86 translator crashes on Godot's ARM code (SIGILL inside
  `libndk_translation`, an emulator limitation). The same project exported for
  x86_64 was run instead: menu, PLAY, combat, trap, crate and the DEFEATED/RETRY
  screen all worked. The arm64/armv7 build you install was **not** run on ARM hardware.
- The emulator's SwiftShader GPU mode can't link Godot 4.7's shaders
  (uniform limit 261); with the host (Mesa) GPU mode it renders correctly. Real phone
  GPUs normally have higher limits, but very old/low-end GPUs are a risk.

**Frame rate on real phones is unknown.** In desktop Chromium the HTML5 game's own
JavaScript takes ~7–9 ms per frame; the rest depends on the phone's GPU.
