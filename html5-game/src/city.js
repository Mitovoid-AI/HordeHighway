// Downtown street, buildings and sidewalk props (CC0 Quaternius Downtown City MegaKit, see ../CREDITS.md).
// Everything is drawn with one BatchedMesh per material: each model's geometry is stored once,
// every placement is an instance, and instances are frustum-culled one by one.
import * as THREE from 'three';
import { getNode } from './assets.js';

const S = 10 / 12; // the kit's street asphalt is 12 m wide; the game road is 10 m
const SIDEWALK = 3 * S;
const LIFT = 0.15 * S; // kit asphalt sits at y = -0.15; the game runs at y = 0
const BUILDINGS = ['Building_Small_1', 'Building_Medium_2_001', 'Building_Large_2'];
// Beyond this distance from the camera a building is drawn as its baked "<name>_Imp" impostor
// (3 textured quads) instead of ~10-20k triangles.
const LOD_DIST = 55;
let lodItems = [];

const boundsCache = {};
function bounds(name) {
  if (!boundsCache[name]) boundsCache[name] = new THREE.Box3().setFromObject(getNode('city', name));
  return boundsCache[name];
}

// sunSide: sign of the sun's X. Only buildings on that side can shadow the street, so only they cast.
export function buildCity(group, roadHalf, zStart, len, rng, sunSide) {
  const placements = [];
  lodItems = [];
  const q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(S, S, S), up = new THREE.Vector3(0, 1, 0);
  const place = (name, x, y, z, rotY, lod = null, cast = true) => {
    placements.push([name, new THREE.Matrix4().compose(p.set(x, y, z), q.setFromAxisAngle(up, rotY), sc), lod, cast]);
  };

  // Street tiles run along the model's X; turn them to run along Z.
  const tileLen = 6 * S;
  for (let z = zStart; z > zStart - len; z -= tileLen) place('Street_4Lane', 0, LIFT, z - tileLen / 2, Math.PI / 2, null, false);

  // Building fronts are at model z = 0; turn them to face the road from behind the sidewalk.
  const front = roadHalf + SIDEWALK;
  for (const side of [-1, 1]) {
    let cursor = zStart;
    while (cursor > zStart - len) {
      const name = BUILDINGS[Math.floor(rng() * BUILDINGS.length)];
      const b = bounds(name);
      let z;
      if (side < 0) { z = cursor + b.min.x * S; cursor = z - b.max.x * S; } // rotY +90°: model x -> world -z
      else { z = cursor - b.max.x * S; cursor = z + b.min.x * S; } // rotY -90°: model x -> world +z
      const item = { z, near: [], far: [], isNear: null };
      lodItems.push(item);
      place(name, side * front, LIFT, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, { item, far: false }, side === sunSide);
      place(name + '_Imp', side * front, LIFT, z, side < 0 ? Math.PI / 2 : -Math.PI / 2, { item, far: true }, false);
      cursor -= 0.6 + rng() * 2.5; // alley
    }
  }

  // Sidewalk props.
  for (let z = zStart - 15; z > zStart - len; z -= 30) {
    for (const side of [-1, 1]) {
      place('Sidewalk_Planter', side * (roadHalf + SIDEWALK * 0.55), LIFT, z + side * 4, 0);
      for (let i = 0; i < 3; i++) place('Prop_Bollard', side * (roadHalf + 0.35), LIFT, z - 6 - i * 1.4, 0);
    }
  }
  for (let z = zStart - 10; z > zStart - len; z -= 22 + rng() * 10) {
    place('Prop_ManholeCover', (rng() - 0.5) * roadHalf * 1.4, 0.02, z, rng() * Math.PI);
  }

  // One BatchedMesh per material (and per shadow-casting flag).
  const byMat = new Map();
  for (const [name, m, lod, cast] of placements) {
    const node = getNode('city', name);
    node.updateWorldMatrix(true, true);
    node.traverse((o) => {
      if (!o.isMesh) return;
      const key = o.material.uuid + (cast ? '+cast' : '');
      let e = byMat.get(key);
      if (!e) byMat.set(key, (e = { material: o.material, cast, geos: new Map(), list: [] }));
      e.geos.set(o.geometry, -1);
      e.list.push([o.geometry, new THREE.Matrix4().multiplyMatrices(m, o.matrixWorld), lod]);
    });
  }
  byMat.forEach((e) => {
    const material = e.material;
    let verts = 0, idx = 0;
    e.geos.forEach((_, g) => { verts += g.attributes.position.count; idx += g.index ? g.index.count : 0; });
    const bm = new THREE.BatchedMesh(e.list.length, verts, idx, material);
    e.geos.forEach((_, g) => e.geos.set(g, bm.addGeometry(g)));
    for (const [g, m, lod] of e.list) {
      const id = bm.addInstance(e.geos.get(g));
      bm.setMatrixAt(id, m);
      if (lod) lod.item[lod.far ? 'far' : 'near'].push([bm, id]);
    }
    bm.castShadow = e.cast && !material.transparent;
    bm.receiveShadow = true;
    group.add(bm);
  });
}

// Swap buildings between full detail and impostor by distance from the camera.
export function updateCityLod(cameraZ) {
  for (const it of lodItems) {
    const ahead = cameraZ - it.z; // the camera looks toward -Z; buildings behind it only cast shadows
    const near = ahead > -8 && ahead < LOD_DIST;
    if (near === it.isNear) continue;
    it.isNear = near;
    for (const [bm, id] of it.near) bm.setVisibleAt(id, near);
    for (const [bm, id] of it.far) bm.setVisibleAt(id, !near);
  }
}
