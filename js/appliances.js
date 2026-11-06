import * as THREE from 'three';
import { box, cyl, roundRectShape, roundRectPath } from './util.js';

// מכשירים ואביזרים בפירוט: מקרר, תנור, מיקרוגל, כיריים, קולט אדים, מדיח, כיור, ברז, כיסאות, מנורות
// כל הפונקציות עובדות בקואורדינטות מקומיות של מודול: x=0 במרכז, y=0 רצפה, z=0 קיר, חזית לכיוון +z.

export function openable(pivot, kind, axis, amount, extra = {}) {
  pivot.userData.openable = { kind, axis, amount, t: 0, target: 0, rest: kind === 'slide' ? pivot.position[axis] : pivot.rotation[axis], ...extra };
  return pivot;
}

/** ידית בר שחורה דקה עם שתי רגליות */
export function handle(lib, len, vertical, kind = 'black') {
  const g = new THREE.Group();
  const mat = lib.metal(kind);
  const bar = box(vertical ? 0.012 : len, vertical ? len : 0.012, 0.012, mat, 0, 0, 0.032, { round: 0.004, uv: false });
  g.add(bar);
  const off = len / 2 - Math.min(0.03, len * 0.15);
  for (const s of [-1, 1]) {
    const p = cyl(0.0045, 0.0045, 0.03, mat, 12); p.rotation.x = Math.PI / 2;
    p.position.set(vertical ? 0 : s * off, vertical ? s * off : 0, 0.015);
    g.add(p);
  }
  return g;
}

// ---------- מקרר דו-דלתי (Side by Side) ----------
export function fridge(K, w, h, d) {
  const { lib } = K; const g = new THREE.Group(); g.name = 'fridge';
  const skin = lib.applianceSkin(K.s.style.appliance), liner = lib.fridgeLiner;
  const bodyD = d - 0.07, z0 = 0.03, t = 0.03;
  const zf = z0 + bodyD; // חזית הגוף
  // גוף: גב, צדדים, תקרה, רצפה (חלול – נראה בפנים)
  g.add(box(w, h - 0.06, 0.03, skin, 0, 0.06 + (h - 0.06) / 2, z0 + 0.015));
  for (const s of [-1, 1]) {
    g.add(box(0.012, h - 0.06, bodyD, skin, s * (w / 2 - 0.006), 0.06 + (h - 0.06) / 2, z0 + bodyD / 2));
    g.add(box(t, h - 0.12, bodyD - 0.03, liner, s * (w / 2 - 0.012 - t / 2), 0.06 + (h - 0.06) / 2, z0 + 0.015 + bodyD / 2, { cast: false }));
  }
  g.add(box(w, 0.04, bodyD, skin, 0, h - 0.02, z0 + bodyD / 2));
  g.add(box(w - 0.02, 0.04, bodyD, liner, 0, h - 0.06, z0 + bodyD / 2, { cast: false }));
  g.add(box(w, 0.08, bodyD, liner, 0, 0.1, z0 + bodyD / 2, { cast: false }));
  g.add(box(w - 0.08, 0.06, 0.01, lib.carcassDark, 0, 0.03, zf - 0.03)); // גריל תחתון
  g.add(box(w - 0.024, h - 0.14, 0.01, liner, 0, 0.06 + (h - 0.06) / 2, z0 + 0.035, { cast: false }));
  const split = -w / 2 + w * 0.42;
  g.add(box(0.04, h - 0.16, bodyD - 0.03, liner, split, 0.06 + (h - 0.06) / 2, z0 + bodyD / 2 + 0.01));
  // מדפים: מקפיא (שמאל) – מדפים לבנים; מקרר (ימין) – מדפי זכוכית + מגירות
  const lw = split - (-w / 2 + 0.045) - 0.02, lx = (-w / 2 + 0.045 + split - 0.02) / 2;
  const rw = (w / 2 - 0.045) - (split + 0.02), rx = (split + 0.02 + w / 2 - 0.045) / 2;
  for (const y of [0.5, 0.85, 1.2, 1.5]) g.add(box(lw, 0.008, bodyD - 0.08, lib.shelfGlass, lx, y, z0 + bodyD / 2 + 0.01, { cast: false }));
  for (const y of [0.55, 0.9, 1.2, 1.48]) g.add(box(rw, 0.008, bodyD - 0.08, lib.shelfGlass, rx, y, z0 + bodyD / 2 + 0.01, { cast: false }));
  // מגירות ירקות שקופות
  for (const s of [-1, 1]) {
    const dw = rw / 2 - 0.01;
    g.add(box(dw, 0.2, bodyD - 0.12, lib.shelfGlass, rx + s * (dw / 2 + 0.005), 0.25, z0 + bodyD / 2 + 0.02, { cast: false }));
  }
  // מעט מוצרים במקרר
  const jar = lib.ceramic;
  for (let i = 0; i < 3; i++) { const c = cyl(0.04, 0.04, 0.14, jar, 16); c.position.set(rx - rw / 3 + i * rw / 3, 0.9 + 0.075, z0 + 0.25 + (i % 2) * 0.12); g.add(c); }
  const bottle = lib.get('bottle', () => new THREE.MeshPhysicalMaterial({ color: '#7fa88b', roughness: 0.05, transparent: true, opacity: 0.55 }));
  for (let i = 0; i < 2; i++) { const c = cyl(0.035, 0.035, 0.26, bottle, 16); c.position.set(rx + rw / 4 + i * 0.08, 0.55 + 0.135, z0 + 0.3); g.add(c); }
  // אור פנימי
  const lamp = box(rw * 0.6, 0.012, 0.08, lib.coolLight, rx, h - 0.095, z0 + bodyD * 0.55, { cast: false });
  g.add(lamp);

  // דלתות
  const doorD = 0.065, dh = h - 0.075, dy = 0.065 + dh / 2;
  const mk = (x0, x1, hingeLeft, name) => {
    const dw = x1 - x0 - 0.004;
    const pivot = new THREE.Group(); pivot.position.set(hingeLeft ? x0 : x1, 0, zf + doorD);
    const sx = hingeLeft ? dw / 2 + 0.002 : -dw / 2 - 0.002;
    const door = new THREE.Group(); door.position.set(sx, 0, -doorD);
    door.add(box(dw, dh, doorD * 0.6, skin, 0, dy, doorD * 0.7, { round: 0.008 }));
    door.add(box(dw - 0.03, dh - 0.04, doorD * 0.45, liner, 0, dy, doorD * 0.22, { cast: false }));
    // מדפי דלת
    for (const y of [0.45, 0.85, 1.2, 1.5]) door.add(box(dw - 0.08, 0.07, 0.07, lib.shelfGlass, 0, y, -0.04, { cast: false }));
    // ידית ארוכה שחורה בצד הפנימי
    const hd = handle(lib, 1.1, true, K.s.style.handle); hd.position.set((hingeLeft ? 1 : -1) * (dw / 2 - 0.04), 1.05, doorD); door.add(hd);
    pivot.add(door);
    openable(pivot, 'rot', 'y', (hingeLeft ? -1 : 1) * THREE.MathUtils.degToRad(105), {
      onChange: (t) => { lamp.material.emissiveIntensity = 0.6 + 4 * Math.min(1, t * 3); }, label: name,
    });
    return { pivot, door, dw };
  };
  const L = mk(-w / 2, split + 0.02, true, 'מקפיא');
  const R = mk(split + 0.02, w / 2, false, 'מקרר');
  // מתקן מים/קרח על דלת המקפיא
  const disp = box(L.dw * 0.55, 0.28, 0.012, lib.blackGlass, 0, 1.25, doorD + 0.006, { round: 0.004 });
  L.door.add(disp);
  g.add(L.pivot, R.pivot);
  return g;
}

// ---------- תנור בנוי 60 ----------
export function oven(K, w, y0) {
  const { lib } = K; const g = new THREE.Group(); g.name = 'oven';
  const fw = w - 0.006, H = 0.595, zf = K.frontZ - 0.02, cd = 0.52;
  const skin = lib.applianceSkin(K.s.style.appliance);
  // חלל פנימי
  const cav = new THREE.Group();
  const iw = fw - 0.12, ih = 0.36, iz = zf - 0.02 - cd / 2, iy = y0 + 0.06 + ih / 2;
  cav.add(box(iw, 0.01, cd, lib.enamel, 0, iy - ih / 2, iz, { cast: false }));
  cav.add(box(iw, 0.01, cd, lib.enamel, 0, iy + ih / 2, iz, { cast: false }));
  cav.add(box(0.01, ih, cd, lib.enamel, -iw / 2, iy, iz, { cast: false }));
  cav.add(box(0.01, ih, cd, lib.enamel, iw / 2, iy, iz, { cast: false }));
  cav.add(box(iw, ih, 0.01, lib.enamel, 0, iy, iz - cd / 2, { cast: false }));
  for (const yy of [iy - 0.08, iy + 0.06]) { const r = box(iw - 0.02, 0.006, cd - 0.04, lib.wireRack, 0, yy, iz, { cast: false }); g.add(r); }
  const tray = box(iw - 0.04, 0.02, cd - 0.08, lib.enamel, 0, iy - 0.075, iz + 0.01, { cast: false }); cav.add(tray);
  const ovenLamp = box(0.06, 0.04, 0.005, lib.warmLight, iw / 2 - 0.06, iy + ih / 2 - 0.05, iz - cd / 2 + 0.008, { cast: false });
  cav.add(ovenLamp);
  g.add(cav);
  // מסגרת חזית ופס בקרה
  const panelH = 0.095;
  g.add(box(fw, panelH, 0.022, lib.blackGlass, 0, y0 + H - panelH / 2, zf + 0.011, { round: 0.003 }));
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.024), lib.ovenDisplay); disp.position.set(0, y0 + H - panelH / 2, zf + 0.0225); g.add(disp);
  for (const s of [-1, 1]) {
    const k = cyl(0.019, 0.019, 0.022, skin, 32); k.rotation.x = Math.PI / 2; k.position.set(s * fw * 0.32, y0 + H - panelH / 2, zf + 0.032); g.add(k);
    const kc = cyl(0.016, 0.016, 0.004, lib.metal('black'), 24); kc.rotation.x = Math.PI / 2; kc.position.set(s * fw * 0.32, y0 + H - panelH / 2, zf + 0.044); g.add(kc);
  }
  g.add(box(fw, 0.006, 0.024, skin, 0, y0 + H - panelH - 0.003, zf + 0.012));
  // מסגרת צד סביב הדלת
  g.add(box(fw, 0.01, 0.02, skin, 0, y0 + 0.005, zf + 0.01));
  // דלת נפתחת כלפי מטה
  const dh = H - panelH - 0.012;
  const pivot = new THREE.Group(); pivot.position.set(0, y0 + 0.01, zf);
  pivot.add(box(fw, dh, 0.03, lib.blackGlass, 0, dh / 2, 0.015, { round: 0.003 }));
  const win = box(fw * 0.62, dh * 0.5, 0.004, lib.get('ovenWin', () => new THREE.MeshPhysicalMaterial({ color: '#1a1410', roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1 })), 0, dh * 0.47, 0.031, { cast: false });
  pivot.add(win);
  const hd = handle(lib, fw * 0.8, false, K.s.style.handle); hd.position.set(0, dh - 0.035, 0.03); pivot.add(hd);
  openable(pivot, 'rot', 'x', THREE.MathUtils.degToRad(84), { onChange: (t) => { ovenLamp.material.emissiveIntensity = 0.5 + 4 * t; }, label: 'תנור' });
  g.add(pivot);
  return g;
}

// ---------- מיקרוגל בנוי ----------
export function microwave(K, w, y0, H) {
  const { lib } = K; const g = new THREE.Group(); g.name = 'microwave';
  const fw = w - 0.03, zf = K.frontZ - 0.07, cd = 0.32;
  const iw = fw * 0.66, ih = H - 0.09, iy = y0 + 0.045 + ih / 2, ix = -fw / 2 + 0.03 + iw / 2, iz = zf - cd / 2;
  const inner = lib.get('mwInner', () => new THREE.MeshStandardMaterial({ color: '#c9ccce', metalness: 0.6, roughness: 0.35 }));
  g.add(box(iw, 0.008, cd, inner, ix, iy - ih / 2, iz, { cast: false }));
  g.add(box(iw, 0.008, cd, inner, ix, iy + ih / 2, iz, { cast: false }));
  g.add(box(0.008, ih, cd, inner, ix - iw / 2, iy, iz, { cast: false }));
  g.add(box(0.008, ih, cd, inner, ix + iw / 2, iy, iz, { cast: false }));
  g.add(box(iw, ih, 0.008, inner, ix, iy, iz - cd / 2, { cast: false }));
  const plate = cyl(0.13, 0.13, 0.006, lib.shelfGlass, 40, { cast: false }); plate.position.set(ix, iy - ih / 2 + 0.02, iz); g.add(plate);
  const lamp = box(0.05, 0.004, 0.03, lib.warmLight, ix, iy + ih / 2 - 0.006, iz, { cast: false }); g.add(lamp);
  // מסגרת שחורה
  g.add(box(fw, 0.04, 0.02, lib.blackGlass, 0, y0 + 0.02, zf + 0.01));
  g.add(box(fw, 0.04, 0.02, lib.blackGlass, 0, y0 + H - 0.02, zf + 0.01));
  g.add(box(fw - iw - 0.04, H - 0.08, 0.02, lib.blackGlass, ix + iw / 2 + (fw - iw - 0.04) / 2 + 0.02, y0 + H / 2, zf + 0.01));
  // לוח מקשים
  const keys = lib.get('mwKeys', () => new THREE.MeshStandardMaterial({ color: '#666', emissive: '#ffffff', emissiveIntensity: 0.25 }));
  for (let i = 0; i < 4; i++) g.add(box(0.05, 0.006, 0.002, keys, ix + iw / 2 + 0.07, y0 + H - 0.08 - i * 0.04, zf + 0.021, { cast: false }));
  // דלת עם ציר שמאלי
  const pivot = new THREE.Group(); pivot.position.set(-fw / 2, 0, zf + 0.02);
  const dw = iw + 0.04;
  pivot.add(box(dw, H - 0.08, 0.02, lib.blackGlass, dw / 2, y0 + H / 2, 0.01, { round: 0.003 }));
  pivot.add(box(0.012, H * 0.5, 0.004, lib.metal('darksteel'), dw - 0.02, y0 + H / 2, 0.022, { uv: false })); // פס אחיזה שקוע
  openable(pivot, 'rot', 'y', -THREE.MathUtils.degToRad(100), { onChange: (t) => { lamp.material.emissiveIntensity = 0.5 + 3 * t; }, label: 'מיקרוגל' });
  g.add(pivot);
  return g;
}

// ---------- כיריים אינדוקציה 60 ----------
export function hob(K, zCenter, yTop) {
  const { lib } = K;
  const g = new THREE.Group(); g.name = 'hob';
  const top = box(0.59, 0.006, 0.52, lib.hobTop, 0, yTop + 0.003, zCenter, { round: 0.0025, uv: false });
  // UV רגיל לפני העליון (לטקסטורת המגע)
  const geo = top.geometry; const pos = geo.attributes.position; const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / 0.59 + 0.5; uv[i * 2 + 1] = 0.5 - pos.getZ(i) / 0.52; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.add(top);
  g.add(box(0.594, 0.003, 0.524, lib.metal('black'), 0, yTop + 0.0015, zCenter, { uv: false }));
  return g;
}

// ---------- קולט אדים טלסקופי מוסתר בתחתית ארון עליון ----------
export function hoodVisor(K, w, yBottom, depth) {
  const { lib } = K; const g = new THREE.Group(); g.name = 'hood';
  const vw = Math.min(w - 0.04, 0.86);
  g.add(box(vw, 0.12, depth - 0.05, lib.metal('darksteel'), 0, yBottom + 0.06, depth / 2 - 0.01));
  const pivot = new THREE.Group(); pivot.position.set(0, 0, 0);
  const visor = box(vw, 0.035, 0.26, lib.blackGlass, 0, yBottom + 0.0175, depth - 0.13, { round: 0.003 });
  pivot.add(visor);
  const lamps = [];
  for (const s of [-1, 1]) { const l = cyl(0.025, 0.025, 0.003, lib.warmLight, 24, { cast: false }); l.position.set(s * vw * 0.3, yBottom - 0.001, depth - 0.15); pivot.add(l); lamps.push(l); }
  g.add(pivot);
  pivot.position.z = 0;
  openable(pivot, 'slide', 'z', 0.2, { onChange: (t) => { for (const l of lamps) l.material.emissiveIntensity = 0.3 + 6 * t; }, label: 'קולט אדים' });
  return g;
}

// ---------- מדיח כלים משולב ----------
export function dishwasher(K, w, P, topY, frontMat) {
  const { lib } = K; const g = new THREE.Group(); g.name = 'dishwasher';
  const steel = lib.metal('steel'), zf = K.frontZ, d = K.d.baseDepth;
  const iw = w - 0.06, ih = topY - P - 0.06, iy = P + 0.03 + ih / 2, iz = d / 2 + 0.01, id = d - 0.06;
  // טאב נירוסטה
  g.add(box(iw, 0.01, id, steel, 0, iy - ih / 2, iz, { cast: false }));
  g.add(box(iw, 0.01, id, steel, 0, iy + ih / 2, iz, { cast: false }));
  g.add(box(0.01, ih, id, steel, -iw / 2, iy, iz, { cast: false }));
  g.add(box(0.01, ih, id, steel, iw / 2, iy, iz, { cast: false }));
  g.add(box(iw, ih, 0.01, steel, 0, iy, iz - id / 2, { cast: false }));
  // סלסלות (נשלפות יחד עם הדלת)
  const rackPivot = new THREE.Group();
  const rackMat = lib.wireRack;
  for (const yy of [iy - ih / 2 + 0.08, iy + 0.1]) {
    rackPivot.add(box(iw - 0.04, 0.004, id - 0.06, rackMat, 0, yy, iz, { cast: false }));
    rackPivot.add(box(iw - 0.04, 0.08, 0.004, rackMat, 0, yy + 0.04, iz + id / 2 - 0.03, { cast: false }));
    rackPivot.add(box(iw - 0.04, 0.08, 0.004, rackMat, 0, yy + 0.04, iz - id / 2 + 0.03, { cast: false }));
  }
  // צלחות בסלסלה התחתונה
  for (let i = 0; i < 7; i++) { const p = cyl(0.11, 0.11, 0.008, lib.ceramic, 28, { cast: false }); p.rotation.x = Math.PI / 2; p.position.set(-iw / 2 + 0.07 + i * 0.065, iy - ih / 2 + 0.2, iz); p.rotation.z = Math.PI / 2; rackPivot.add(p); }
  // כוסות למעלה
  const glassMat = lib.shelfGlass;
  for (let i = 0; i < 5; i++) { const c = cyl(0.035, 0.03, 0.11, glassMat, 16, { open: true, cast: false }); c.position.set(-iw / 2 + 0.08 + i * 0.1, iy + 0.17, iz + 0.05); c.rotation.x = Math.PI; rackPivot.add(c); }
  g.add(rackPivot);
  // דלת: חזית משולבת + פנים נירוסטה, ציר תחתון
  const fh = topY - 0.003 - (P + 0.003);
  const pivot = new THREE.Group(); pivot.position.set(0, P + 0.003, zf);
  pivot.add(box(w - 0.003, fh, 0.019, frontMat, 0, fh / 2, 0.0095, { round: 0.0015, uvOff: { x: K.ox, y: P, z: zf } }));
  pivot.add(box(iw, fh - 0.06, 0.04, steel, 0, fh / 2, -0.02, { cast: false }));
  const hd = handle(lib, Math.min(0.45, w - 0.15), false, K.s.style.handle); hd.position.set(0, fh - 0.055, 0.019); pivot.add(hd);
  openable(pivot, 'rot', 'x', THREE.MathUtils.degToRad(82), { label: 'מדיח',
    onChange: (t) => { rackPivot.position.z = 0.28 * Math.max(0, (t - 0.6) / 0.4); } });
  g.add(pivot);
  return g;
}

// ---------- כיור תחתון + ברז ----------
export function sink(K, zc, yTop, kind = 'black') {
  const { lib } = K; const g = new THREE.Group(); g.name = 'sink';
  const mat = kind === 'steel' ? lib.metal('steel') : lib.sinkBlack;
  const iw = 0.68, idp = 0.42, depth = 0.2, wall = 0.012;
  const outer = roundRectShape(iw + wall * 2, idp + wall * 2, 0.03);
  outer.holes.push(roundRectPath(iw, idp, 0.022));
  const wg = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 6 });
  wg.rotateX(Math.PI / 2);
  const walls = new THREE.Mesh(wg, mat); walls.position.set(0, yTop - K.d.counterT, zc); walls.receiveShadow = true; g.add(walls);
  const bg = new THREE.ShapeGeometry(roundRectShape(iw + 0.01, idp + 0.01, 0.022), 6); bg.rotateX(-Math.PI / 2);
  const bottom = new THREE.Mesh(bg, mat); bottom.position.set(0, yTop - K.d.counterT - depth + 0.002, zc); bottom.receiveShadow = true; g.add(bottom);
  const drain = cyl(0.045, 0.045, 0.004, lib.metal('steel'), 32, { cast: false }); drain.position.set(0.18, yTop - K.d.counterT - depth + 0.005, zc); g.add(drain);
  const drainC = cyl(0.03, 0.03, 0.005, lib.metal('darksteel'), 24, { cast: false }); drainC.position.set(0.18, yTop - K.d.counterT - depth + 0.006, zc); g.add(drainC);
  // ברז שחור מט – צוואר ברבור
  const f = faucet(lib, K.s.style.faucet);
  f.position.set(0, yTop, zc - idp / 2 - 0.065);
  g.add(f);
  // סיפון מתחת
  const pipe = cyl(0.02, 0.02, 0.25, lib.get('pvc', () => new THREE.MeshStandardMaterial({ color: '#d9d9d9', roughness: 0.5 })), 16); pipe.position.set(0.18, yTop - K.d.counterT - depth - 0.12, zc); g.add(pipe);
  return g;
}

export function faucet(lib, kind = 'black') {
  const mat = lib.metal(kind);
  const g = new THREE.Group(); g.name = 'faucet';
  const base = cyl(0.028, 0.03, 0.035, mat, 32); base.position.y = 0.0175; g.add(base);
  const pts = [new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0, 0.22, 0), new THREE.Vector3(0, 0.36, 0.015), new THREE.Vector3(0, 0.405, 0.09), new THREE.Vector3(0, 0.38, 0.19), new THREE.Vector3(0, 0.31, 0.225), new THREE.Vector3(0, 0.27, 0.228)];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.0135, 20, false), mat); tube.castShadow = true; g.add(tube);
  const aer = cyl(0.0165, 0.0165, 0.03, mat, 24); aer.position.set(0, 0.265, 0.228); g.add(aer);
  const aerIn = cyl(0.011, 0.011, 0.002, lib.get('aer', () => new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.8 })), 16); aerIn.position.set(0, 0.249, 0.228); g.add(aerIn);
  // ידית צד
  const hub = cyl(0.017, 0.017, 0.04, mat, 24); hub.rotation.z = Math.PI / 2; hub.position.set(0.03, 0.14, 0); g.add(hub);
  const lever = box(0.01, 0.09, 0.012, mat, 0.05, 0.18, 0.0, { round: 0.004, uv: false }); lever.rotation.z = -0.25; g.add(lever);
  return g;
}

// ---------- כיסא בר ----------
export function stool(lib, seatH = 0.65) {
  const g = new THREE.Group(); g.name = 'stool';
  const blk = lib.metal('black'), leather = lib.leather();
  const prof = [[0, 0], [0.18, 0], [0.198, 0.008], [0.206, 0.028], [0.2, 0.048], [0.18, 0.06], [0.12, 0.066], [0, 0.068]].map(([x, y]) => new THREE.Vector2(x, y));
  const seat = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), leather); seat.position.y = seatH - 0.065; seat.castShadow = true; seat.receiveShadow = true;
  g.add(seat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 10, 48), blk); ring.rotation.x = Math.PI / 2; ring.position.y = seatH - 0.07; g.add(ring);
  // משענת נמוכה מעוגלת
  const sh = new THREE.Shape(); const r0 = 0.175, r1 = 0.2, a0 = Math.PI * 0.2, a1 = Math.PI * 0.8;
  sh.absarc(0, 0, r1, a0, a1, false); sh.absarc(0, 0, r0, a1, a0, true);
  const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.11, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 24 });
  bg.rotateX(-Math.PI / 2);
  const back = new THREE.Mesh(bg, leather); back.position.y = seatH + 0.09; back.castShadow = true;
  // UV פשוט למשענת
  g.add(back);
  for (const s of [-1, 1]) { const p = cyl(0.006, 0.006, 0.12, blk, 10); p.position.set(s * 0.1, seatH + 0.05, -0.16); p.rotation.x = 0.15; g.add(p); }
  // רגליים
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const top = new THREE.Vector3(Math.cos(a) * 0.15, seatH - 0.075, Math.sin(a) * 0.15);
    const bot = new THREE.Vector3(Math.cos(a) * 0.215, 0.0, Math.sin(a) * 0.215);
    const len = top.distanceTo(bot);
    const leg = cyl(0.0095, 0.0085, len, blk, 12);
    leg.position.copy(top).add(bot).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
    g.add(leg);
    const foot = cyl(0.011, 0.011, 0.008, lib.rubber, 12); foot.position.copy(bot).setY(0.004); g.add(foot);
  }
  const fr = new THREE.Mesh(new THREE.TorusGeometry(0.196, 0.007, 10, 48), blk); fr.rotation.x = Math.PI / 2; fr.position.y = 0.26; fr.castShadow = true; g.add(fr);
  return g;
}

// ---------- מנורה תלויה שחורה ----------
export function pendant(lib, dropTop, bottomY, evening) {
  const g = new THREE.Group(); g.name = 'pendant';
  const blk = lib.metal('black');
  const prof = [[0.012, 0], [0.03, -0.006], [0.06, -0.03], [0.1, -0.08], [0.135, -0.14], [0.155, -0.19], [0.16, -0.205]].map(([x, y]) => new THREE.Vector2(x, y));
  const shade = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), lib.get('pendantOuter', () => { const m = blk.clone(); m.side = THREE.BackSide; return m; })); shade.castShadow = true; g.add(shade);
  const innerProf = prof.map(v => new THREE.Vector2(v.x * 0.97, v.y - 0.002));
  const inner = new THREE.Mesh(new THREE.LatheGeometry(innerProf, 48), lib.pendantInner); g.add(inner);
  const sock = cyl(0.018, 0.018, 0.05, blk, 16); sock.position.y = -0.04; g.add(sock);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 24, 16), lib.bulb); bulb.position.y = -0.09; bulb.castShadow = false; g.add(bulb);
  const cordLen = dropTop - (bottomY + 0.205);
  const cord = cyl(0.0022, 0.0022, cordLen, blk, 8); cord.position.y = cordLen / 2; g.add(cord);
  const canopy = cyl(0.05, 0.05, 0.02, blk, 32); canopy.position.y = cordLen - 0.01; g.add(canopy);
  g.position.y = bottomY + 0.205;
  // אור
  const spot = new THREE.SpotLight('#ffd9a8', evening ? 7 : 1.6, 0, Math.PI / 2.8, 0.9, 2);
  spot.position.set(0, -0.1, 0); spot.target.position.set(0, -2, 0); spot.castShadow = false;
  g.add(spot, spot.target);
  const pt = new THREE.PointLight('#ffcf8a', evening ? 0.6 : 0.25, 1.2, 2); pt.position.y = -0.12; g.add(pt);
  return g;
}

// ---------- אביזרי עיצוב ----------
export function plates(lib, n = 6) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const p = cyl(0.13, 0.11, 0.012, lib.ceramic, 32); p.position.y = 0.006 + i * 0.014; g.add(p); }
  return g;
}
export function jar(lib, r, h, dark) {
  const prof = [[0, 0], [r * 0.9, 0], [r, h * 0.12], [r, h * 0.8], [r * 0.75, h * 0.95], [r * 0.6, h], [0, h]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), dark ? lib.ceramicDark : lib.ceramic); m.castShadow = true; m.receiveShadow = true; return m;
}
export function fruitBowl(lib) {
  const g = new THREE.Group();
  const prof = [[0, 0], [0.07, 0], [0.13, 0.05], [0.16, 0.09], [0.155, 0.092], [0.12, 0.055], [0.06, 0.012], [0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), lib.ceramicDark); bowl.castShadow = true; g.add(bowl);
  const lemon = lib.get('lemon', () => new THREE.MeshPhysicalMaterial({ color: '#e6c22c', roughness: 0.45, clearcoat: 0.4 }));
  const pos = [[0, 0.05, 0], [0.06, 0.05, 0.03], [-0.05, 0.05, 0.04], [0.02, 0.05, -0.06], [-0.04, 0.09, -0.01], [0.04, 0.095, 0.0]];
  for (const [x, y, z] of pos) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 14), lemon); l.scale.set(1, 0.85, 0.85); l.position.set(x, y + 0.01, z); l.castShadow = true; g.add(l); }
  return g;
}
export function vaseWithBranches(lib) {
  const g = new THREE.Group();
  g.add(jar(lib, 0.06, 0.26, false));
  const stem = lib.get('stem', () => new THREE.MeshStandardMaterial({ color: '#4a3b2a', roughness: 0.9 }));
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3, len = 0.35 + (i % 3) * 0.08;
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(Math.cos(a) * 0.05, 0.3, Math.sin(a) * 0.05), new THREE.Vector3(Math.cos(a) * 0.14, 0.2 + len, Math.sin(a) * 0.14)]);
    const t = new THREE.Mesh(new THREE.TubeGeometry(c, 12, 0.004, 6), stem); t.castShadow = true; g.add(t);
    for (let k = 0; k < 6; k++) {
      const p = c.getPoint(0.4 + k * 0.1);
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.022, 8), lib.plant); leaf.scale.set(0.55, 1, 1);
      leaf.position.copy(p); leaf.rotation.set(k, a + k, 0.6); g.add(leaf);
    }
  }
  return g;
}
export function cuttingBoard(lib) {
  const g = new THREE.Group();
  const m = box(0.42, 0.025, 0.3, lib.wood, 0, 0.0125, 0, { round: 0.01 });
  m.rotation.x = -1.35; m.position.set(0, 0.16, 0.03);
  g.add(m);
  return g;
}
