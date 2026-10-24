# Horde Highway — design spec

Original game inspired by the *genre and loop* of "Last Survival: Zombie Battle"
(ABI GAME, `com.lastwar.survival.zombie.battle`, v1.40). No code, art, audio,
names or logos from that game are used. All visuals are generated from
primitive shapes in code.

## 1. Findings ledger (study of the reference app)

| # | Finding | Type | Source |
|---|---|---|---|
| F1 | Package `com.lastwar.survival.zombie.battle`, v1.40, XAPK 189.87 MB, Android 7.1+, 23 permissions | Observed | Uptodown listing |
| F2 | Store text describes base building, heroes, troops, alliances, PvP, boss raids | Observed (marketing text) | Uptodown + Google Play description |
| F3 | All 7 store screenshots show a hyper-casual lane runner: squad runs up a road, picks math gates (`+2`, `+7`, `-150`, `÷25`), shoots zombie hordes, fights a giant boss | Observed | Store screenshots |
| F4 | Numbered barrels on the road are shot down to unlock weapons ("Upgrade your weapon") | Observed (screens 2, 3) | Store screenshots |
| F5 | Area skills: ice, energy burst, fire ("Unleash your skills") | Observed | Store screenshot 6 |
| F6 | Squad count shrinks on contact with zombies; game over when squad is gone | Inferred | Genre convention + screen 7 ("Can you escape?") |
| F7 | Engine: Unity 6000.3.9f1, IL2CPP (metadata v39), URP, Unity DOTS/Entities + Burst; Spine, Cinemachine, DOTween, I2 Localization | Observed | APK v1.41 (third-party mod build, SHA-256 `456f7fb9…`): `data.unity3d` header, `ScriptingAssemblies.json`, `global-metadata.dat` |
| F8 | No alliance / PvP / guild / building / troop / multiplayer types in game code — store text's base-building claims have no matching code | Observed (type-name search, bounded) | 977 types in `Assembly-CSharp.dll` |
| F9 | Gates: types `ADD / MINUS / MULTI / DIVI`; gates **move toward the squad**; shooting a gate raises its value (`hitsToIncrease`, `bulletHitCounter`, `IncreaseMultiple`); `TwoGateOneCap` paired variant | Observed (names) | `Gate`, `GateType`, `MotherGateType`, `SubGateData` |
| F10 | Levels are **timelines**, not fixed roads: `LevelData` holds timed lists of waves, gates, items, mercenaries (`spawnTime`); road is an endless scrolling treadmill (`RoadManager`) | Observed (names) | `LevelData`, `LevelManager`, `GateSpawn`, `WaveBotSpawn`, `RoadManager` |
| F11 | Crates (`ItemBox`) have HP; types `AddPlayer` / `Upgrade` (damage + fire-rate increase); `ItemTrap` damages the squad | Observed (names) | `ItemBox`, `BoxType`, `ItemTrap` |
| F12 | Squad: weapon types Pistol → Rifle → Gatling; clones laid out on a **hex grid**; drag to steer; max squad size | Observed (names) | `PlayerType`, `PlayerManager.GenerateHexGridPositions`, `HandleDragInput` |
| F13 | Heroes with rarity Normal / Rare / Legend, stats damage, fire rate, team size, charge-time skill | Observed (names) | `HeroData`, `HeroRarity`, `Hero` |
| F14 | Mercenaries: temporary Gatling allies dropped mid-level via a "hire" button, with lifetime | Observed (names); ad-gated hire is **inferred** | `ItemMercenary`, `MercenaryData`, `MercenaryTye` |
| F15 | Enemies: Normal, Fast, Tank, Gold (bonus), ranged shooters, mini-bosses, ~15 themed bosses with multi-wave attack patterns, warning intro, invulnerable phases | Observed (names) | `EnemyType`, `Enemy`, `Boss` |
| F16 | Difficulty tiers Easy / Hard / SuperHard; chapters ("mini-maps") with N levels each, milestone rewards, unlock flow; optional "gold bonus phase" with a gold boss | Observed (names) | `LevelType`, `LevelManager`, `MiniMap*` |
| F17 | Map variants Normal and **DoubleSide** (two lanes) | Observed (names) | `MapType`, `MapHeadquarter` |
| F18 | Meta upgrades exactly three: start units, damage, fire rate; big-number currency formatting | Observed | `DataPlayer` fields, literals `upgrade_start_unit` / `upgrade_damage` / `upgrade_firerate`, `BigNumber` |
| F19 | Monetisation: interstitial capping, rewarded ads (win/lose bonus multipliers), remove-ads bundle, starter pack, free daily gold, lose-streak tracking | Observed (names/literals) | `DataPlayer`, string literals |
| F20 | Exact balance numbers (HP, spawn times, gate values, costs) | **Unknown** | Stored in type-tree-stripped binary assets; not recovered |
| F21 | Mod build contains extra `libBedo.so`: ARM64 inline-hook + memory-patching code (`A64_HOOK`, `/proc/self/maps`, `mprotect`) — consistent with a cheat injector. Signed with the public AOSP test key, not the developer's cert | Observed strings; purpose **inferred** | REA/Hopper evidence `ev_12b56948…`, `ev_c1153ec6…`; APK signature |

## 2. Core loop (both builds)

1. Level starts: squad of `start_squad` soldiers auto-runs up a straight road.
2. Player steers left/right (drag, mouse, A/D or arrow keys).
3. Road contains, in order: gate pairs, numbered barrels, zombie groups; boss at the end.
4. Squad fires continuously forward. Clear the boss → level won, coins awarded.
5. Squad reaches 0 → level lost (coins earned so far are kept).
6. Between levels: upgrade screen, spend coins.

## 3. Rules

| Element | Rule |
|---|---|
| Squad | Integer `count`. Up to 30 soldiers drawn in a sunflower cluster; label shows the exact number. |
| Gates | Pairs spanning the road; each side shows `+n`, `-n`, `×n` or `÷n`. Passing applies the op once (floor, min 0). One side is usually better. **P1:** gates stop bullets; every 3 hits a `+` gate gains 1 and a `−` gate loses 1; every 15 hits `×` gains 1 (max ×5) and `÷` loses 1; `−0` / `÷1` flip to `+1`. |
| Traps (P2) | Barricade 3 m wide placed 15 m before 35 % of zombie groups. Running into it costs `3 + L` soldiers once. Can't be shot. |
| Barrels | Show HP. Bullets reduce HP. Destroyed → reward (weapon tier +1, or `+n` soldiers). Touching the squad → squad loses `5` and the barrel breaks with no reward. |
| Zombies | Walk toward the squad. HP scales with level. On contact: zombie dies, squad loses `bite`. Bullet hits knock back 0.12 m (not tanks). |
| Enemy types (P3) | normal (hp ×1, speed ×1, bite 1, 1 coin); fast L2+ (×0.6 hp, ×2 speed); tank L4+, first of each group (×5 hp, ×0.6 speed, bite 3, 3 coins); ranged L3+, second of each group (×1.5 hp, holds 20 m ahead, throws an orb every 2.5 s that kills 1 if it hits — dodge by steering); gold, one per level (×3 hp, walks away, 15 coins). |
| Boss | Spawns at road end; squad stops running. Large HP; on contact kills 1 soldier per 0.25 s. |
| Weapons | Tiers: Pistol, SMG, Rifle, Gatling. Each tier raises damage and fire rate; the soldiers' gun model changes. Tier resets each level (run-based power-up). |
| Physics | Reactions only (core movement is deterministic): killed enemies become rigid bodies flung away and tumbling for 2.2 s (max 30); broken crates burst into ≤10 cubes for 1.6 s (max 48). HTML5: cannon-es; Godot: built-in physics. |
| FX | Muzzle flashes, hit sparks, gate-hit flashes, coin bursts, floating damage numbers; camera shake on crate explosions. |
| Shooting | Every `fire_interval` the squad fires `min(count, 10)` bullets straight ahead. |
| Skills | **Frost**: freeze all enemies 3 s (cooldown 15 s). **Shock**: 60 damage × level to every enemy within 30 m (cooldown 12 s). **Inferno**: fire zone ahead, 40 dps for 4 s (cooldown 20 s). |
| Coins | +1 per zombie, +5 per barrel, +50 × level for the boss. |

## 4. Meta progression (saved locally)

| Upgrade | Effect per level | Cost |
|---|---|---|
| Firepower | +15 % bullet damage | `20 × 1.5^lvl` |
| Fire rate | −6 % fire interval (min 40 %) | `20 × 1.5^lvl` |
| Recruits | +1 starting soldier | `30 × 1.6^lvl` |

Saved: current level, coins, three upgrade levels.
HTML5 → `localStorage`; Godot → `user://save.cfg`.

## 5. Difficulty per level `L`

- Road length: `260 + 20·L` m.
- Zombie HP: `20 + 6·L`; group size: `6 + 2·L`.
- Boss HP: `1500 · 1.35^(L−1)`.
- Barrel HP: `60 + 25·L`.

## 6. Out of scope (not built, needs your approval)

Base building, hero collection, troops, alliances, PvP, online play, ads,
in-app purchases, sound. From the REA proposals: P4 boss attack patterns,
P5 mercenaries, P6 heroes, P7 chapters/tiers, P8 two-lane map, P9 timelines.

## 7. Deliverables

- `/home/user/html5-game/` — three.js + cannon-es (vendored, MIT), CC0 Kenney models, opens in a browser.
- `/home/user/godot-game/` — Godot 4.7 project, CC0 Kenney models.
- `/home/user/apk/` — signed APKs for both, the sideload keystore, install guide.
