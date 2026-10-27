# Horde Highway — Visual Upgrade Plan

Goal: make both games (HTML5 and Godot 4) look much better using **only CC0 assets**,
without changing the gameplay rules. Then rebuild both Android APKs and push to GitHub.

Status legend: ✅ done · 🟡 in progress · ⬜ not started · ❓ needs your decision

---

## 0. Resume here (handoff)

**Where:** branch `wip/visual-upgrade` of https://github.com/Mitovoid-AI/HordeHighway
(`main` is untouched — it still holds the released game, website and APKs).

```bash
git clone https://github.com/Mitovoid-AI/HordeHighway.git
cd HordeHighway && git checkout wip/visual-upgrade
```

**State when paused (2026-10-27):**
- Phase 0 done. Phase 1 in progress: HTML5 city + lighting + shadows are built and tested (0 errors).
  The new particle effects (`html5-game/src/fx.js`, Inferno flames, Shock bolts, barrel explosion) are
  **written and bundled into `dist/game.js` but NOT yet tested** — first thing to do is run the skills test (Phase 1, step 1).
- Phases 2–7 not started. **Decisions D1–D6 (section 2) are still open.**
- Godot project unchanged.

**What is where:**
| Path | What |
|---|---|
| `html5-game/src/city.js` | new: Downtown street/buildings, BatchedMesh per material, impostor LOD |
| `html5-game/src/main.js`, `fx.js`, `assets.js` | edited: lighting/sky/shadows, city hook, textured particles |
| `html5-game/assets/models/downtown/city.glb` | built Downtown model (5.4 MB) |
| `html5-game/assets/fx/*.png` | Kenney particle textures (128 px) |
| `html5-game/vendor/addons/environments/RoomEnvironment.js` | from three.js r186 (MIT) |
| `tools/assets/` | asset build scripts, test scripts, harness, impostor atlases, screenshots — see its README |
| `tools/assets/source/` | glTF-only Toon Shooter + Zombie Apocalypse kits (needed for Phase 2) |

**NOT in the repo (on purpose):**
- **Signing keystore** (`horde-highway-sideload.keystore`, alias `hordehighway`). The repo is public, so it must never be committed.
  Without this exact file, new APKs cannot install as updates over the current ones — keep a private copy.
- Downtown City MegaKit zip (224 MB, over GitHub's file limit) — re-download from https://quaternius.itch.io/downtown-city-megakit if `city.glb` must be rebuilt.
- Kenney Particle Pack zip — https://kenney.nl/assets/particle-pack (the used textures are already in the repo).

**Tools needed on a new machine:** Node 22, Python 3 + Pillow, Playwright + Chromium,
Godot 4.7.2 + export templates, Android SDK (build-tools 35.0.0, platform 35), JDK 17.

**Key commands:**
```bash
cd html5-game && ./bundle.sh                              # build dist/game.js
python3 -m http.server 8732                               # serve html5-game/
SKILLS=1 node ../tools/assets/smoke.js http://127.0.0.1:8732/index.html out/fx 120   # Phase 1 test
KEYSTORE=... KS_PASS=... KS_ALIAS=hordehighway android/build.sh                    # Lite APK
cd ../godot-game && godot --headless --fixed-fps 60 -s res://tests/smoke_test.gd   # Godot test
```

**If you resume with Claude Code:** ask it to read `plan.md` first, answer D1–D6, then continue from Phase 1.

---

## 1. Assets we have (all CC0 — free for commercial use, no credit required)

| Pack | Source | What we use it for | Status |
|---|---|---|---|
| Downtown City MegaKit (Quaternius) | itch.io | Street, sidewalks, 3 buildings, bollards, planters, manholes | ✅ downloaded, in HTML5 |
| Kenney Particle Pack | kenney.nl | Muzzle flash, sparks, smoke, fire, lightning, rings | ✅ downloaded, in HTML5 |
| Toon Shooter Game Kit (Quaternius) | your upload (21.7 MB) | Soldiers, guns, trees, barrels, crates, barriers, street light | ✅ downloaded, not used yet |
| Zombie Apocalypse Kit (Quaternius) | your Drive link (40.9 MB) | 4 zombies, survivors, cars, street props, weapons | ✅ downloaded, not used yet |

Facts read from the files (they drive the plan):

- **Toon soldier**: 20,725 triangles, **18 separate meshes**, 11 flat-colour materials. Animations:
  `Run_Gun, Run_Shoot, Idle_Shoot, Death, HitReact, Walk_Shoot, …` (17).
  → Too heavy for 30 soldiers on a phone as-is (30 × 18 = 540 draw calls, 620k triangles). Must be merged + simplified.
- **Survivors (Lis / Matt / Sam / Shaun, `_SingleWeapon`)**: ~9.4k triangles, 1 material + 1 texture,
  animations `Run_Gun, Idle_Gun, Walk_Gun, Death, …` (20).
- **Zombies**: Basic 7.8k tris, Chubby 6.2k, Arm 5.7k, Ribcage 4.8k (a crawling torso). 1 material each.
  Animations: `Walk, Run, Run_Arms, Run_Attack, Punch, Crawl, Death, HitReact, Idle, …`.
- All characters share the same skeleton names. Guns attach to bone **`LowerArm.R`** (there is no hand bone).

---

## 2. Decisions I need from you ❓

I will not pick these myself. My recommendation is first in each list.

**D1 — Squad soldier model**
- **A (recommended): Toon Shooter `Character_Soldier`**, merged into 1 mesh and simplified to ~6k triangles. Classic army look; it matches the Toon guns.
- B: Zombie-kit survivors (Lis, Matt, Sam, Shaun mixed). Already light (9.4k triangles, 1 material). Civilian look; it matches the zombies' art style exactly.
- C: Mix — Toon soldier + Hazmat suit variants for variety.

**D2 — Which zombie is which enemy type** (gameplay stays the same, only the model changes)

| Enemy type (rule P3) | Recommended model | Alternative |
|---|---|---|
| normal | Zombie_Basic (`Walk`) | — |
| fast | Zombie_Arm (`Run_Arms`) | Zombie_Basic tinted, `Run` |
| tank | Zombie_Chubby, scaled ×1.6 (`Walk`) | — |
| ranged (throws dodgeable orbs) | Zombie_Basic, purple tint (`Punch` = throw) | Zombie_Arm |
| gold (worth 15 coins) | Zombie_Ribcage, gold tint (`Crawl`) | Zombie_Basic gold |
| boss | Zombie_Chubby scaled ×4, dark-red tint | Zombie_Basic ×4 |

**D3 — Gun per weapon tier** (names in the game stay: Pistol → SMG → Rifle → Gatling)
- A (recommended): Toon `Pistol` → Toon `SMG` → Toon `AK` → Toon `ShortCannon` (heavy look for "Gatling").
- B: the same, but the 4th tier uses `RocketLauncher` and its name changes to "Launcher" (a text change — needs your OK).

**D4 — Road**
- A (recommended): keep the Downtown street (already done, clean, with sidewalks) and add Zombie-kit cracks/blood decals on top.
- B: replace it with Zombie-kit `Street_Straight` / `Street_Straight_Crack1/2` (more ruined, no sidewalks).

**D5 — Extra scenery (new design elements — each needs a yes)**
- Wrecked/abandoned cars parked along the curb (Zombie-kit `Vehicle_*`, decoration only — no collision, no gameplay change).
- Blood decals on the road (`Blood_1/2/3`). Note: this affects age rating on stores.
- Fire hydrants, traffic lights, trash bags, containers on the sidewalks.
- Trees (Toon `Tree_1..4`) in the sidewalk planters.

**D6 — Keep the asset build scripts in the repo?**
- A (recommended): yes, in `tools/assets/`, so anyone can rebuild `city.glb` and the character files.
- B: no, keep the repo smaller.

---

## 3. Work plan (frozen once you approve)

Each step has a check that proves it is done. "Works" is never the check.

### Phase 0 — Safety ✅ (done 2026-10-27)
1. Push the current uncommitted work to a branch `wip/visual-upgrade` (NOT `main`, so your Vercel site does not change).
   - Check: `git ls-remote origin wip/visual-upgrade` shows the commit.

### Phase 1 — HTML5: finish what is already built 🟡 (30 min)
Already done ✅: Downtown street + buildings (one BatchedMesh per material, ~37 draw calls),
far buildings drawn as baked "impostors" (3 textured quads) to keep triangles down,
sky gradient + haze, ACES tone mapping, sun shadows that follow the squad,
new particle code (smoke, fire, lightning, explosions, textured shock ring).

1. Run the browser test with the skills triggered (Inferno, Shock) and barrels broken.
   - Check: 0 console errors; screenshots show flames in the Inferno zone, lightning on zombies, smoke on barrel break.
2. Fix anything broken in step 1.

### Phase 2 — HTML5: characters, guns, props ⬜ (1.5 h)
1. Asset build (script, in scratchpad or `tools/assets/` per D6):
   - Soldier (D1): merge 18 meshes → 1 skinned mesh, flat colours baked into a small palette texture,
     simplify to ~6k triangles, keep only the animations we use (`Run_Gun`, `Run_Shoot`, `Idle_Shoot`, `Death`).
     - Check: output GLB has 1 mesh primitive, ≤ 7k triangles, 4 animations; renders correctly in a preview screenshot.
   - Zombies (D2): convert to GLB, keep only used animations (`Walk`, `Run`/`Run_Arms`, `Punch`, `Crawl`, `Death`, `HitReact`).
     - Check: each GLB loads in three.js and plays each kept animation (preview screenshot).
   - Guns (D3), barrel, crate/chest, barriers, cones, trees, street lights → GLBs.
2. Code changes (`src/assets.js`, `src/main.js`):
   - Replace the Kenney model keys with the new ones; map animation names
     (`sprint`→`Run_Gun`, `holding-right-shoot`→`Idle_Shoot`, `walk`→`Walk`, `die`→`Death`,
     `attack-melee-right`→`Punch`).
   - Attach guns to `LowerArm.R` with a tuned offset.
   - Re-tune scales so soldiers ≈ 1.5 m, zombies ≈ 1.7 m, tank/boss per D2.
   - Barrels → Toon `ExplodingBarrel`; gun-upgrade crate → Zombie-kit `Chest_Special`;
     traps → Toon `Barrier_Large` / Zombie-kit `TrafficBarrier_*` + cones.
   - Street lights → Zombie-kit `StreetLights` (replaces Kenney lamp).
   - Approved D5 items only.
   - Check: browser test reaches the boss and wins/loses with 0 errors; `stats().enemyTypes` lists all 5 types at level 5;
     gate / trap / crate / barrel rules behave exactly as before (same test assertions as the old build).
3. Delete the Kenney model files no longer used (`graveyard`, `mini`, `blaster`, `survival`, `roads` folders — only those not referenced).
   - Check: `grep` finds no reference to deleted paths; game still loads.

### Phase 3 — HTML5: menus & HUD redesign ⬜ (45 min)
Same information and buttons as today — only the look changes.
1. Bundle a free game font (SIL OFL, e.g. "Lilita One") locally so it works offline in the APK.
2. Main menu: big title with outline, the 3D city visible behind, upgrade cards with icons, big PLAY button.
3. In-run HUD: level pill, progress bar with a boss marker at the end, coin counter with icon, weapon badge with gun icon.
4. Skill buttons: icons + a circular cooldown sweep (instead of only a number).
5. Result screen: VICTORY / DEFEATED restyled with the same stats.
6. Icons: drawn as inline SVG by me (no new asset pack needed).
   - Check: screenshots of menu, run, boss, result at 360×800 and 432×768; no text overflow; buttons ≥ 48 px tall.

### Phase 4 — Godot: port everything ⬜ (2.5–3 h)
1. Copy the same GLBs/textures into `godot-game/assets/`.
2. City: build street + buildings with `MultiMeshInstance3D` in chunks;
   near chunks use full models, far chunks use the impostors (Godot `visibility_range`).
   - Check: headless test prints triangle/draw-call counts within the budgets in section 4.
3. Lighting: `WorldEnvironment` (sky, fog, ACES), `DirectionalLight3D` with shadows following the squad.
   - Risk: Godot's Compatibility renderer (needed for older phones) has weaker shadow support — if shadows fail there,
     I fall back to blob shadows under characters and tell you.
4. Characters/guns/props: same models, `BoneAttachment3D` on `LowerArm.R`, same animation mapping.
5. Particles: textured quads/`CPUParticles3D` with the same Kenney textures.
6. HUD/menus: same design as HTML5 using a Godot `Theme` + the same font.
7. Update `tests/smoke_test.gd` for new node/animation names.
   - Check: `godot --headless -s res://tests/smoke_test.gd` passes both phases (level 1 win, level 5 all enemy types + trap hit);
     screenshots match the HTML5 look.

### Phase 5 — Build APKs ⬜ (30–60 min)
1. HTML5 APK: `html5-game/android/build.sh` (same keystore, kept outside the repo).
2. Godot APK: export arm64-v8a + armeabi-v7a with the same keystore.
   - Check: `apksigner verify --print-certs` passes for both and the certificate digest is the **same as the current APKs**
     (so they install as updates over the old ones).
3. Emulator test (slow, software rendering): install both, open menu, tap PLAY, play ~20 s.
   - Godot: test with an x86_64 build (the ARM build can't run on this emulator — same limitation as before).
   - Check: screenshots from the emulator of menu + gameplay for both.

### Phase 6 — Publish ⬜ (15 min) — only after you say "push"
1. Copy the web build to `docs/play/`; refresh `docs/img/*.jpg` screenshots; update credits on the landing page.
2. Update `README.md`, both `CREDITS.md` files, `apk/README.md` (sizes, test notes).
3. Commit + push to `main`.
   - Check: raw APK download links return files whose SHA-256 matches the local builds; `docs/play` loads.

### Phase 7 — Clean up ⬜ (5 min)
1. Delete scratchpad downloads (zips, extracted packs, previews, test screenshots, the `wip/visual-upgrade` branch if you want).
   - Check: `git status` clean; scratchpad empty.

---

## 4. Performance budgets (phone safety)

| Measure | Budget | Today (HTML5, city only) |
|---|---|---|
| Triangles per frame (incl. shadows) | ≤ 300k | ~200k city + characters (to be measured) |
| Draw calls per frame | ≤ 200 | ~40 city + characters |
| Web download | ≤ 15 MB | ~10 MB now |
| Lite APK | ≤ 15 MB | 0.8 MB → will grow |
| Godot APK | ≤ 70 MB | 53 MB |

---

## 5. Honest risks

- **Real phone frame rate is unknown.** This machine has no GPU; the browser renders in software at < 1 fps,
  so I can only measure triangles and draw calls, not FPS. You must test the APKs on your phone; if it is slow,
  one more tuning round is needed (fewer drawn soldiers, shorter view distance, or no shadows on low-end phones).
- **Godot port is the least predictable part** (different batching/LOD system; shadows in Compatibility mode).
- **Art-style mix**: Downtown buildings are semi-realistic PBR; Toon/Zombie characters are cartoon low-poly.
  It looked fine in tests, but you may not like the mix — screenshots will show it before anything is pushed.
- **Download size grows** (models + textures). Lite APK will go from 0.8 MB to roughly 10–15 MB.
- **License note**: the Zombie kit's `License.txt` header names a different Quaternius pack (a template typo),
  but both the file text and quaternius.com say CC0.

## 6. Not doing (unless you ask)

- No gameplay/rule changes (speeds, damage, gates, levels, upgrades stay identical).
- No new game features (no new enemy behaviours, no dogs, no vehicles you can drive, no new modes).
- No original-game assets, no Sketchfab models.

## 7. Time estimate

About **5–7 hours** of my working time after your decisions (Phase 1–7). Biggest unknowns: Godot port and test speed.
Order: Phase 0 → 1 → 2 → 3 → 4 → 5 → (you review screenshots) → 6 → 7.
