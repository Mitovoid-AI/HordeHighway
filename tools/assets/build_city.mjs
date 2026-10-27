// Merge chosen Downtown City MegaKit models into one GLB with shared, downscaled textures.
// usage: node build_city.mjs <gltfDir> <texDir> <out.glb> <ratio> Name[:simplify] ...
import { NodeIO } from '@gltf-transform/core';
import { mergeDocuments, dedup, prune, weld, simplifyPrimitive, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const [gltfDir, texDir, out, ratioArg, ...names] = process.argv.slice(2);
const ratio = Number(ratioArg);
const io = new NodeIO();
await MeshoptSimplifier.ready;

async function readNamed(n) {
  const d = await io.read(path.join(gltfDir, n + '.gltf'));
  const roots = d.getRoot().listScenes()[0].listChildren();
  if (roots.length !== 1) throw new Error(n + ': expected one root node');
  roots[0].setName(n); // node names can differ from file names (e.g. "Building_Medium_2.001")
  return d;
}
const doc = await readNamed(names[0].split(':')[0]);
for (const n of names.slice(1)) mergeDocuments(doc, await readNamed(n.split(':')[0]));
const root = doc.getRoot();

// One scene; each model's root node is named after the model.
const scene = root.listScenes()[0];
for (const s of root.listScenes().slice(1)) { for (const c of s.listChildren()) scene.addChild(c); s.dispose(); }
root.setDefaultScene(scene);

// Drop vertex colours (wear masks for the kit's custom shader: they tint the base colour red)
// and unused UV sets. Only TEXCOORD_0 is referenced by any material.
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives())
  for (const sem of ['COLOR_0', 'COLOR_1', 'TEXCOORD_1', 'TEXCOORD_2']) { const a = prim.getAttribute(sem); if (a) prim.setAttribute(sem, null); }

// Swap in the downscaled textures.
for (const t of root.listTextures()) {
  const base = path.basename(t.getURI()).replace(/\.png$/, '');
  const file = fs.existsSync(path.join(texDir, base + '.jpg')) ? base + '.jpg' : base + '.png';
  t.setImage(new Uint8Array(fs.readFileSync(path.join(texDir, file))));
  t.setMimeType(file.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
  t.setURI(file);
}

await doc.transform(dedup(), prune(), unpartition());
await doc.transform(weld());
// Simplify only the nodes marked ":s" (buildings); props and street stay as authored.
const simplifyNames = new Set(names.filter((n) => n.endsWith(':s')).map((n) => n.split(':')[0]));
for (const node of scene.listChildren()) {
  if (!simplifyNames.has(node.getName())) continue;
  for (const prim of node.getMesh().listPrimitives())
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: Number(process.env.ERR || 0.004), lockBorder: process.env.LOCK !== '0' });
}
await doc.transform(prune());

let tris = 0;
for (const node of scene.listChildren()) {
  let t = 0;
  for (const p of node.getMesh().listPrimitives()) t += p.getIndices().getCount() / 3;
  tris += t;
  console.log(node.getName(), t);
}
console.log('total tris', tris, 'textures', root.listTextures().length, 'materials', root.listMaterials().length);
await io.write(out, doc);
console.log('wrote', out, fs.statSync(out).size);
