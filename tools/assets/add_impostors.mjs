// Add a 3-quad impostor node "<Name>_Imp" per building (front, -X side, +X side) using the baked atlases.
// usage: node add_impostors.mjs <in.glb> <impDir> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import fs from 'node:fs';
import path from 'node:path';
const [inp, dir, out] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(inp);
const root = doc.getRoot(), buf = root.listBuffers()[0], scene = root.listScenes()[0];
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json')));
for (const [name, m] of Object.entries(meta)) {
  const [x0, y0, z0] = m.min, [x1, y1] = m.max, zf = m.zFront, u = m.u;
  const P = [], N = [], T = [], I = [];
  const quad = (corners, n, ua, ub) => { // corners: bottom-left, bottom-right, top-right, top-left as seen from outside
    const b = P.length / 3;
    corners.forEach((c) => P.push(...c));
    for (let i = 0; i < 4; i++) N.push(...n);
    T.push(ua, 1, ub, 1, ub, 0, ua, 0);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad([[x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf]], [0, 0, 1], u[0], u[1]); // front, u grows with x
  quad([[x0, y0, z0], [x0, y0, zf], [x0, y1, zf], [x0, y1, z0]], [-1, 0, 0], u[1], u[2]); // -X side, u grows with z
  quad([[x1, y0, zf], [x1, y0, z0], [x1, y1, z0], [x1, y1, zf]], [1, 0, 0], u[2], u[3]); // +X side, u grows as z falls
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const tex = doc.createTexture(name + '_Imp').setImage(new Uint8Array(fs.readFileSync(path.join(dir, name + '_atlas.png')))).setMimeType('image/png').setURI(name + '_Imp.png');
  const mat = doc.createMaterial(name + '_Imp').setBaseColorTexture(tex).setMetallicFactor(0).setRoughnessFactor(1).setAlphaMode('MASK').setAlphaCutoff(0.5);
  const prim = doc.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', new Uint16Array(I)))
    .setAttribute('POSITION', acc('VEC3', new Float32Array(P))).setAttribute('NORMAL', acc('VEC3', new Float32Array(N))).setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(T)));
  scene.addChild(doc.createNode(name + '_Imp').setMesh(doc.createMesh(name + '_Imp').addPrimitive(prim)));
}
await io.write(out, doc);
console.log('wrote', out, fs.statSync(out).size);
