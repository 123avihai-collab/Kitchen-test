import * as THREE from 'three';
import { box, cyl } from './util.js';
import { islandPosZ } from './room.js';
import * as A from './appliances.js';

// פריטים חופשיים על הרצפה (כיסאות, שולחן, עציץ) – ניתנים לגרירה במצב עריכה
// x,z במטרים (עולם), rot במעלות סביב ציר אנכי
export const ITEM_TYPES = {
  stool: { label: 'כיסא בר', half: [0.22, 0.22], collide: 'body' },
  chair: { label: 'כיסא אוכל', half: [0.24, 0.26], collide: 'body' },
  table: { label: 'שולחן אוכל 160×90', half: [0.8, 0.45], collide: 'full' },
  plant: { label: 'עציץ גדול', half: [0.22, 0.22], collide: 'full' },
};

// שורת כיסאות בר מאחורי האי
export function stoolRow(state, n) {
  const L = state.islandModules.reduce((a, m) => a + m.w, 0);
  const z = islandPosZ(state) + 0.02 + state.island.overhang + 0.1;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `it${Date.now().toString(36)}${i}`, type: 'stool', x: (state.island.offsetX || 0) + L / 2 - L * (i + 0.5) / n, z, rot: 180 });
  }
  return out;
}

/** תיבת חסימה של פריט בעולם (xz) לפי מיקום וסיבוב */
export function itemExtents(it, x = it.x, z = it.z, rot = it.rot) {
  const [hx, hz] = ITEM_TYPES[it.type]?.half || [0.2, 0.2];
  const r = THREE.MathUtils.degToRad(rot || 0), c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  const ex = hx * c + hz * s, ez = hx * s + hz * c;
  return { x0: x - ex, x1: x + ex, z0: z - ez, z1: z + ez, ex, ez };
}

function chair(lib) {
  const g = new THREE.Group();
  const blk = lib.metal('black'), wood = lib.wood, leather = lib.leather();
  g.add(box(0.44, 0.05, 0.44, leather, 0, 0.46, 0, { round: 0.02 }));
  g.add(box(0.42, 0.3, 0.025, wood, 0, 0.72, -0.2, { round: 0.008 }));
  for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
    const l = cyl(0.012, 0.01, 0.44, blk, 10); l.position.set(x, 0.22, z); g.add(l);
  }
  for (const x of [-0.19, 0.19]) { const p = cyl(0.01, 0.01, 0.4, blk, 8); p.position.set(x, 0.66, -0.2); g.add(p); }
  return g;
}
function table(lib) {
  const g = new THREE.Group();
  const top = box(1.6, 0.04, 0.9, lib.front('walnut', '#f3dcc2'), 0, 0.74, 0, { round: 0.008 }); g.add(top);
  const blk = lib.metal('black');
  for (const x of [-0.68, 0.68]) {
    g.add(box(0.05, 0.7, 0.05, blk, x, 0.36, -0.36, { uv: false })); g.add(box(0.05, 0.7, 0.05, blk, x, 0.36, 0.36, { uv: false }));
    g.add(box(0.04, 0.04, 0.76, blk, x, 0.69, 0, { uv: false }));
  }
  return g;
}
function plant(lib) {
  const g = new THREE.Group();
  const pot = A.jar(lib, 0.2, 0.42, true); g.add(pot);
  const leafMat = lib.plant;
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4, h = 0.6 + (i % 7) * 0.12, r = 0.05 + (i % 5) * 0.05;
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.11, 10), leafMat); leaf.scale.set(0.45, 1, 1);
    leaf.position.set(Math.cos(a) * r, 0.42 + h * 0.6, Math.sin(a) * r);
    leaf.rotation.set(-0.6 + (i % 3) * 0.3, a, 0.4); leaf.castShadow = true; g.add(leaf);
  }
  const stem = cyl(0.012, 0.016, 0.6, lib.get('stem2', () => new THREE.MeshStandardMaterial({ color: '#4a3b2a', roughness: 0.9 })), 8); stem.position.y = 0.7; g.add(stem);
  return g;
}

export function buildItems(state, lib) {
  const g = new THREE.Group(); g.name = 'items';
  for (const it of state.items || []) {
    let o;
    if (it.type === 'stool') o = A.stool(lib, state.dims.counterH - 0.25);
    else if (it.type === 'chair') o = chair(lib);
    else if (it.type === 'table') o = table(lib);
    else if (it.type === 'plant') o = plant(lib);
    else continue;
    const w = new THREE.Group(); w.add(o);
    w.position.set(it.x, 0, it.z); w.rotation.y = THREE.MathUtils.degToRad(it.rot || 0);
    w.userData.select = { id: it.id, part: 'item', zone: 'items' };
    w.userData.drag = { kind: 'item', id: it.id };
    g.add(w);
  }
  return g;
}
