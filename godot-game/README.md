# Horde Highway — Godot 4

Lane-runner zombie shooter for Godot 4.7 with animated CC0 Kenney models
(see `CREDITS.md`) and Godot physics; no art from the reference game.

Features: shootable gates (bad gates shrink and flip to +), traps, five enemy
types (normal, fast, tank, gold, ranged), tumbling physics corpses and crate
debris, combat particles, damage numbers, camera shake on crate explosions.

## Open / run

1. Install Godot 4.7 (standard build, not .NET).
2. Import this folder (`project.godot`) in the Project Manager and press Play.

Renderer: **Compatibility** (OpenGL), chosen for the widest Android support.
Switch to Mobile in Project Settings → Rendering → Renderer if you prefer.

## Controls

- Drag (touch/mouse), A/D or arrow keys: steer
- 1 / 2 / 3 or the round buttons: Frost / Shock / Inferno

## Files

- `scenes/main.tscn` — root node only
- `scripts/main.gd` — game logic and UI (rules in `../zombie-survival-design.md`)
- `scripts/models.gd` — model loading/animation; `scripts/physics_fx.gd` — corpses/debris; `scripts/fx.gd` — particles, damage numbers, shake
- `assets/models/` — CC0 Kenney GLB models; `assets/licenses/` — their licences
- `tests/smoke_test.gd` — headless test: level 1 with a gate-picking autopilot
  (win, gate value change, physics bodies, coins → upgrade → save), then level 5
  (all five enemy types spawn, a trap is hit)

```bash
godot --headless --path . --import
godot --headless --path . --fixed-fps 60 -s res://tests/smoke_test.gd
# prints "SMOKE TEST PASSED", exit code 0
```

Progress is saved to `user://save.cfg`.

## Android export

`export_presets.cfg` has an "Android" preset (arm64-v8a + armeabi-v7a, no Gradle).
Needs Godot 4.7.2 export templates, JDK 17 and the Android SDK set in
Editor Settings → Export → Android. The keystore is passed by environment
variables so no password is stored in the project:

```bash
GODOT_ANDROID_KEYSTORE_RELEASE_PATH=/path/to/your.keystore \
GODOT_ANDROID_KEYSTORE_RELEASE_USER=your-alias \
GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD=your-password \
godot --headless --export-release "Android" ../apk/HordeHighway-Godot.apk
```
