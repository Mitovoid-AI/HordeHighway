// Combat particles (pooled textured sprites), floating damage numbers (pooled DOM) and camera shake.
// Particle textures: Kenney Particle Pack (CC0), see ../CREDITS.md.
import * as THREE from 'three';

const MAX_SPARKS = 260;
const MAX_NUMBERS = 32;

const loader = new THREE.TextureLoader();
export const FX_TEX = {};
for (const k of ['muzzle', 'spark', 'flare', 'smoke', 'fire', 'bolt', 'glow', 'ring']) {
  FX_TEX[k] = loader.load(`assets/fx/${k}.png`);
  FX_TEX[k].colorSpace = THREE.SRGBColorSpace;
}

let sparks = [];
let numbers = [];
let shakeT = 0;
let shakePower = 0;
let numbersLayer = null;
const tmp = new THREE.Vector3();

export function initFx(scene) {
  for (let i = 0; i < MAX_SPARKS; i++) {
    const mat = new THREE.SpriteMaterial({ map: FX_TEX.spark, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    scene.add(s);
    sparks.push({ sprite: s, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 1, gravity: 0, grow: 0, spin: 0, alpha: 1 });
  }
  numbersLayer = document.createElement('div');
  numbersLayer.id = 'dmg-layer';
  document.body.appendChild(numbersLayer);
  for (let i = 0; i < MAX_NUMBERS; i++) {
    const el = document.createElement('div');
    el.className = 'dmg';
    numbersLayer.appendChild(el);
    numbers.push({ el, pos: new THREE.Vector3(), life: 0 });
  }
}

// grow: extra size reached by the end of life (smoke billows); rise: upward drift; normal: alpha-blended
// instead of additive (smoke darkens instead of glowing); jitter: random spawn offset.
function emit(pos, color, { tex = 'spark', count = 1, speed = 0, size = 0.4, life = 0.25, gravity = 0, spread = 1,
  grow = 0, rise = 0, normal = false, alpha = 1, spin = 0, jitter = 0 } = {}) {
  let n = 0;
  for (const p of sparks) {
    if (n >= count) break;
    if (p.life > 0) continue;
    const m = p.sprite.material;
    p.sprite.position.copy(pos);
    if (jitter) p.sprite.position.add(tmp.set((Math.random() - 0.5) * jitter, 0, (Math.random() - 0.5) * jitter));
    m.map = FX_TEX[tex];
    m.blending = normal ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.color.setHex(color);
    m.rotation = Math.random() * Math.PI * 2;
    p.vel.set((Math.random() - 0.5) * spread, Math.random() * spread * 0.8, (Math.random() - 0.5) * spread).multiplyScalar(speed);
    p.vel.y += rise;
    p.life = p.maxLife = life * (0.7 + Math.random() * 0.6);
    Object.assign(p, { size, gravity, grow, alpha, spin: spin * (Math.random() - 0.5) });
    p.sprite.visible = true;
    n++;
  }
}

export const fx = {
  muzzle: (pos, color) => emit(pos, color, { tex: 'muzzle', size: 0.8, life: 0.06 }),
  hit: (pos, color = 0xfff3b0) => emit(pos, color, { count: 2, speed: 4, size: 0.5, life: 0.2, gravity: 10, spin: 8 }),
  gateHit: (pos) => emit(pos, 0x9fd8ff, { tex: 'flare', size: 0.9, life: 0.18 }),
  coins: (pos, n = 10) => emit(pos, 0xffd23f, { count: n, speed: 6, size: 0.5, life: 0.7, gravity: 14, spin: 6 }),
  burst(pos, color) {
    emit(pos, color, { tex: 'flare', size: 2.2, life: 0.15 });
    emit(pos, color, { count: 8, speed: 7, size: 0.45, life: 0.4, gravity: 8, spin: 8 });
    emit(pos, 0x8a8a8a, { tex: 'smoke', count: 5, speed: 1.5, size: 1.1, grow: 1.6, rise: 1.2, life: 0.9, normal: true, alpha: 0.55, spin: 1.5, jitter: 0.8 });
  },
  explosion(pos) {
    emit(pos, 0xffd08a, { tex: 'flare', size: 4, life: 0.18 });
    emit(pos, 0xff9a3c, { tex: 'fire', count: 7, speed: 3, size: 1.4, grow: 1.2, rise: 2, life: 0.5, spin: 3, jitter: 0.8 });
    emit(pos, 0x5a5550, { tex: 'smoke', count: 7, speed: 1.5, size: 1.4, grow: 2.2, rise: 1.8, life: 1.3, normal: true, alpha: 0.6, spin: 1.5, jitter: 1 });
  },
  fire: (pos) => emit(pos, 0xff8a2a, { tex: 'fire', size: 1.5, grow: 0.6, rise: 2.6, life: 0.55, spin: 2 }),
  bolt: (pos) => emit(pos, 0xd9b3ff, { tex: 'bolt', size: 2.6, life: 0.2 }),
  orbTrail: (pos) => emit(pos, 0xc04bff, { tex: 'glow', size: 0.7, life: 0.2 }),
  damage(pos, amount) {
    let slot = numbers.find((d) => d.life <= 0);
    if (!slot) slot = numbers.reduce((a, b) => (a.life < b.life ? a : b));
    slot.pos.copy(pos);
    slot.pos.x += (Math.random() - 0.5) * 0.6;
    slot.life = 0.6;
    slot.el.textContent = Math.round(amount);
    slot.el.style.display = 'block';
  },
  shake(power = 0.35, time = 0.3) {
    shakePower = Math.max(shakePower, power);
    shakeT = Math.max(shakeT, time);
  },
};

export function updateFx(dt, camera, width, height) {
  for (const p of sparks) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.sprite.visible = false; continue; }
    p.vel.y -= p.gravity * dt;
    p.sprite.position.addScaledVector(p.vel, dt);
    const k = p.life / p.maxLife;
    p.sprite.scale.setScalar(p.grow ? p.size * (1 + p.grow * (1 - k)) : p.size * (0.4 + 0.6 * k));
    p.sprite.material.opacity = k * p.alpha;
    p.sprite.material.rotation += p.spin * dt;
  }
  for (const d of numbers) {
    if (d.life <= 0) continue;
    d.life -= dt;
    if (d.life <= 0) { d.el.style.display = 'none'; continue; }
    d.pos.y += dt * 2.2;
    tmp.copy(d.pos).project(camera);
    if (tmp.z > 1) { d.el.style.display = 'none'; continue; }
    const x = (tmp.x * 0.5 + 0.5) * width;
    const y = (-tmp.y * 0.5 + 0.5) * height;
    d.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    d.el.style.opacity = Math.min(1, d.life / 0.3).toFixed(2);
  }
}

// Returns a camera offset for the current shake, decaying over time.
export function shakeOffset(dt, out) {
  if (shakeT <= 0) return out.set(0, 0, 0);
  shakeT -= dt;
  const p = shakePower * Math.max(0, shakeT) / 0.3;
  if (shakeT <= 0) shakePower = 0;
  return out.set((Math.random() - 0.5) * p, (Math.random() - 0.5) * p, (Math.random() - 0.5) * p * 0.5);
}

export function clearFx() {
  for (const p of sparks) { p.life = 0; p.sprite.visible = false; }
  for (const d of numbers) { d.life = 0; d.el.style.display = 'none'; }
  shakeT = 0;
}
