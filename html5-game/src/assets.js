// Loads the CC0 Kenney models (see ../CREDITS.md) and hands out animated clones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const MODELS = {
  soldierA: 'mini/character-male-a', soldierB: 'mini/character-male-b', soldierC: 'mini/character-male-c',
  soldierD: 'mini/character-female-a', soldierE: 'mini/character-female-b',
  zombie: 'graveyard/character-zombie', skeleton: 'graveyard/character-skeleton',
  vampire: 'graveyard/character-vampire', ghost: 'graveyard/character-ghost', keeper: 'graveyard/character-keeper',
  gunPistol: 'blaster/blaster-a', gunSmg: 'blaster/blaster-d', gunRifle: 'blaster/blaster-g', gunGatling: 'blaster/blaster-p',
  crate: 'blaster/crate-medium', barrel: 'survival/barrel', box: 'survival/box-large',
  road: 'roads/road-straight', lamp: 'roads/light-square', barrier: 'roads/construction-barrier', cone: 'roads/construction-cone',
  pine: 'graveyard/pine', pineCrooked: 'graveyard/pine-crooked', rocks: 'graveyard/rocks', rocksTall: 'graveyard/rocks-tall',
  grave: 'graveyard/gravestone-round', graveCross: 'graveyard/gravestone-cross', fence: 'graveyard/fence',
  lightpost: 'graveyard/lightpost-single', pumpkin: 'graveyard/pumpkin', hay: 'graveyard/hay-bale',
  tree: 'survival/tree', treeTall: 'survival/tree-tall', rock: 'survival/rock-a',
};

const loaded = {};

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  const names = Object.keys(MODELS);
  let done = 0;
  await Promise.all(names.map(async (key) => {
    const gltf = await loader.loadAsync(`assets/models/${MODELS[key]}.glb`);
    gltf.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = !o.isSkinnedMesh; });
    loaded[key] = { scene: gltf.scene, clips: gltf.animations, skinned: hasSkin(gltf.scene) };
    done++;
    if (onProgress) onProgress(done / names.length);
  }));
}

function hasSkin(root) {
  let s = false;
  root.traverse((o) => { if (o.isSkinnedMesh) s = true; });
  return s;
}

// Static (non-animated) clone sharing geometry and materials.
export function cloneStatic(key, scale = 1) {
  const src = loaded[key];
  const obj = src.scene.clone(true);
  obj.scale.setScalar(scale);
  return obj;
}

// Animated clone: returns { root, mixer, play(name, opts) }.
export function cloneAnimated(key, scale = 1) {
  const src = loaded[key];
  const root = src.skinned ? SkeletonUtils.clone(src.scene) : src.scene.clone(true);
  root.scale.setScalar(scale);
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  let current = null;
  function play(name, { loop = true, fade = 0.15, timeScale = 1 } = {}) {
    if (current && current.name === name) return current.action;
    let action = actions[name];
    if (!action) {
      const clip = THREE.AnimationClip.findByName(src.clips, name);
      if (!clip) return null;
      action = mixer.clipAction(clip);
      actions[name] = action;
    }
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.timeScale = timeScale;
    action.play();
    if (current) current.action.crossFadeTo(action, fade, false);
    current = { name, action };
    return action;
  }
  return { root, mixer, play };
}

// Tints every mesh under root with its own material copy (used for gold / boss variants).
export function tint(root, color, emissive = 0x000000) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.color = new THREE.Color(color);
    if (o.material.emissive) o.material.emissive = new THREE.Color(emissive);
  });
}

export function modelSize(key) {
  return new THREE.Box3().setFromObject(loaded[key].scene).getSize(new THREE.Vector3());
}
