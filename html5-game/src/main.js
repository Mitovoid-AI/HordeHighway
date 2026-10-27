// Horde Highway — HTML5 build (three.js + cannon-es). Models: CC0 Kenney and Quaternius packs (see ../CREDITS.md).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadAssets, cloneAnimated, cloneStatic, tint } from './assets.js';
import { buildCity, updateCityLod } from './city.js';
import { spawnCorpse, spawnDebris, stepPhysics, clearPhysics, physicsStats } from './physics.js';
import { initFx, fx, updateFx, shakeOffset, clearFx, FX_TEX } from './fx.js';

// ---------- Tunables (see zombie-survival-design.md) ----------
const ROAD_HALF = 5;
const RUN_SPEED = 9;
const STEER_SPEED = 9;
const BULLET_SPEED = 42;
const BULLET_LIFE = 1.15;
const MAX_BULLETS = 320;
const MAX_DRAWN_SOLDIERS = 30; // drawn cap for phone GPUs; squad.count is unaffected
const MAX_SQUAD = 999;
const ZOMBIE_SPEED = 2.6;
const ZOMBIE_WAKE_DIST = 70;
const BOSS_SPEED = 1.3;
const BOSS_RADIUS = 2.6;
const BOSS_STOP_DIST = 16;
const BARREL_RADIUS = 0.8;
const BARREL_HIT_COST = 5;
const CHAR_SCALE = 1.7;
const GATE_HITS_ADD = 3; // P1: hits per +1 / -1 step on + and - gates
const GATE_HITS_MUL = 15; // P1: hits per step on × and ÷ gates
const GATE_MUL_MAX = 5;
const TRAP_HALF_WIDTH = 1.5; // P2
const ORB_SPEED = 14; // P3 ranged enemy projectile

const WEAPONS = [
  { name: 'Pistol', dmg: 10, interval: 0.30, color: 0xfff27a, model: 'gunPistol' },
  { name: 'SMG', dmg: 9, interval: 0.16, color: 0x9ff7ff, model: 'gunSmg' },
  { name: 'Rifle', dmg: 20, interval: 0.20, color: 0xffb36b, model: 'gunRifle' },
  { name: 'Gatling', dmg: 34, interval: 0.18, color: 0xd38cff, model: 'gunGatling' },
];

// P3 enemy types: hp/speed are multipliers of the level's base zombie.
const ENEMIES = {
  normal: { model: 'zombie', scale: 1.8, hp: 1, speed: 1, bite: 1, coins: 1, anim: 'walk' },
  fast: { model: 'skeleton', scale: 1.7, hp: 0.6, speed: 2, bite: 1, coins: 1, anim: 'sprint' },
  tank: { model: 'keeper', scale: 2.8, hp: 5, speed: 0.6, bite: 3, coins: 3, anim: 'walk', radius: 0.8 },
  gold: { model: 'ghost', scale: 1.9, hp: 3, speed: -0.6, bite: 1, coins: 15, anim: 'idle', tint: 0xffd23f },
  ranged: { model: 'vampire', scale: 1.8, hp: 1.5, speed: 1, bite: 1, coins: 2, anim: 'walk', range: 20, fireEvery: 2.5 },
};

const SKILLS = {
  frost: { cooldown: 15 },
  shock: { cooldown: 12 },
  inferno: { cooldown: 20 },
};

const UPGRADES = [
  { id: 'firepower', label: 'Firepower', desc: '+15% bullet damage', base: 20, growth: 1.5 },
  { id: 'rate', label: 'Fire rate', desc: 'Shoot 6% faster', base: 20, growth: 1.5 },
  { id: 'recruits', label: 'Recruits', desc: '+1 starting soldier', base: 30, growth: 1.6 },
];

// ---------- Save data ----------
const SAVE_KEY = 'horde-highway-save-v1';
const DEFAULT_SAVE = { level: 1, coins: 0, firepower: 0, rate: 0, recruits: 0 };

function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object') return { ...DEFAULT_SAVE, ...s };
  } catch (e) { /* storage unavailable */ }
  return { ...DEFAULT_SAVE };
}

function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage unavailable */ }
}

const save = loadSave();

function upgradeCost(u) {
  return Math.round(u.base * Math.pow(u.growth, save[u.id]));
}

// ---------- Helpers ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function applyOp(count, gate) {
  switch (gate.op) {
    case '+': return count + gate.n;
    case '-': return count - gate.n;
    case '×': return count * gate.n;
    case '÷': return Math.floor(count / gate.n);
  }
  return count;
}

// ---------- Renderer / scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const HAZE = 0xb4c9dc;
const scene = new THREE.Scene();
scene.background = skyTexture();
scene.fog = new THREE.Fog(HAZE, 55, 150);
// Soft image-based light so the city's PBR materials (metal trim, glass) don't render black.
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 160); // fog is opaque past 150

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#4f8fd0');
  grad.addColorStop(0.55, '#9cc4e4');
  grad.addColorStop(1, '#b4c9dc');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

scene.add(new THREE.HemisphereLight(0xe8f1ff, 0x50483f, 1.3));
// High warm sun behind the camera, a little to the right: buildings shade the right sidewalk and lane edge,
// the road stays lit so the squad and horde shadows read. Follows the squad.
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 34, bottom: -34, near: 1, far: 120 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
const SUN_OFFSET = new THREE.Vector3(8, 40, 22);
scene.add(sun, sun.target);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 62 : 50;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Shared geometry & materials ----------
const GEO = {
  body: new THREE.CapsuleGeometry(0.26, 0.5, 4, 8),
  head: new THREE.SphereGeometry(0.24, 12, 8),
  arm: new THREE.BoxGeometry(0.14, 0.14, 0.55),
  bullet: new THREE.SphereGeometry(0.12, 6, 4),
  barrel: new THREE.CylinderGeometry(0.75, 0.75, 1.4, 16),
  gate: new THREE.BoxGeometry(4.8, 2.6, 0.2),
  post: new THREE.BoxGeometry(0.25, 3, 0.25),
  trunk: new THREE.CylinderGeometry(0.2, 0.25, 1.2, 6),
  crown: new THREE.ConeGeometry(1.3, 2.6, 7),
  stripe: new THREE.BoxGeometry(0.25, 0.02, 2.5),
  ring: new THREE.PlaneGeometry(2.2, 2.2), // textured ring (FX_TEX.ring)
  eye: new THREE.SphereGeometry(0.22, 8, 6),
};

const MAT = {
  soldier: new THREE.MeshLambertMaterial({ color: 0xd9a441 }),
  helmet: new THREE.MeshLambertMaterial({ color: 0x55703a }),
  zombie: new THREE.MeshLambertMaterial({ color: 0x6fbf4a }),
  zombieShirt: new THREE.MeshLambertMaterial({ color: 0x7a5230 }),
  bullet: new THREE.MeshBasicMaterial({ color: WEAPONS[0].color }),
  barrel: new THREE.MeshLambertMaterial({ color: 0xe0782e }),
  gateGood: new THREE.MeshLambertMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.55 }),
  gateBad: new THREE.MeshLambertMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.55 }),
  post: new THREE.MeshLambertMaterial({ color: 0xeeeeee }),
  road: new THREE.MeshLambertMaterial({ color: 0x8a8f99 }),
  ground: new THREE.MeshLambertMaterial({ color: 0x4a4d52 }),
  curb: new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  stripe: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x7a5230 }),
  crown: new THREE.MeshLambertMaterial({ color: 0x3f9a3a }),
  boss: new THREE.MeshLambertMaterial({ color: 0x5b6b4a }),
  bossEye: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  shock: new THREE.MeshBasicMaterial({ map: FX_TEX.ring, color: 0xc58bff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  inferno: new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: 0.25, depthWrite: false }), // glow under the flames
};

const FROZEN_COLOR = 0x9ad8ff;

// ---------- Text labels (canvas sprites) ----------
function makeLabel(scale = 1.6) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scale * 2, scale, 1);
  sprite.renderOrder = 10;
  let last = null;
  sprite.userData.setText = (lines, color = '#ffffff') => {
    const key = lines.join('|') + color;
    if (key === last) return;
    last = key;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(0,0,0,0.65)';
    g.fillStyle = color;
    const size = lines.length > 1 ? 48 : 72;
    g.font = `900 ${size}px system-ui, sans-serif`;
    lines.forEach((line, i) => {
      const y = c.height / 2 + (i - (lines.length - 1) / 2) * (size + 6);
      g.strokeText(line, c.width / 2, y);
      g.fillText(line, c.width / 2, y);
    });
    tex.needsUpdate = true;
  };
  sprite.userData.dispose = () => { tex.dispose(); mat.dispose(); };
  return sprite;
}

// ---------- Entity builders (CC0 models) ----------
const SOLDIER_MODELS = ['soldierA', 'soldierB', 'soldierC', 'soldierD', 'soldierE'];
const mixers = new Set();

function attachGun(soldier, tier) {
  if (soldier.gun) soldier.gun.parent.remove(soldier.gun);
  const gun = cloneStatic(WEAPONS[tier].model, 0.55);
  gun.position.set(0, -0.12, 0.18);
  gun.rotation.set(0, Math.PI, 0);
  soldier.arm.add(gun);
  soldier.gun = gun;
}

function makeSoldier(i) {
  const a = cloneAnimated(SOLDIER_MODELS[i % SOLDIER_MODELS.length], CHAR_SCALE);
  a.root.rotation.y = Math.PI; // models face +Z; the squad runs toward -Z
  a.arm = a.root.getObjectByName('arm-right');
  a.gun = null;
  attachGun(a, 0);
  a.mixer.timeScale = 0.9 + Math.random() * 0.2;
  return a;
}

function makeZombie(type) {
  const def = ENEMIES[type];
  const a = cloneAnimated(def.model, def.scale);
  if (def.tint) tint(a.root, def.tint, 0x3a2a00);
  a.play(def.anim, { timeScale: type === 'fast' ? 1.4 : 1 });
  a.mixer.setTime(Math.random() * 2);
  mixers.add(a.mixer);
  return a;
}

function makeBoss() {
  const a = cloneAnimated('zombie', 6.5);
  tint(a.root, 0x9a7f8f, 0x200000);
  a.play('walk', { timeScale: 0.6 });
  mixers.add(a.mixer);
  return a;
}

// Shared enemy materials for the Frost tint (clones share their source materials).
const frostMaterials = new Map();
function setFrozenLook(on) {
  const roots = zombies.filter((z) => z.alive).map((z) => z.anim.root);
  if (boss && boss.alive) roots.push(boss.anim.root);
  for (const r of roots) r.traverse((o) => {
    if (o.isMesh && !frostMaterials.has(o.material)) frostMaterials.set(o.material, o.material.color.clone());
  });
  frostMaterials.forEach((orig, m) => { m.color.copy(on ? new THREE.Color(FROZEN_COLOR) : orig); });
}

// ---------- Squad (persistent, built after assets load) ----------
const squadGroup = new THREE.Group();
scene.add(squadGroup);
const soldierMeshes = [];
function initSquadModels() {
  for (let i = 0; i < MAX_DRAWN_SOLDIERS; i++) {
    const s = makeSoldier(i);
    s.root.visible = false;
    squadGroup.add(s.root);
    soldierMeshes.push(s);
  }
}
const squadLabel = makeLabel(1.4);
scene.add(squadLabel);

// ---------- Bullet pool ----------
const bullets = [];
for (let i = 0; i < MAX_BULLETS; i++) {
  const m = new THREE.Mesh(GEO.bullet, MAT.bullet);
  m.visible = false;
  scene.add(m);
  bullets.push({ mesh: m, active: false, life: 0 });
}

// P3 ranged-enemy orb pool
const orbs = [];
const orbGeo = new THREE.SphereGeometry(0.3, 10, 8);
const orbMat = new THREE.MeshBasicMaterial({ color: 0xd070ff });
for (let i = 0; i < 24; i++) {
  const m = new THREE.Mesh(orbGeo, orbMat);
  m.visible = false;
  scene.add(m);
  orbs.push({ mesh: m, active: false, life: 0, vel: new THREE.Vector3() });
}

function fireOrb(zb) {
  const o = orbs.find((q) => !q.active);
  if (!o) return;
  o.active = true;
  o.life = 3;
  o.mesh.position.set(zb.x, 1.3, zb.z);
  o.vel.set(squad.x - zb.x, 0, squad.z - zb.z).normalize().multiplyScalar(ORB_SPEED);
  o.mesh.visible = true;
  zb.anim.play('attack-melee-right', { loop: false, fade: 0.05 });
  setTimeout(() => { if (zb.alive) zb.anim.play('walk'); }, 450);
}

// ---------- Effects ----------
const shockRing = new THREE.Mesh(GEO.ring, MAT.shock);
shockRing.rotation.x = -Math.PI / 2;
shockRing.visible = false;
scene.add(shockRing);

const infernoZone = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 16), MAT.inferno);
infernoZone.rotation.x = -Math.PI / 2;
infernoZone.visible = false;
scene.add(infernoZone);

// ---------- Game state ----------
let state = 'menu';
let level = null;
let levelGroup = null;
const squad = { x: 0, z: 0, count: 0, radius: 1 };
let weaponTier = 0;
let fireTimer = 0;
let runCoins = 0;
let kills = 0;
let elapsed = 0;
let freezeT = 0;
let infernoT = 0;
let shockT = 0;
let bossBiteT = 0;
const cooldowns = { frost: 0, shock: 0, inferno: 0 };
const keys = {};

let gates = [];
let barrels = [];
let zombies = [];
let traps = [];
let boss = null;
const labels = [];

function trackLabel(l) { labels.push(l); return l; }

function clearLevel() {
  if (levelGroup) {
    levelGroup.traverse((o) => {
      if (o.userData.ownGeometry) o.geometry.dispose();
      if (o.isBatchedMesh) o.dispose();
    });
    scene.remove(levelGroup);
  }
  labels.forEach((l) => l.userData.dispose());
  labels.length = 0;
  if (frostMaterials.size) { setFrozenLook(false); frostMaterials.clear(); }
  gates = []; barrels = []; zombies = []; traps = []; boss = null;
  orbs.forEach((o) => { o.active = false; o.mesh.visible = false; });
  mixers.clear();
  clearPhysics(scene);
  clearFx();
  bullets.forEach((b) => { b.active = false; b.mesh.visible = false; });
}

function buildEnvironment(len) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, len), MAT.ground);
  ground.userData.ownGeometry = true;
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -len / 2 + 30);
  ground.receiveShadow = true;
  levelGroup.add(ground);

  // Street, buildings and sidewalk props (batched; see city.js).
  buildCity(levelGroup, ROAD_HALF, 30, len, mulberry32(99), Math.sign(SUN_OFFSET.x));

  for (let z = 20; z > 30 - len; z -= 30) {
    for (const side of [-1, 1]) {
      const lamp = cloneStatic('lamp', 6);
      lamp.position.set(side * (ROAD_HALF + 0.4), 0, z);
      lamp.rotation.y = side > 0 ? Math.PI : 0;
      levelGroup.add(lamp);
    }
  }
}

function goodOp(rng, L) {
  return rng() < 0.25
    ? { op: '×', n: rng() < 0.8 ? 2 : 3 }
    : { op: '+', n: 3 + Math.floor(rng() * (6 + L * 2)) };
}

function badOp(rng, L) {
  return rng() < 0.3
    ? { op: '÷', n: 2 + Math.floor(rng() * 2) }
    : { op: '-', n: 2 + Math.floor(rng() * (4 + L * 2)) };
}

function spawnGatePair(z, rng, L) {
  const a = goodOp(rng, L);
  const b = rng() < 0.3 ? goodOp(rng, L) : badOp(rng, L);
  const sides = rng() < 0.5 ? [a, b] : [b, a];
  const pair = { z, used: false, sides: [], meshes: [] };
  sides.forEach((g, i) => {
    const x = i === 0 ? -2.5 : 2.5;
    const panel = new THREE.Mesh(GEO.gate, isGoodGate(g) ? MAT.gateGood.clone() : MAT.gateBad.clone());
    panel.position.set(x, 1.4, z);
    const post = new THREE.Mesh(GEO.post, MAT.post);
    post.position.set(x + (i === 0 ? -2.4 : 2.4), 1.5, z);
    const label = trackLabel(makeLabel(1.6));
    label.position.set(x, 1.6, z + 0.2);
    label.userData.setText([`${g.op}${g.n}`]);
    levelGroup.add(panel, post, label);
    Object.assign(g, { hits: 0, panel, label, flash: 0 });
    pair.sides.push(g);
    pair.meshes.push(panel, post, label);
  });
  gates.push(pair);
}

function isGoodGate(g) {
  return g.op === '+' || g.op === '×';
}

// P1: shooting a gate improves it. + and × grow; − and ÷ shrink and flip to +1.
function hitGate(g) {
  g.hits++;
  g.flash = 0.12;
  const mul = g.op === '×' || g.op === '÷';
  if (g.hits < (mul ? GATE_HITS_MUL : GATE_HITS_ADD)) return;
  g.hits = 0;
  if (g.op === '+') g.n++;
  else if (g.op === '×') g.n = Math.min(GATE_MUL_MAX, g.n + 1);
  else {
    g.n--;
    if (g.n <= (g.op === '÷' ? 1 : 0)) {
      g.op = '+';
      g.n = 1;
      g.panel.material.color.setHex(0x3aa0ff);
    }
  }
  g.label.userData.setText([`${g.op}${g.n}`]);
}

function spawnTrap(z, rng, L) {
  const x = -ROAD_HALF + TRAP_HALF_WIDTH + rng() * (ROAD_HALF * 2 - TRAP_HALF_WIDTH * 2);
  const group = new THREE.Group();
  for (const dx of [-1, 0, 1]) {
    const b = cloneStatic('barrier', 7);
    b.position.set(dx * 0.95, 0, 0);
    b.rotation.y = Math.PI / 2;
    group.add(b);
  }
  for (const dx of [-1.6, 1.6]) {
    const c = cloneStatic('cone', 8);
    c.position.set(dx, 0, 0.6);
    group.add(c);
  }
  group.position.set(x, 0, z);
  const label = trackLabel(makeLabel(1.1));
  label.position.set(x, 2.2, z);
  label.userData.setText(['TRAP'], '#ff6b5e');
  levelGroup.add(group, label);
  traps.push({ x, z, cost: 3 + L, used: false });
}

function spawnBarrel(z, rng, L) {
  const x = -3.5 + rng() * 7;
  const hp = 60 + 25 * L;
  const reward = rng() < 0.55 ? { type: 'weapon' } : { type: 'squad', n: 4 + Math.floor(rng() * (4 + L)) };
  const mesh = reward.type === 'weapon' ? cloneStatic('crate', 1.6) : cloneStatic('barrel', 5.5);
  if (reward.type === 'weapon') mesh.rotation.y = Math.PI / 2;
  mesh.position.set(x, 0, z);
  const label = trackLabel(makeLabel(1.3));
  label.position.set(x, 2.3, z);
  levelGroup.add(mesh, label);
  const barrel = { x, z, hp, reward, mesh, label, alive: true };
  updateBarrelLabel(barrel);
  barrels.push(barrel);
}

function updateBarrelLabel(b) {
  const top = b.reward.type === 'weapon' ? 'GUN UP' : `+${b.reward.n}`;
  b.label.userData.setText([top, String(Math.max(0, Math.ceil(b.hp)))], '#ffe9a8');
}

// P3: group composition unlocks by level (fast L2+, ranged L3+, tank L4+).
function pickEnemyType(rng, L, i) {
  if (L >= 4 && i === 0) return 'tank';
  if (L >= 3 && i === 1) return 'ranged';
  if (L >= 2 && rng() < 0.25) return 'fast';
  return 'normal';
}

function spawnEnemy(type, x, z, L, rng) {
  const def = ENEMIES[type];
  const anim = makeZombie(type);
  anim.root.position.set(x, 0, z);
  levelGroup.add(anim.root);
  const hp = (20 + 6 * L) * def.hp;
  zombies.push({ type, def, x, z, hp, anim, alive: true, phase: rng() * 6, fireT: def.fireEvery || 0, radius: def.radius || 0.45 });
}

function spawnZombieGroup(z, rng, L, withGold) {
  const n = 6 + 2 * L;
  for (let i = 0; i < n; i++) {
    spawnEnemy(pickEnemyType(rng, L, i), -4 + rng() * 8, z - rng() * 8, L, rng);
  }
  if (withGold) spawnEnemy('gold', -3 + rng() * 6, z - 10, L, rng);
}

function spawnBoss(z, L) {
  const anim = makeBoss();
  anim.root.position.set(0, 0, z);
  levelGroup.add(anim.root);
  const maxHp = Math.round(1500 * Math.pow(1.35, L - 1));
  boss = { x: 0, z, hp: maxHp, maxHp, anim, alive: true, active: false };
}

function buildLevel(L) {
  clearLevel();
  levelGroup = new THREE.Group();
  scene.add(levelGroup);
  const rng = mulberry32(L * 7919 + 13);
  const length = 260 + 20 * L;
  level = { L, length, bossZ: -length };
  buildEnvironment(length + 120);

  let z = -40;
  let i = 0;
  const goldGroup = 1 + Math.floor(rng() * 2); // one gold ghost per level
  let groups = 0;
  while (z > -length + 40) {
    const kind = i % 3 === 0 ? 'gate' : i % 3 === 1 ? 'zombies' : (rng() < 0.6 ? 'barrel' : 'zombies');
    if (kind === 'gate') spawnGatePair(z, rng, L);
    else if (kind === 'barrel') spawnBarrel(z, rng, L);
    else {
      spawnZombieGroup(z, rng, L, ++groups === goldGroup);
      if (rng() < 0.35) spawnTrap(z + 15, rng, L); // P2: trap in front of some groups
    }
    z -= 30 + rng() * 10;
    i++;
  }
  spawnBoss(level.bossZ, L);
}

// ---------- Run lifecycle ----------
function startRun() {
  buildLevel(save.level);
  squad.x = 0; squad.z = 0;
  squad.count = 5 + save.recruits;
  weaponTier = 0;
  fireTimer = 0; runCoins = 0; kills = 0; elapsed = 0;
  freezeT = 0; infernoT = 0; shockT = 0; bossBiteT = 0;
  Object.keys(cooldowns).forEach((k) => { cooldowns[k] = 0; });
  MAT.bullet.color.setHex(WEAPONS[0].color);
  soldierMeshes.forEach((s) => { attachGun(s, 0); s.play('sprint'); });
  state = 'playing';
  ui.menu.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.skills.classList.remove('hidden');
  ui.bossWrap.classList.add('hidden');
}

function endRun(won) {
  state = won ? 'won' : 'lost';
  if (won) runCoins += 50 * level.L;
  save.coins += runCoins;
  if (won) save.level += 1;
  writeSave();
  ui.skills.classList.add('hidden');
  ui.resultTitle.textContent = won ? 'VICTORY' : 'DEFEATED';
  ui.resultText.textContent = `Zombies down: ${kills} · Coins earned: ${runCoins}`;
  ui.resultBtn.textContent = won ? 'NEXT' : 'RETRY';
  ui.result.classList.remove('hidden');
}

// ---------- Combat ----------
function weaponDamage() {
  return WEAPONS[weaponTier].dmg * (1 + 0.15 * save.firepower);
}

function fireInterval() {
  return WEAPONS[weaponTier].interval * Math.max(0.4, 1 - 0.06 * save.rate);
}

function fireVolley() {
  const shots = Math.min(squad.count, 10);
  let fired = 0;
  for (const b of bullets) {
    if (fired >= shots) break;
    if (b.active) continue;
    const i = Math.floor(Math.random() * Math.min(squad.count, MAX_DRAWN_SOLDIERS));
    const r = 0.42 * Math.sqrt(i);
    const a = i * 2.39996;
    b.active = true;
    b.life = BULLET_LIFE;
    b.mesh.visible = true;
    b.mesh.position.set(squad.x + Math.cos(a) * r, 0.8, squad.z + Math.sin(a) * r - 0.4);
    if (fired < 3) fx.muzzle(tmpPos.set(b.mesh.position.x, 0.9, b.mesh.position.z - 0.3), WEAPONS[weaponTier].color);
    fired++;
  }
}

const tmpPos = new THREE.Vector3();

function killZombie(zb, byPlayer) {
  zb.alive = false;
  const root = zb.anim.root;
  if (!byPlayer) {
    fx.burst(tmpPos.set(zb.x, 1, zb.z), 0x8fd14f);
    levelGroup.remove(root);
    mixers.delete(zb.anim.mixer);
    return;
  }
  kills++;
  runCoins += zb.def.coins;
  if (zb.type === 'gold') fx.coins(tmpPos.set(zb.x, 1.5, zb.z), 24);
  zb.anim.play('die', { loop: false, fade: 0.05 });
  // Ragdoll-lite: the body is flung away from the squad and tumbles under physics.
  const s = zb.def.scale;
  const heavy = zb.type === 'tank' ? 0.5 : 1;
  spawnCorpse(scene, root, { x: 0.3 * s, y: 0.4 * s, z: 0.18 * s },
    { x: (Math.random() - 0.5) * 3 * heavy, y: (3 + Math.random() * 3) * heavy, z: -(4 + Math.random() * 4) * heavy },
    () => mixers.delete(zb.anim.mixer));
}

function damageZombie(zb, dmg, showFx = true) {
  zb.hp -= dmg;
  if (showFx) {
    fx.hit(tmpPos.set(zb.x, 1.2, zb.z + 0.3));
    fx.damage(tmpPos.set(zb.x, 2.2, zb.z), dmg);
  }
  if (zb.type !== 'tank') zb.z -= 0.12; // knockback
  if (zb.hp <= 0) killZombie(zb, true);
}

function damageBoss(dmg, showFx = true) {
  if (!boss || !boss.alive) return;
  boss.hp -= dmg;
  if (showFx) fx.damage(tmpPos.set((Math.random() - 0.5) * 2, 6, boss.z), dmg);
  if (boss.hp <= 0) {
    boss.alive = false;
    boss.anim.play('die', { loop: false, fade: 0.05 });
    spawnCorpse(scene, boss.anim.root, { x: 1.8, y: 2.6, z: 1.1 }, { x: 0, y: 6, z: -10 }, () => mixers.delete(boss.anim.mixer));
    fx.coins(tmpPos.set(0, 3, boss.z), 40);
    endRun(true);
  }
}

function hitBarrel(b, dmg) {
  b.hp -= dmg;
  fx.hit(tmpPos.set(b.x, 1, b.z + 0.6), 0xffc27a);
  if (b.hp <= 0) {
    destroyBarrel(b);
    spawnDebris(scene, tmpPos.set(b.x, 0.5, b.z), b.reward.type === 'weapon' ? 0x8a5a3c : 0xc0662a, 10, 0.4, 7);
    fx.explosion(tmpPos.set(b.x, 1, b.z));
    fx.coins(tmpPos.set(b.x, 1.2, b.z), 8);
    fx.shake(0.4, 0.3);
    runCoins += 5;
    if (b.reward.type === 'weapon') {
      weaponTier = Math.min(WEAPONS.length - 1, weaponTier + 1);
      MAT.bullet.color.setHex(WEAPONS[weaponTier].color);
      soldierMeshes.forEach((s) => attachGun(s, weaponTier));
    } else {
      squad.count = Math.min(MAX_SQUAD, squad.count + b.reward.n);
    }
  } else {
    updateBarrelLabel(b);
  }
}

function destroyBarrel(b) {
  b.alive = false;
  levelGroup.remove(b.mesh, b.label);
}

function useSkill(id) {
  if (state !== 'playing' || cooldowns[id] > 0) return;
  cooldowns[id] = SKILLS[id].cooldown;
  if (id === 'frost') {
    freezeT = 3;
    setFrozenLook(true);
  } else if (id === 'shock') {
    shockT = 0.5;
    const dmg = 60 * level.L;
    let bolts = 0;
    for (const zb of zombies) {
      if (!zb.alive || Math.hypot(zb.x - squad.x, zb.z - squad.z) >= 30) continue;
      if (bolts++ < 12) fx.bolt(tmpPos.set(zb.x, 1.6, zb.z));
      damageZombie(zb, dmg);
    }
    if (boss && boss.alive && Math.abs(boss.z - squad.z) < 30) damageBoss(dmg);
  } else if (id === 'inferno') {
    infernoT = 4;
  }
}

// ---------- Main update ----------
function update(dt) {
  if (state !== 'playing') return;
  elapsed += dt;

  for (const k in cooldowns) cooldowns[k] = Math.max(0, cooldowns[k] - dt);
  if (freezeT > 0) {
    freezeT -= dt;
    if (freezeT <= 0) setFrozenLook(false);
  }
  const frozen = freezeT > 0;

  // Movement
  const bossPhase = squad.z <= level.bossZ + BOSS_STOP_DIST;
  if (!bossPhase) squad.z -= RUN_SPEED * dt;
  if (boss && boss.alive && bossPhase && !boss.active) {
    boss.active = true;
    ui.bossWrap.classList.remove('hidden');
    soldierMeshes.forEach((s) => s.play('holding-right-shoot'));
  }
  let steer = 0;
  if (keys.ArrowLeft || keys.KeyA) steer -= 1;
  if (keys.ArrowRight || keys.KeyD) steer += 1;
  squad.x += steer * STEER_SPEED * dt;
  const drawn = Math.min(squad.count, MAX_DRAWN_SOLDIERS);
  squad.radius = 0.42 * Math.sqrt(Math.max(drawn, 1)) + 0.3;
  squad.x = clamp(squad.x, -ROAD_HALF + squad.radius, ROAD_HALF - squad.radius);

  // Gates
  for (const pair of gates) {
    if (pair.used || squad.z > pair.z) continue;
    pair.used = true;
    const g = pair.sides[squad.x < 0 ? 0 : 1];
    squad.count = clamp(applyOp(squad.count, g), 0, MAX_SQUAD);
    pair.meshes.forEach((m) => levelGroup.remove(m));
  }

  // Shooting
  fireTimer -= dt;
  if (fireTimer <= 0 && squad.count > 0) {
    fireVolley();
    fireTimer = fireInterval();
  }

  // Bullets
  const dmg = weaponDamage();
  for (const b of bullets) {
    if (!b.active) continue;
    b.life -= dt;
    const p = b.mesh.position;
    p.z -= BULLET_SPEED * dt;
    let hit = b.life <= 0;
    if (!hit) {
      for (const pair of gates) {
        if (!pair.used && Math.abs(pair.z - p.z) < 0.5 && Math.abs(p.x) < ROAD_HALF) {
          const g = pair.sides[p.x < 0 ? 0 : 1];
          hitGate(g);
          fx.gateHit(tmpPos.set(p.x, p.y, pair.z + 0.2));
          hit = true; break;
        }
      }
    }
    if (!hit) {
      for (const zb of zombies) {
        if (zb.alive && Math.abs(zb.z - p.z) < 0.6 && Math.abs(zb.x - p.x) < zb.radius + 0.05) {
          damageZombie(zb, dmg); hit = true; break;
        }
      }
    }
    if (!hit) {
      for (const br of barrels) {
        if (br.alive && Math.abs(br.z - p.z) < BARREL_RADIUS && Math.abs(br.x - p.x) < BARREL_RADIUS) {
          hitBarrel(br, dmg); hit = true; break;
        }
      }
    }
    if (!hit && boss && boss.alive && Math.abs(boss.z - p.z) < 1.5 && Math.abs(boss.x - p.x) < BOSS_RADIUS) {
      damageBoss(dmg); hit = true;
    }
    if (hit) { b.active = false; b.mesh.visible = false; }
    if (state !== 'playing') return;
  }

  // Barrels touching the squad
  for (const br of barrels) {
    if (!br.alive) continue;
    if (Math.abs(br.z - squad.z) < squad.radius + BARREL_RADIUS && Math.abs(br.x - squad.x) < squad.radius + BARREL_RADIUS) {
      destroyBarrel(br);
      spawnDebris(scene, tmpPos.set(br.x, 0.5, br.z), 0x8a5a3c, 8, 0.4, 6);
      fx.shake(0.35, 0.25);
      squad.count = Math.max(0, squad.count - BARREL_HIT_COST);
    }
  }

  // P2: traps cost soldiers once when the squad runs into them.
  for (const t of traps) {
    if (t.used) continue;
    if (Math.abs(t.z - squad.z) < squad.radius + 0.4 && Math.abs(t.x - squad.x) < squad.radius + TRAP_HALF_WIDTH) {
      t.used = true;
      squad.count = Math.max(0, squad.count - t.cost);
      fx.burst(tmpPos.set(squad.x, 1, squad.z), 0xff4d4d);
    }
  }

  // Zombies (P3 behaviours per type)
  const burn = 40 * (1 + 0.15 * (level.L - 1)) * dt;
  for (const zb of zombies) {
    if (!zb.alive) continue;
    const dx = squad.x - zb.x, dz = squad.z - zb.z;
    const dist = Math.hypot(dx, dz);
    if (dist > ZOMBIE_WAKE_DIST) continue;
    const def = zb.def;
    if (!frozen && dist > 0.001) {
      const speed = ZOMBIE_SPEED * def.speed;
      if (def.range && dz > 0 && dz <= def.range + 0.5) {
        // Ranged: once in range, hold that distance ahead of the squad and slide toward its lane.
        zb.z += (squad.z - def.range - zb.z) * Math.min(1, dt * 3);
        zb.x += Math.sign(dx) * Math.min(Math.abs(dx), 2 * dt);
        zb.fireT -= dt;
        if (zb.fireT <= 0) { fireOrb(zb); zb.fireT = def.fireEvery; }
      } else {
        zb.x += (dx / dist) * speed * dt;
        zb.z += (dz / dist) * speed * dt;
      }
      zb.x = clamp(zb.x, -ROAD_HALF - 2, ROAD_HALF + 2);
    }
    zb.anim.root.position.set(zb.x, 0, zb.z);
    zb.anim.root.rotation.y = Math.atan2(dx, dz) + (def.speed < 0 ? Math.PI : 0);
    if (dist < squad.radius + zb.radius) {
      killZombie(zb, false);
      squad.count = Math.max(0, squad.count - def.bite);
      continue;
    }
    if (infernoT > 0 && Math.abs(zb.x) <= ROAD_HALF && zb.z < squad.z - 4 && zb.z > squad.z - 20) {
      damageZombie(zb, burn, false);
    }
  }

  // P3: ranged-enemy orbs fly toward where the squad was; dodge by steering.
  for (const o of orbs) {
    if (!o.active) continue;
    o.mesh.position.addScaledVector(o.vel, frozen ? 0 : dt);
    o.life -= dt;
    if (Math.random() < 0.5) fx.orbTrail(o.mesh.position);
    const p = o.mesh.position;
    if (Math.abs(p.x - squad.x) < squad.radius && Math.abs(p.z - squad.z) < squad.radius) {
      squad.count = Math.max(0, squad.count - 1);
      fx.burst(p, 0xc04bff);
      o.active = false;
    }
    if (o.life <= 0) o.active = false;
    o.mesh.visible = o.active;
  }

  // Boss
  if (boss && boss.alive && boss.active) {
    const gap = (squad.z - boss.z) - (BOSS_RADIUS + squad.radius);
    if (!frozen && gap > 0) boss.z += BOSS_SPEED * dt;
    boss.anim.root.position.z = boss.z;
    if (gap <= 0) {
      boss.anim.play('attack-melee-right', { timeScale: 0.8 });
      bossBiteT -= dt;
      if (bossBiteT <= 0) {
        squad.count = Math.max(0, squad.count - 1);
        bossBiteT = 0.25;
      }
    }
    if (infernoT > 0 && boss.z < squad.z - 4 && boss.z > squad.z - 20 - BOSS_RADIUS) {
      damageBoss(burn, false);
      if (state !== 'playing') return;
    }
  }

  // Effects
  if (infernoT > 0) infernoT -= dt;
  infernoZone.visible = infernoT > 0;
  infernoZone.position.set(0, 0.05, squad.z - 12);
  if (infernoT > 0) {
    for (let i = 0; i < 3; i++) {
      if (Math.random() < 15 * dt) fx.fire(tmpPos.set((Math.random() - 0.5) * ROAD_HALF * 2, 0.5, squad.z - 4 - Math.random() * 16));
    }
  }
  if (shockT > 0) {
    shockT -= dt;
    const s = 1 + (0.5 - shockT) * 60;
    shockRing.scale.set(s, s, s);
    shockRing.position.set(squad.x, 0.1, squad.z);
  }
  shockRing.visible = shockT > 0;

  if (squad.count <= 0) endRun(false);
}

// ---------- Rendering helpers ----------
function layoutSquad() {
  if (soldierMeshes.length === 0) return; // models still loading
  const drawn = Math.min(squad.count, MAX_DRAWN_SOLDIERS);
  for (let i = 0; i < MAX_DRAWN_SOLDIERS; i++) {
    const s = soldierMeshes[i];
    s.root.visible = i < drawn && state !== 'menu';
    if (!s.root.visible) continue;
    const r = 0.42 * Math.sqrt(i);
    const a = i * 2.39996;
    s.root.position.set(squad.x + Math.cos(a) * r, 0, squad.z + Math.sin(a) * r);
  }
  squadLabel.visible = state !== 'menu';
  squadLabel.position.set(squad.x, 2.4 + squad.radius * 0.5, squad.z);
  squadLabel.userData.setText([String(squad.count)]);
}

const shakeVec = new THREE.Vector3();
function updateCamera(dt) {
  shakeOffset(dt, shakeVec);
  camera.position.set(squad.x * 0.4 + shakeVec.x, 13 + shakeVec.y, squad.z + 15 + shakeVec.z);
  camera.lookAt(squad.x * 0.3 + shakeVec.x, 0, squad.z - 14);
  // Keep the shadow frustum centred just ahead of the squad.
  sun.target.position.set(0, 0, squad.z - 12);
  sun.position.copy(sun.target.position).add(SUN_OFFSET);
}

function updateAnimations(dt) {
  const drawn = Math.min(squad.count, MAX_DRAWN_SOLDIERS);
  if (state !== 'menu') for (let i = 0; i < drawn; i++) soldierMeshes[i].mixer.update(dt);
  const frozen = freezeT > 0;
  mixers.forEach((m) => m.update(frozen ? 0 : dt));
}

// ---------- UI ----------
const ui = {
  hud: document.getElementById('hud'),
  level: document.getElementById('hud-level'),
  weapon: document.getElementById('hud-weapon'),
  coins: document.getElementById('hud-coins'),
  progress: document.getElementById('hud-progress'),
  bossWrap: document.getElementById('boss-wrap'),
  bossFill: document.getElementById('boss-fill'),
  skills: document.getElementById('skills'),
  menu: document.getElementById('menu'),
  menuLevel: document.getElementById('menu-level'),
  menuCoins: document.getElementById('menu-coins'),
  upgrades: document.getElementById('upgrades'),
  play: document.getElementById('play'),
  result: document.getElementById('result'),
  resultTitle: document.getElementById('result-title'),
  resultText: document.getElementById('result-text'),
  resultBtn: document.getElementById('result-btn'),
};

function renderMenu() {
  ui.menuLevel.textContent = save.level;
  ui.menuCoins.textContent = save.coins;
  ui.upgrades.innerHTML = '';
  for (const u of UPGRADES) {
    const cost = upgradeCost(u);
    const row = document.createElement('div');
    row.className = 'upgrade';
    row.innerHTML = `<div class="info"><b>${u.label} · Lv ${save[u.id]}</b><small>${u.desc}</small></div>`;
    const btn = document.createElement('button');
    btn.textContent = `● ${cost}`;
    btn.disabled = save.coins < cost;
    btn.addEventListener('click', () => {
      if (save.coins < cost) return;
      save.coins -= cost;
      save[u.id] += 1;
      writeSave();
      renderMenu();
    });
    row.appendChild(btn);
    ui.upgrades.appendChild(row);
  }
}

function showMenu() {
  state = 'menu';
  ui.result.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.skills.classList.add('hidden');
  ui.menu.classList.remove('hidden');
  renderMenu();
}

function updateHud() {
  if (state === 'menu' || !level) return;
  ui.level.textContent = `Level ${level.L}`;
  ui.weapon.textContent = WEAPONS[weaponTier].name;
  ui.coins.textContent = save.coins + runCoins;
  ui.progress.style.width = `${clamp(-squad.z / (level.length - BOSS_STOP_DIST), 0, 1) * 100}%`;
  if (boss) ui.bossFill.style.width = `${clamp(boss.hp / boss.maxHp, 0, 1) * 100}%`;
  ui.skills.querySelectorAll('.skill').forEach((btn) => {
    const cd = cooldowns[btn.dataset.skill];
    btn.querySelector('.cd').textContent = cd > 0 ? Math.ceil(cd) : '';
  });
}

ui.play.addEventListener('click', startRun);
ui.resultBtn.addEventListener('click', showMenu);
ui.skills.querySelectorAll('.skill').forEach((btn) => {
  btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); useSkill(btn.dataset.skill); });
});

// ---------- Input ----------
let dragX = null;
canvas.addEventListener('pointerdown', (e) => { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (dragX === null || state !== 'playing') return;
  squad.x += ((e.clientX - dragX) / window.innerWidth) * 14;
  dragX = e.clientX;
});
canvas.addEventListener('pointerup', () => { dragX = null; });
canvas.addEventListener('pointercancel', () => { dragX = null; });
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Digit1') useSkill('frost');
  if (e.code === 'Digit2') useSkill('shock');
  if (e.code === 'Digit3') useSkill('inferno');
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Read-only stats for automated smoke tests.
window.__hh = {
  stats: () => ({
    state, level: level ? level.L : save.level, count: squad.count, x: squad.x, z: squad.z,
    traps: traps.map((t) => ({ x: t.x, z: t.z, used: t.used })),
    barrels: barrels.map((b) => ({ x: Math.round(b.x), z: Math.round(b.z), type: b.reward.type, alive: b.alive })),
    kills, runCoins, weapon: WEAPONS[weaponTier].name, bossHp: boss ? boss.hp : null,
    zombiesAlive: zombies.filter((z) => z.alive).length,
    enemyTypes: [...new Set(zombies.map((z) => z.type))],
    gates: gates.map((p) => ({ z: p.z, used: p.used, sides: p.sides.map((g) => `${g.op}${g.n}`) })),
    trapsHit: traps.filter((t) => t.used).length,
    physics: physicsStats(),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  }),
};

// ---------- Loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  updateAnimations(dt);
  stepPhysics(dt, scene);
  layoutSquad();
  updateCamera(dt);
  updateCityLod(camera.position.z);
  updateFx(dt, camera, window.innerWidth, window.innerHeight);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

initFx(scene);
showMenu();
requestAnimationFrame(frame);
loadAssets((p) => { ui.play.textContent = `LOADING ${Math.round(p * 100)}%`; })
  .then(() => {
    initSquadModels();
    buildLevel(save.level);
    ui.play.textContent = 'PLAY';
    ui.play.disabled = false;
  })
  .catch((e) => {
    console.error(e);
    ui.play.textContent = 'LOAD FAILED';
  });
