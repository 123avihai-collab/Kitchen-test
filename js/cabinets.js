import * as THREE from 'three';
import { box, cyl, roundRectShape, roundRectPath, boxUV, cm } from './util.js';
import { isTall } from './state.js';
import { islandPosZ, islandCenterZ } from './room.js';
import * as A from './appliances.js';
import { buildItems } from './items.js';

// בניית המטבח: ארונות תחתונים, עליונים, טורים גבוהים, משטחי עבודה, חיפוי, תאורת LED, האי והכיסאות
const FT = 0.019;   // עובי חזית
const GAP = 0.003;  // מרווח בין חזיתות
const BT = 0.018;   // עובי לוח גוף
const DEG = THREE.MathUtils.degToRad;

export const TYPE_LABELS = {
  doors: 'דלתות', drawers: 'מגירות', open: 'מדף פתוח', dishwasher: 'מדיח כלים', hob: 'כיריים + מגירות',
  sink: 'כיור + דלתות', fridge: 'מקרר בנישה', oven: 'טור תנור + מיקרוגל', pantry: 'טור מזווה',
};
export const UPPER_LABELS = { doors: 'דלתות', lift: 'דלת מתרוממת', open: 'מדף פתוח', hood: 'קולט אדים מוסתר', none: 'ללא' };

export function buildKitchen(state, lib) {
  const root = new THREE.Group(); root.name = 'kitchen';
  const d = state.dims, s = state;
  const K = {
    s, lib, d, frontZ: d.baseDepth + 0.001 + FT, ox: 0,
    dims: [], colliders: [], ledRuns: [], lights: [],
  };
  const W = s.room.width;

  // ---------- קיר המטבח ----------
  const wallG = new THREE.Group(); wallG.name = 'wall-run'; root.add(wallG);
  let x = -W / 2;
  const runs = []; let cur = null; const uppers = [];
  const placed = [];
  for (const m of s.wall) {
    const w = m.w, xc = x + w / 2;
    K.ox = xc;
    const g = isTall(m) ? tallModule(K, m, w) : baseModule(K, m, w);
    g.position.x = xc; g.userData.select = { id: m.id, part: 'base', zone: 'wall' };
    wallG.add(g);
    placed.push({ m, x0: x, x1: x + w });
    if (!isTall(m)) {
      if (!cur) { cur = { x0: x, x1: x + w, mods: [] }; runs.push(cur); }
      cur.x1 = x + w; cur.mods.push({ m, x0: x, x1: x + w });
      const u = m.upper || { type: 'none' };
      if (u.type !== 'none') {
        K.ox = xc;
        const ug = upperModule(K, m, u, w); ug.position.x = xc;
        ug.userData.select = { id: m.id, part: 'upper', zone: 'wall' };
        wallG.add(ug); uppers.push({ x0: x, x1: x + w });
      }
    } else cur = null;
    K.dims.push({ a: new THREE.Vector3(x, 0.004, 0), b: new THREE.Vector3(x + w, 0.004, 0), label: cm(w), kind: 'mod' });
    x += w;
  }
  // מילוי אם סכום המודולים קטן מאורך הקיר
  const rest = W / 2 - x;
  if (rest > 0.005) {
    const last = s.wall[s.wall.length - 1];
    const fm = lib.front(last?.mat || 'lacquer', last?.color || '#d3bf9f');
    wallG.add(box(rest, s.room.height - 0.003, 0.02, fm, x + rest / 2, s.room.height / 2, d.baseDepth + 0.01));
  }
  K.wallOverflow = x - W / 2;

  // משטחי עבודה וחיפוי על כל רצף ארונות תחתונים
  const cTop = d.counterH, cT = d.counterT, cDepth = d.baseDepth + 0.04;
  const counterMat = lib.stone(s.style.counter);
  const bsMat = lib.backsplash(s.style.backsplash, s.style.counter);
  for (const r of runs) {
    const len = r.x1 - r.x0, cx = (r.x0 + r.x1) / 2;
    const top = box(len, cT, cDepth, counterMat, cx, cTop - cT / 2, cDepth / 2, { round: 0.003 });
    top.name = 'countertop'; wallG.add(top);
    if (bsMat) {
      const bh = d.upperGap;
      const bs = box(len, bh, 0.012, bsMat, cx, cTop + bh / 2, 0.006, { cast: false });
      wallG.add(bs);
    }
  }
  // תאורת LED מתחת לעליונים – פס זוהר + RectAreaLight לכל רצף
  if (s.style.led) {
    uppers.sort((a, b) => a.x0 - b.x0);
    const merged = [];
    for (const u of uppers) { const l = merged[merged.length - 1]; if (l && Math.abs(l.x1 - u.x0) < 0.01) l.x1 = u.x1; else merged.push({ ...u }); }
    const yb = cTop + d.upperGap;
    for (const r of merged) {
      const len = r.x1 - r.x0, cx = (r.x0 + r.x1) / 2;
      wallG.add(box(len - 0.04, 0.005, 0.012, lib.led, cx, yb - 0.004, d.upperDepth - 0.045, { cast: false, uv: false }));
      const ra = new THREE.RectAreaLight('#ffc98a', s.style.lighting === 'evening' ? 9 : 5, len - 0.04, 0.05);
      ra.position.set(cx, yb - 0.01, d.upperDepth - 0.06);
      ra.lookAt(cx, 0, d.upperDepth - 0.02);
      wallG.add(ra); K.lights.push(ra);
    }
  }
  // אביזרים על המשטח
  decorWall(K, wallG, runs, placed);

  K.colliders.push(new THREE.Box3(new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, 3, d.baseDepth + 0.12)));

  // ---------- האי ----------
  const isl = buildIsland(K);
  root.add(isl);
  const items = buildItems(s, lib); root.add(items);
  for (const p of K.extra || []) root.add(p);
  return { group: root, K };
}

// ===== גוף ארון (קרקס) =====
function carcass(K, w, h, depth, y0, z0 = 0, mat = null, shelves = 0, noTop = false) {
  const g = new THREE.Group();
  const cm_ = mat || K.lib.carcass;
  g.add(box(BT, h, depth, cm_, -w / 2 + BT / 2, y0 + h / 2, z0 + depth / 2, { uvOff: { x: K.ox } }));
  g.add(box(BT, h, depth, cm_, w / 2 - BT / 2, y0 + h / 2, z0 + depth / 2, { uvOff: { x: K.ox } }));
  g.add(box(w - 2 * BT, BT, depth, cm_, 0, y0 + BT / 2, z0 + depth / 2, { uvOff: { x: K.ox } }));
  if (!noTop) g.add(box(w - 2 * BT, BT, depth, cm_, 0, y0 + h - BT / 2, z0 + depth / 2, { uvOff: { x: K.ox } }));
  else for (const zz of [0.05, depth - 0.05]) g.add(box(w - 2 * BT, BT, 0.08, cm_, 0, y0 + h - BT / 2 - 0.25, z0 + zz, { uvOff: { x: K.ox } }));
  g.add(box(w - 2 * BT, h - 2 * BT, 0.008, cm_, 0, y0 + h / 2, z0 + 0.004, { cast: false, uvOff: { x: K.ox } }));
  for (let i = 1; i <= shelves; i++) {
    g.add(box(w - 2 * BT - 0.002, BT, depth - 0.04, cm_, 0, y0 + h * i / (shelves + 1), z0 + depth / 2 - 0.01, { uvOff: { x: K.ox } }));
  }
  return g;
}

function door(K, o) {
  const { x0, x1, y0, y1, mat, hinge = 'left', hpos = 'top', z = K.frontZ - FT } = o;
  const w = x1 - x0 - GAP, h = y1 - y0 - GAP;
  const pivot = new THREE.Group(); pivot.name = 'door';
  const px = hinge === 'left' ? x0 + GAP / 2 : x1 - GAP / 2;
  pivot.position.set(px, 0, z + FT); // ציר בפינה הקדמית – הדלת לא נכנסת בשכנה
  const cx = hinge === 'left' ? w / 2 : -w / 2;
  pivot.add(box(w, h, FT, mat, cx, y0 + GAP / 2 + h / 2, -FT / 2, { round: 0.0015, uvOff: { x: K.ox + px, z } }));
  if (o.handle !== false) {
    const len = Math.min(o.hlen || 0.2, h * 0.6);
    const hd = A.handle(K.lib, len, true, K.s.style.handle);
    const hx = cx + (hinge === 'left' ? 1 : -1) * (w / 2 - 0.035);
    const hy = hpos === 'top' ? y1 - 0.05 - len / 2 : hpos === 'bottom' ? y0 + 0.05 + len / 2 : (y0 + y1) / 2;
    hd.position.set(hx, hy, 0); pivot.add(hd);
  }
  A.openable(pivot, 'rot', 'y', (hinge === 'left' ? -1 : 1) * DEG(o.angle || 100), { label: 'דלת' });
  return pivot;
}

function flap(K, o) {
  // דלת מתרוממת (ציר עליון)
  const { x0, x1, y0, y1, mat, z = K.frontZ - FT } = o;
  const w = x1 - x0 - GAP, h = y1 - y0 - GAP;
  const pivot = new THREE.Group(); pivot.name = 'flap'; pivot.position.set(0, y1 - GAP / 2, z + FT);
  pivot.add(box(w, h, FT, mat, (x0 + x1) / 2, -h / 2, -FT / 2, { round: 0.0015, uvOff: { x: K.ox, y: y1, z } }));
  const len = Math.min(0.4, w * 0.5);
  const hd = A.handle(K.lib, len, false, K.s.style.handle); hd.position.set((x0 + x1) / 2, -h + 0.045, 0); pivot.add(hd);
  A.openable(pivot, 'rot', 'x', -DEG(o.angle || 95), { label: 'דלת מתרוממת' });
  return pivot;
}

function drawer(K, o) {
  const { x0, x1, y0, y1, mat, depth = K.d.baseDepth - 0.06, z = K.frontZ - FT } = o;
  const w = x1 - x0 - GAP, h = y1 - y0 - GAP, cx = (x0 + x1) / 2;
  const pivot = new THREE.Group(); pivot.name = 'drawer';
  pivot.add(box(w, h, FT, mat, cx, y0 + GAP / 2 + h / 2, z + FT / 2, { round: 0.0015, uvOff: { x: K.ox } }));
  // ארגז מגירה – דפנות מתכת אנטרציט
  const bw = x1 - x0 - 2 * BT - 0.026, bh = Math.max(0.06, Math.min(h - 0.05, 0.2)), by = y0 + 0.02;
  const bd = depth - 0.03, bz = z - bd / 2 - 0.004;
  const dm = K.lib.carcassDark;
  pivot.add(box(0.012, bh, bd, dm, cx - bw / 2, by + bh / 2, bz, { uv: false, cast: false }));
  pivot.add(box(0.012, bh, bd, dm, cx + bw / 2, by + bh / 2, bz, { uv: false, cast: false }));
  pivot.add(box(bw, bh, 0.012, dm, cx, by + bh / 2, bz - bd / 2, { uv: false, cast: false }));
  pivot.add(box(bw, 0.012, bd, K.lib.carcass, cx, by + 0.006, bz, { cast: false }));
  pivot.add(box(bw - 0.01, 0.003, bd - 0.01, K.lib.antiSlip, cx, by + 0.0135, bz, { cast: false, uv: false }));
  if (o.content) o.content(pivot, cx, by + 0.015, bz, bw, bd);
  const len = Math.max(0.14, Math.min(0.5, w * 0.5));
  const hd = A.handle(K.lib, len, false, K.s.style.handle);
  hd.position.set(cx, y1 - 0.045, z + FT); pivot.add(hd);
  A.openable(pivot, 'slide', 'z', depth * 0.78, { label: 'מגירה' });
  return pivot;
}

function drawerStack(K, g, w, y0, y1, mat, ratios = [0.22, 0.39, 0.39]) {
  const H = y1 - y0; let y = y1;
  ratios.forEach((r, i) => {
    const yb = i === ratios.length - 1 ? y0 : y - H * r;
    const content = i === 0 ? cutlery(K) : null;
    g.add(drawer(K, { x0: -w / 2, x1: w / 2, y0: yb, y1: y, mat, content }));
    y = yb;
  });
}

function cutlery(K) {
  return (p, cx, y, z, bw, bd) => {
    const tray = K.lib.get('tray', () => new THREE.MeshStandardMaterial({ color: '#d8d2c8', roughness: 0.7 }));
    const n = Math.max(2, Math.floor(bw / 0.11));
    for (let i = 0; i < n; i++) p.add(box(bw / n - 0.01, 0.04, bd * 0.6, tray, cx - bw / 2 + (i + 0.5) * bw / n, y + 0.02, z + bd * 0.15, { cast: false, uv: false }));
    const steel = K.lib.metal('steel');
    for (let i = 0; i < n * 3; i++) p.add(box(0.012, 0.004, 0.19, steel, cx - bw / 2 + (Math.floor(i / 3) + 0.3 + (i % 3) * 0.2) * bw / n, y + 0.025, z + bd * 0.15, { cast: false, uv: false }));
  };
}

// ===== ארון תחתון =====
function baseModule(K, m, w) {
  const { d, lib } = K; const g = new THREE.Group(); g.name = `base-${m.type}`;
  const D = d.baseDepth, P = d.plinth, topY = d.counterH - d.counterT;
  const mat = lib.front(m.mat || 'lacquer', m.color || '#d3bf9f');
  g.add(box(w, P - 0.002, 0.018, lib.plinth, 0, (P - 0.002) / 2, D - 0.05, { uv: false }));
  const bh = topY - P;
  if (m.type === 'dishwasher') {
    g.add(A.dishwasher(K, w, P, topY, mat));
    return g;
  }
  if (m.type === 'open') {
    g.add(carcass(K, w, bh, D + FT, P, 0, mat, 1));
    const pl = A.plates(lib, 5); pl.position.set(-w * 0.2, P + bh / 2 + BT / 2, D * 0.55); g.add(pl);
    const j = A.jar(lib, 0.06, 0.16, true); j.position.set(w * 0.22, P + BT, D * 0.55); g.add(j);
    return g;
  }
  g.add(carcass(K, w, bh, D, P, 0, null, m.type === 'doors' ? 1 : 0, m.type === 'sink'));
  if (m.type === 'drawers' || m.type === 'hob') drawerStack(K, g, w, P, topY, mat);
  else if (m.type === 'doors' || m.type === 'sink') {
    if (w > 0.62) {
      g.add(door(K, { x0: -w / 2, x1: 0, y0: P, y1: topY, mat, hinge: 'left' }));
      g.add(door(K, { x0: 0, x1: w / 2, y0: P, y1: topY, mat, hinge: 'right' }));
    } else g.add(door(K, { x0: -w / 2, x1: w / 2, y0: P, y1: topY, mat, hinge: m.hinge || 'left' }));
  }
  if (m.type === 'hob') g.add(A.hob(K, (D + 0.04) / 2 + 0.01, d.counterH));
  return g;
}

// ===== ארון עליון =====
function upperModule(K, m, u, w) {
  const { d, lib } = K; const g = new THREE.Group(); g.name = `upper-${u.type}`;
  const y0 = d.counterH + d.upperGap, h = d.upperH, UD = d.upperDepth;
  const mat = lib.front(u.mat || 'lacquer', u.color || '#d3bf9f');
  const z = UD + 0.001;
  if (u.type === 'open') {
    g.add(carcass(K, w, h, UD + FT, y0, 0, mat, 1));
    const pl = A.plates(lib, 6); pl.position.set(-w * 0.2, y0 + BT, UD * 0.5); g.add(pl);
    const j1 = A.jar(lib, 0.05, 0.18, false); j1.position.set(w * 0.18, y0 + h / 2 + BT / 2, UD * 0.5); g.add(j1);
    const j2 = A.jar(lib, 0.04, 0.12, true); j2.position.set(-w * 0.15, y0 + h / 2 + BT / 2, UD * 0.5); g.add(j2);
    return g;
  }
  g.add(carcass(K, w, h, UD, y0, 0, null, u.type === 'hood' ? 1 : 2));
  if (u.type === 'hood') {
    const vh = 0.04;
    g.add(A.hoodVisor(K, w, y0, UD + FT));
    const top0 = y0 + vh + 0.002;
    if (w > 0.62) {
      g.add(door(K, { x0: -w / 2, x1: 0, y0: top0, y1: y0 + h, mat, hinge: 'left', hpos: 'bottom', z }));
      g.add(door(K, { x0: 0, x1: w / 2, y0: top0, y1: y0 + h, mat, hinge: 'right', hpos: 'bottom', z }));
    } else g.add(door(K, { x0: -w / 2, x1: w / 2, y0: top0, y1: y0 + h, mat, hinge: 'left', hpos: 'bottom', z }));
    return g;
  }
  if (u.type === 'lift') {
    g.add(flap(K, { x0: -w / 2, x1: w / 2, y0, y1: y0 + h, mat, z }));
  } else {
    if (w > 0.62) {
      g.add(door(K, { x0: -w / 2, x1: 0, y0, y1: y0 + h, mat, hinge: 'left', hpos: 'bottom', z }));
      g.add(door(K, { x0: 0, x1: w / 2, y0, y1: y0 + h, mat, hinge: 'right', hpos: 'bottom', z }));
    } else g.add(door(K, { x0: -w / 2, x1: w / 2, y0, y1: y0 + h, mat, hinge: m.hinge || 'left', hpos: 'bottom', z }));
  }
  // כלים על המדף
  const cups = A.plates(lib, 4); cups.position.set(0, y0 + h / 3 + BT / 2, UD * 0.45); cups.scale.setScalar(0.8); g.add(cups);
  return g;
}

// ===== טורים גבוהים =====
function tallModule(K, m, w) {
  const { d, lib, s } = K; const g = new THREE.Group(); g.name = `tall-${m.type}`;
  const H = Math.min(s.room.height, m.h || s.room.height);
  const D = d.baseDepth, P = d.plinth;
  const mat = lib.front(m.mat || 'walnut', m.color || '#f3dcc2');
  if (m.type === 'fridge') {
    // נישה: דפנות צד בגימור החזית + ארון עליון מעל המקרר
    const fh = 1.80;
    const depthT = D + FT;
    for (const sx of [-1, 1]) g.add(box(BT, H - 0.003, depthT, mat, sx * (w / 2 - BT / 2), (H - 0.003) / 2, depthT / 2, { uvOff: { x: K.ox } }));
    const topY0 = fh + 0.03;
    g.add(carcass(K, w - 2 * BT, H - topY0, D, topY0, 0, null, 0));
    g.add(flap(K, { x0: -w / 2 + BT, x1: w / 2 - BT, y0: topY0, y1: H - 0.003, mat }));
    g.add(A.fridge(K, w - 2 * BT - 0.012, fh, 0.72));
    return g;
  }
  g.add(box(w, P - 0.002, 0.018, lib.plinth, 0, (P - 0.002) / 2, D - 0.05, { uv: false }));
  if (m.type === 'oven') {
    const ovenY = 0.84, ovenH = 0.595, mwY = ovenY + ovenH + 0.005, mwH = 0.39, topY = mwY + mwH + 0.004;
    // גוף: תחתון (מגירות), נישת תנור, נישת מיקרוגל, עליון
    g.add(carcass(K, w, ovenY - P, D, P, 0, null, 0));
    drawerStack(K, g, w, P, ovenY, mat, [0.5, 0.5]);
    // דפנות סביב התנור והמיקרוגל
    for (const sx of [-1, 1]) g.add(box(BT, topY - ovenY, D, lib.carcass, sx * (w / 2 - BT / 2), (ovenY + topY) / 2, D / 2, { uvOff: { x: K.ox } }));
    g.add(box(w - 2 * BT, topY - ovenY, 0.008, lib.carcassDark, 0, (ovenY + topY) / 2, 0.004, { uv: false }));
    g.add(A.oven(K, w, ovenY));
    // מיקרוגל מוסתר מאחורי דלת מתרוממת
    g.add(box(w - 2 * BT, BT, D, lib.carcass, 0, mwY + BT / 2 - 0.002, D / 2));
    g.add(A.microwave(K, w, mwY + 0.02, mwH - 0.03));
    const fl = flap(K, { x0: -w / 2, x1: w / 2, y0: mwY, y1: topY, mat, angle: 92 });
    fl.userData.openable.label = 'דלת מיקרוגל';
    g.add(fl);
    g.add(carcass(K, w, H - topY, D, topY, 0, null, 1));
    g.add(door(K, { x0: -w / 2, x1: w / 2, y0: topY, y1: H - 0.003, mat, hinge: m.hinge || 'right', hpos: 'bottom' }));
    return g;
  }
  // מזווה
  const split = Math.min(H - 0.4, 2.1);
  g.add(carcass(K, w, split - P, D, P, 0, null, 4));
  g.add(carcass(K, w, H - split, D, split, 0, null, 1));
  const two = w > 0.62;
  for (const [y0, y1] of [[P, split], [split, H - 0.003]]) {
    const hpos = y0 === P ? 'mid' : 'bottom';
    if (two) { g.add(door(K, { x0: -w / 2, x1: 0, y0, y1, mat, hinge: 'left', hpos, hlen: 0.3 })); g.add(door(K, { x0: 0, x1: w / 2, y0, y1, mat, hinge: 'right', hpos, hlen: 0.3 })); }
    else g.add(door(K, { x0: -w / 2, x1: w / 2, y0, y1, mat, hinge: m.hinge || 'left', hpos, hlen: 0.3 }));
  }
  for (let i = 0; i < 4; i++) { const j = A.jar(lib, 0.05, 0.16, i % 2 === 1); j.position.set(-w / 4 + (i % 2) * w / 2, P + (split - P) * (Math.floor(i / 2) + 1) / 5 + BT / 2, D / 2); g.add(j); }
  return g;
}

function decorWall(K, g, runs, placed) {
  const { lib, d } = K;
  const hobIdx = placed.findIndex(p => p.m.type === 'hob');
  const pick = placed.find((p, i) => i > hobIdx && !isTall(p.m) && p.m.type !== 'hob') || placed.find(p => !isTall(p.m) && p.m.type !== 'hob');
  if (pick) {
    const cx = (pick.x0 + pick.x1) / 2;
    const cb = A.cuttingBoard(lib); cb.position.set(cx - 0.05, d.counterH, 0.015); g.add(cb);
    const j1 = A.jar(lib, 0.055, 0.2, false); j1.position.set(cx + 0.17, d.counterH, 0.12); g.add(j1);
    const j2 = A.jar(lib, 0.045, 0.14, true); j2.position.set(cx + 0.26, d.counterH, 0.16); g.add(j2);
  }
}

// ===== אי =====
function buildIsland(K) {
  const { s, lib, d } = K; const I = s.island;
  const g = new THREE.Group(); g.name = 'island';
  const mods = s.islandModules;
  const L = mods.reduce((a, m) => a + m.w, 0);
  const Di = I.depth, P = d.plinth, topY = d.counterH - d.counterT;
  const KI = { ...K, d: { ...d, baseDepth: Di }, frontZ: Di + 0.001 + FT, dims: K.dims };
  let x = -L / 2;
  const sinks = [];
  for (const m of mods) {
    const xc = x + m.w / 2; KI.ox = xc + 20; // היסט UV כדי שגרעין העץ לא יחזור על עצמו
    const mg = baseModule(KI, m, m.w); mg.position.x = xc;
    mg.userData.select = { id: m.id, part: 'base', zone: 'islandModules' };
    g.add(mg);
    if (m.type === 'sink') sinks.push(xc);
    x += m.w;
  }
  // גב האי (צד הישיבה) ודפנות
  const backMat = lib.front(I.backMat || 'walnut', I.backColor || '#f3dcc2');
  g.add(box(L, topY, 0.02, backMat, 0, topY / 2, -0.01, { uvOff: { x: 20 } }));
  const wf = I.waterfall ? d.counterT : 0.02;
  const zMin = -0.02 - I.overhang, zMax = Di + 0.04, depthAll = zMax - zMin;
  const counterMat = lib.stone(s.style.counter);
  if (I.waterfall) {
    for (const sx of [-1, 1]) {
      const p = box(wf, topY, depthAll, counterMat, sx * (L / 2 + wf / 2), topY / 2, (zMin + zMax) / 2, { round: 0.002 });
      g.add(p);
    }
  } else {
    for (const sx of [-1, 1]) g.add(box(0.02, topY, Di + FT + 0.02, backMat, sx * (L / 2 + 0.01), topY / 2, (Di + FT) / 2 - 0.01));
  }
  // משטח עם חור לכיור
  const totalL = L + wf * 2;
  const shape = roundRectShape(totalL - 0.004, depthAll - 0.004, 0.003, 0, (zMin + zMax) / 2);
  const sinkZ = (Di + 0.04) / 2 + 0.03;
  for (const sx of sinks) shape.holes.push(roundRectPath(0.68, 0.42, 0.022, sx, sinkZ));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d.counterT - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 8 });
  geo.rotateX(Math.PI / 2); geo.translate(0, d.counterH - 0.002, 0);
  boxUV(geo, new THREE.Vector3(20, 0, 0));
  const top = new THREE.Mesh(geo, counterMat); top.castShadow = true; top.receiveShadow = true; top.name = 'countertop';
  g.add(top);
  for (const sx of sinks) { const sk = A.sink(KI, sinkZ, d.counterH, s.style.sink); sk.position.x = sx; g.add(sk); }
  // קישוט על האי
  const bowl = A.fruitBowl(lib); bowl.position.set(sinks.length ? (sinks[0] > 0 ? -L * 0.3 : L * 0.3) : 0, d.counterH, (zMin + zMax) / 2 - 0.08); g.add(bowl);
  const vase = A.vaseWithBranches(lib); vase.position.set(sinks.length ? (sinks[0] > 0 ? -L * 0.42 + 0.3 : L * 0.42 - 0.3) : 0.4, d.counterH, zMin + 0.2); g.add(vase);

  // מיקום וסיבוב: חזיתות האי פונות אל קיר המטבח
  g.rotation.y = Math.PI;
  g.userData.drag = { kind: 'island' };
  g.position.set(I.offsetX || 0, 0, islandPosZ(s));
  g.updateMatrixWorld(true);

  // מנורות תלויות (בקואורדינטות עולם)
  const pz = islandCenterZ(s);
  const spacing = Math.min(0.85, totalL / 3.2);
  for (let i = -1; i <= 1; i++) {
    const p = A.pendant(lib, s.room.height, d.counterH + I.pendantH, s.style.lighting === 'evening');
    p.position.x = (I.offsetX || 0) + i * spacing; p.position.z = pz;
    p.userData.noSelect = true; p.userData.followIsland = true;
    K.extra = K.extra || []; K.extra.push(p);
  }
  // התנגשות והמידות
  const bb = new THREE.Box3().setFromObject(top); bb.min.y = 0; bb.expandByScalar(0.08);
  K.colliders.push(bb);
  K.islandTop = bb.clone().expandByScalar(-0.08);
  // גוף האי בלי בליטת המשטח – כיסאות יכולים להיכנס מתחתיה
  K.islandBody = new THREE.Box3(new THREE.Vector3((I.offsetX || 0) - totalL / 2, 0, islandPosZ(s) - (Di + 0.02)), new THREE.Vector3((I.offsetX || 0) + totalL / 2, 1, islandPosZ(s) + 0.02));
  K.island = { L: totalL, zFront: islandPosZ(s) - (Di + 0.04), zBack: islandPosZ(s) - zMin, x0: (I.offsetX || 0) - totalL / 2, x1: (I.offsetX || 0) + totalL / 2 };
  // מידות מודולי האי
  let xx = -L / 2;
  for (const m of mods) {
    const a = new THREE.Vector3(xx, 0.004, Di + 0.06).applyMatrix4(g.matrixWorld);
    const b = new THREE.Vector3(xx + m.w, 0.004, Di + 0.06).applyMatrix4(g.matrixWorld);
    K.dims.push({ a, b, label: cm(m.w), kind: 'imod' });
    xx += m.w;
  }
  return g;
}
