// cannon-es physics for reactions only: tumbling corpses and crate debris.
// Core movement/collisions stay deterministic in main.js.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const MAX_CORPSES = 30;
const MAX_DEBRIS = 48;
const CORPSE_LIFE = 2.2;
const DEBRIS_LIFE = 1.6;
const STEP = 1 / 60;

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.defaultContactMaterial.friction = 0.4;
world.defaultContactMaterial.restitution = 0.25;

const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(ground);

const corpses = [];
const debris = [];
let accumulator = 0;

const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
const debrisMats = new Map();

function debrisMaterial(color) {
  if (!debrisMats.has(color)) debrisMats.set(color, new THREE.MeshLambertMaterial({ color }));
  return debrisMats.get(color);
}

function removeEntry(list, i, scene) {
  const e = list[i];
  world.removeBody(e.body);
  scene.remove(e.mesh);
  if (e.onRemove) e.onRemove();
  list.splice(i, 1);
}

// Turns a dead character mesh into a physics body flung by `impulse`.
export function spawnCorpse(scene, mesh, halfExtents, impulse, onRemove) {
  if (corpses.length >= MAX_CORPSES) removeEntry(corpses, 0, scene);
  const body = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Box(new CANNON.Vec3(halfExtents.x, halfExtents.y, halfExtents.z)),
    position: new CANNON.Vec3(mesh.position.x, mesh.position.y + halfExtents.y, mesh.position.z),
    angularDamping: 0.3,
    linearDamping: 0.05,
  });
  body.quaternion.setFromEuler(0, mesh.rotation.y, 0);
  body.applyImpulse(new CANNON.Vec3(impulse.x, impulse.y, impulse.z), new CANNON.Vec3(0, halfExtents.y * 0.6, 0));
  world.addBody(body);
  // Pivot at the body's centre so the feet-origin model tumbles around its middle.
  const pivot = new THREE.Group();
  pivot.position.copy(body.position);
  mesh.parent.remove(mesh);
  mesh.position.set(0, -halfExtents.y, 0);
  mesh.rotation.set(0, 0, 0);
  pivot.add(mesh);
  scene.add(pivot);
  corpses.push({ body, mesh: pivot, life: CORPSE_LIFE, offsetY: 0, scale: 1, onRemove });
}

// Bursts a crate/barrel into `count` physics cubes.
export function spawnDebris(scene, pos, color, count = 8, size = 0.35, power = 6) {
  for (let i = 0; i < count; i++) {
    if (debris.length >= MAX_DEBRIS) removeEntry(debris, 0, scene);
    const s = size * (0.6 + Math.random() * 0.6);
    const mesh = new THREE.Mesh(debrisGeo, debrisMaterial(color));
    mesh.scale.setScalar(s);
    scene.add(mesh);
    const body = new CANNON.Body({
      mass: 0.3,
      shape: new CANNON.Box(new CANNON.Vec3(s / 2, s / 2, s / 2)),
      position: new CANNON.Vec3(pos.x + (Math.random() - 0.5), pos.y + 0.5 + Math.random() * 0.6, pos.z + (Math.random() - 0.5)),
    });
    body.velocity.set((Math.random() - 0.5) * power, 3 + Math.random() * power, (Math.random() - 0.5) * power - 2);
    body.angularVelocity.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    world.addBody(body);
    debris.push({ body, mesh, life: DEBRIS_LIFE, offsetY: 0, scale: s });
  }
}

function syncList(list, dt, scene) {
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    e.life -= dt;
    if (e.life <= 0) { removeEntry(list, i, scene); continue; }
    e.mesh.position.set(e.body.position.x, e.body.position.y - e.offsetY, e.body.position.z);
    e.mesh.quaternion.set(e.body.quaternion.x, e.body.quaternion.y, e.body.quaternion.z, e.body.quaternion.w);
    if (e.life < 0.3) e.mesh.scale.setScalar(e.scale * (e.life / 0.3));
  }
}

export function stepPhysics(dt, scene) {
  accumulator += dt;
  let steps = 0;
  while (accumulator >= STEP && steps < 4) {
    world.step(STEP);
    accumulator -= STEP;
    steps++;
  }
  if (steps === 4) accumulator = 0;
  syncList(corpses, dt, scene);
  syncList(debris, dt, scene);
}

export function clearPhysics(scene) {
  while (corpses.length) removeEntry(corpses, corpses.length - 1, scene);
  while (debris.length) removeEntry(debris, debris.length - 1, scene);
}

export function physicsStats() {
  let moving = 0;
  for (const e of corpses.concat(debris)) if (e.body.velocity.length() > 0.5) moving++;
  return { corpses: corpses.length, debris: debris.length, moving };
}
