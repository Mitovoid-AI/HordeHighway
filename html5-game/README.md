# Horde Highway — HTML5

Lane-runner zombie shooter built with three.js + cannon-es physics.
Animated CC0 Kenney models (see `CREDITS.md`); no art from the reference game.

Features: shootable gates (bad gates shrink and flip to +), traps, five enemy
types (normal, fast, tank, gold, ranged), tumbling physics corpses and crate
debris, combat particles, damage numbers, camera shake on crate explosions.

## Run

ES modules don't load from `file://`, so serve the folder:

```bash
cd html5-game
python3 -m http.server 8000
# open http://localhost:8000
```

## Controls

- Drag (touch/mouse), A/D or arrow keys: steer
- 1 / 2 / 3 or the round buttons: Frost / Shock / Inferno

## Files

- `index.html`, `style.css` — page and UI overlays (CSS avoids `inset`/flex `gap` for WebView < 87)
- `dist/game.js` — what the page loads: `src/` + `vendor/` bundled for Chrome/WebView 70+ (no import maps). **Run `./bundle.sh` after editing `src/`.**
- `src/main.js` — game logic (rules in `../zombie-survival-design.md`)
- `src/assets.js` — model loading, cloning, animation; `src/physics.js` — cannon-es corpses/debris; `src/fx.js` — particles, damage numbers, shake
- `assets/models/` — CC0 Kenney GLB models; `assets/licenses/` — their licences
- `vendor/` — three.js r186 + GLTFLoader/SkeletonUtils, cannon-es 0.20.0 (MIT)
- `android/` — WebView wrapper and `build.sh` that packages this folder into an APK

## Android APK

```bash
KEYSTORE=/path/to/your.keystore KS_PASS=your-password KS_ALIAS=your-alias ./android/build.sh
```

Needs JDK 17 and the Android SDK (build-tools 35.0.0, platforms;android-35).

Progress is saved in `localStorage` (`horde-highway-save-v1`).
`window.__hh.stats()` exposes read-only stats used by automated smoke tests.
