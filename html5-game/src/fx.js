// Combat particles (pooled additive sprites), floating damage numbers (pooled DOM) and camera shake.
import * as THREE from 'three';

const MAX_SPARKS = 160;
const MAX_NUMBERS = 32;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let sparks = [];
let numbers = [];
let shakeT = 0;
let shakePower = 0;
let numbersLayer = null;
const tmp = new THREE.Vector3();

export function initFx(scene) {
  const tex = glowTexture();
  for (let i = 0; i < MAX_SPARKS; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    scene.add(s);
    sparks.push({ sprite: s, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 1, gravity: 0 });
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

function emit(pos, color, { count = 1, speed = 0, size = 0.4, life = 0.25, gravity = 0, spread = 1 } = {}) {
  let n = 0;
  for (const p of sparks) {
    if (n >= count) break;
    if (p.life > 0) continue;
    p.sprite.position.copy(pos);
    p.sprite.material.color.setHex(color);
    p.vel.set((Math.random() - 0.5) * spread, Math.random() * spread * 0.8, (Math.random() - 0.5) * spread).multiplyScalar(speed);
    p.life = p.maxLife = life * (0.7 + Math.random() * 0.6);
    p.size = size;
    p.gravity = gravity;
    p.sprite.visible = true;
    n++;
  }
}

export const fx = {
  muzzle: (pos, color) => emit(pos, color, { size: 0.55, life: 0.06 }),
  hit: (pos, color = 0xfff3b0) => emit(pos, color, { count: 3, speed: 5, size: 0.25, life: 0.22, gravity: 12 }),
  gateHit: (pos) => emit(pos, 0x9fd8ff, { count: 2, speed: 3, size: 0.45, life: 0.2 }),
  coins: (pos, n = 10) => emit(pos, 0xffd23f, { count: n, speed: 6, size: 0.35, life: 0.7, gravity: 14 }),
  burst: (pos, color) => emit(pos, color, { count: 14, speed: 7, size: 0.5, life: 0.45, gravity: 8 }),
  orbTrail: (pos) => emit(pos, 0xc04bff, { size: 0.5, life: 0.15 }),
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
    p.sprite.scale.setScalar(p.size * (0.4 + 0.6 * k));
    p.sprite.material.opacity = k;
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
