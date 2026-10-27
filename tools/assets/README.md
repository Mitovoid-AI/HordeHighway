# Asset tools (work in progress — see ../../plan.md)

Scripts used to build the Downtown city model and to check/test the HTML5 game.
They were written in a scratch folder; paths are passed as arguments, so they run from anywhere.

## Setup

```bash
cd tools/assets
npm install            # glTF-Transform 4.2.1 + meshoptimizer 0.22.0
pip install pillow     # for resize_tex.py / atlas.py
npm install -g playwright@1 && npx playwright install chromium   # for harness + smoke/perf tests
```

## Building `html5-game/assets/models/downtown/city.glb`

Source: Downtown City MegaKit (Standard, CC0) — https://quaternius.itch.io/downtown-city-megakit
(224 MB zip, not stored here: over GitHub's 100 MB file limit). Extract `Exports/glTF (Godot)/*` into one folder `X`.

```bash
python3 resize_tex.py X TEX512                       # textures -> 512 px JPEG (decals 1024 PNG)
ERR=0.01 LOCK=0 node build_city.mjs X TEX512 city_v2.glb 0.25 \
  Street_4Lane Building_Small_1:s Building_Medium_2_001:s Building_Large_2:s \
  Prop_Bollard Sidewalk_Planter Prop_Planter_Single Prop_ManholeCover
# impostors: bake views with harness/bake.html (see below) -> IMP/*.png + meta.json, then
python3 atlas.py IMP                                  # packs front/left/right into *_atlas.png
node add_impostors.mjs city_v2.glb IMP city.glb       # adds "<Building>_Imp" 3-quad nodes
```

`impostors/` holds the atlases + `meta.json` that are inside the current `city.glb`, so
`add_impostors.mjs city_v2.glb impostors city.glb` reproduces it without re-baking.

What `build_city.mjs` does: merges the models into one GLB, renames each root node to its file name,
strips vertex colours (the kit's wear masks tint everything red in standard renderers) and unused UV sets,
swaps in the small textures, dedups, welds, and simplifies the buildings (`:s`) with meshoptimizer.

## Harness (`harness/`)

Static pages + Playwright drivers used for previews, impostor baking and triangle/draw-call measurement.
Serve a folder that contains these files plus these links:
`vendor -> html5-game/vendor`, `game -> html5-game`, `assets -> html5-game/assets`,
`dt -> <extracted glTF folder>`, `dtw -> <folder with the GLB>`; then e.g.
`python3 -m http.server 8731` and `node bake.js city_v2.glb Building_Small_1,Building_Medium_2_001,Building_Large_2 IMP`.

## Tests

- `smoke.js <url> <outPrefix> [seconds]` — opens the HTML5 game, presses PLAY, autopilots toward the better gate,
  saves screenshots, prints stats JSON (state, kills, draw calls, triangles, console errors).
  `SKILLS=1` also fires Inferno and Shock and screenshots them.
- `perf.js <url>` — frame intervals + draw calls/triangles on the menu screen.
- Note: without a GPU (software rendering) the game runs < 1 fps; only draw calls/triangles are meaningful there.

## Other

- `gltf_info.py file.gltf …` — triangles, size, joints (hand bones), animation names.
- `drive_tree.py` / `drive_dl.py` — list/download a public Google Drive folder (hit "Quota exceeded" on Quaternius's Drive).
- `source/` — glTF-only copies of the Toon Shooter Game Kit and Zombie Apocalypse Kit (CC0), needed for plan Phase 2+.
- `screenshots/` — before / work-in-progress images for reference.
