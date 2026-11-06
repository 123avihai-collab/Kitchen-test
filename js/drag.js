import * as THREE from 'three';
import { store, findItem } from './state.js';
import { itemExtents, ITEM_TYPES } from './items.js';
import { clamp } from './util.js';

// גרירה במישור הרצפה: האי (משנה מעבר והיסט) ופריטים חופשיים, עם התנגשויות, הצמדה וקריאת מרחקים
const r3 = (v) => Math.round(v * 1000) / 1000;
const snapCm = (v) => Math.round(v * 100) / 100;
const cmTxt = (m) => `${Math.round(m * 100)}`;

function rectGap(a, b) {
  const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
  const dz = Math.max(0, Math.max(a.z0, b.z0) - Math.min(a.z1, b.z1));
  return Math.hypot(dx, dz);
}

export class FloorDrag {
  constructor(o) {
    Object.assign(this, o); // canvas, camera, inter, rig, app, requestRender, getKitchen, getK, getOutline
    this.active = null;
    this.ray = new THREE.Raycaster();
    this.label = document.createElement('div'); this.label.id = 'drag-label'; document.body.appendChild(this.label);
    this.canvas.addEventListener('pointerdown', (e) => this.down(e), { capture: true });
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('pointercancel', (e) => this.up(e, true));
  }
  // מציאת אובייקט גריר מתחת לסמן
  dragTarget(e) {
    const p = this.inter.pick(e.clientX, e.clientY); if (!p) return null;
    let o = p.hit.object;
    while (o) { if (o.userData.drag) return { obj: o, info: o.userData.drag, hit: p.hit, select: p.select }; o = o.parent; }
    return null;
  }
  planePoint(e, y) {
    this.ray.setFromCamera(this.inter.ndc(e.clientX, e.clientY), this.camera);
    const pt = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), pt) ? pt : null;
  }
  down(e) {
    if (this.app.mode !== 'edit' || this.active || e.button > 0) return;
    const t = this.dragTarget(e); if (!t) return;
    const sel = this.app.selected;
    // במגע: גוררים רק פריט שכבר נבחר (כדי שאפשר יהיה עדיין לסובב את המצלמה)
    if (e.pointerType === 'touch') {
      const isSel = sel && (t.info.kind === 'item' ? sel.id === t.info.id : t.select && t.select.zone === 'islandModules' && sel.zone === 'islandModules');
      if (!isSel) return;
    }
    const s = store.state, K = this.getK();
    const y = t.hit.point.y;
    const start = this.planePoint(e, y); if (!start) return;
    const a = { id: e.pointerId, info: t.info, obj: t.obj, y, start, base: t.obj.position.clone(), moved: false, x: e.clientX, cy: e.clientY, followers: [], select: t.select };
    if (t.info.kind === 'island') {
      const kit = this.getKitchen();
      kit.traverse(o => { if (o.userData.followIsland) a.followers.push({ o, p: o.position.clone() }); });
      // כיסאות שצמודים לאי זזים איתו
      const I = K.island;
      a.attached = (s.items || []).filter(it => it.x > I.x0 - 0.3 && it.x < I.x1 + 0.3 && it.z > I.zFront - 0.9 && it.z < I.zBack + 0.9).map(it => it.id);
      kit.traverse(o => { const d = o.userData.drag; if (d && d.kind === 'item' && a.attached.includes(d.id)) a.followers.push({ o, p: o.position.clone() }); });
    } else {
      a.item = JSON.parse(JSON.stringify(findItem(s, t.info.id)?.it || null)); if (!a.item) return;
    }
    this.rig.orbit.enabled = false;
    this.active = a;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  move(e) {
    const a = this.active; if (!a || e.pointerId !== a.id) return;
    if (!a.moved && Math.hypot(e.clientX - a.x, e.clientY - a.cy) < (e.pointerType === 'touch' ? 10 : 4)) return;
    if (!a.moved) {
      a.moved = true; document.body.classList.add('dragging');
      if (a.info.kind === 'item') this.app.select({ id: a.info.id, part: 'item', zone: 'items' }, true);
      else if (a.select) this.app.select({ id: a.select.id, part: a.select.part, zone: a.select.zone }, true);
      const ol0 = this.getOutline(); a.olBase = ol0 ? ol0.position.clone() : null;
    }
    const p = this.planePoint(e, a.y); if (!p) return;
    const want = a.base.clone().add(p.sub(a.start));
    const res = a.info.kind === 'island' ? this.constrainIsland(want) : this.constrainItem(a.item, want, a.last || { x: a.base.x, z: a.base.z });
    a.last = { x: res.x, z: res.z };
    a.result = res;
    a.obj.position.x = res.x; a.obj.position.z = res.z;
    const dx = res.x - a.base.x, dz = res.z - a.base.z;
    for (const f of a.followers) { f.o.position.x = f.p.x + dx; f.o.position.z = f.p.z + dz; }
    const ol = this.getOutline(); if (ol && a.olBase) { ol.position.x = a.olBase.x + dx; ol.position.z = a.olBase.z + dz; }
    this.label.textContent = res.text; this.label.style.display = 'block';
    this.label.style.transform = `translate(${e.clientX}px, ${e.clientY - 56}px) translate(-50%, 0)`;
    this.requestRender();
  }
  up(e, cancel) {
    const a = this.active; if (!a || e.pointerId !== a.id) return;
    this.active = null; this.rig.orbit.enabled = this.rig.mode === 'orbit';
    this.label.style.display = 'none'; document.body.classList.remove('dragging');
    if (!a.moved || !a.result) return;
    if (cancel) { store.change(() => {}, 'struct'); return; }
    const res = a.result, dx = res.x - a.base.x, dz = res.z - a.base.z;
    store.change((s) => {
      if (a.info.kind === 'island') {
        s.island.offsetX = r3(res.x);
        s.island.aisle = r3(res.z - (s.dims.baseDepth + 0.08 + s.island.depth));
        for (const it of s.items || []) if (a.attached.includes(it.id)) { it.x = r3(it.x + dx); it.z = r3(it.z + dz); }
      } else {
        const f = findItem(s, a.info.id); if (f) { f.it.x = r3(res.x); f.it.z = r3(res.z); }
      }
    }, 'struct');
    // הימנעות מ"לחיצה" אחרי גרירה
    this.suppressTap = performance.now();
  }

  // ----- אילוצים -----
  constrainIsland(p) {
    const s = store.state, K = this.getK(), W = s.room.width, Dr = s.room.depth;
    const L = K.island.L, d = s.dims, I = s.island;
    const zMin = d.baseDepth + 0.08 + I.depth + 0.7;                 // מעבר מינימלי 70 ס"מ
    const zMax = Dr - 0.02 - I.overhang - 0.55;                      // מקום לכיסאות מאחור
    let x = clamp(snapCm(p.x), -W / 2 + L / 2 + 0.3, W / 2 - L / 2 - 0.3);
    let z = clamp(snapCm(p.z), zMin, Math.max(zMin, zMax));
    if (Math.abs(x) < 0.03) x = 0;                                    // הצמדה למרכז הקיר
    const aisle = z - (d.baseDepth + 0.08 + I.depth);
    if (Math.abs(aisle - 1.5) < 0.025) z += 1.5 - aisle;              // הצמדה למעבר 150
    const aisle2 = z - (d.baseDepth + 0.08 + I.depth);
    return { x, z, text: `מעבר ${cmTxt(aisle2)} ס״מ • ${x === 0 ? 'ממורכז' : `הזזה ${x > 0 ? 'ימינה' : 'שמאלה'} ${cmTxt(Math.abs(x))}`}` };
  }
  constrainItem(it, p, from) {
    const s = store.state, K = this.getK(), W = s.room.width, Dr = s.room.depth, d = s.dims;
    let x = snapCm(p.x), z = snapCm(p.z);
    // הצמדה ליישור עם פריטים מאותו סוג
    for (const o of s.items || []) {
      if (o.id === it.id || o.type !== it.type) continue;
      if (Math.abs(z - o.z) < 0.03) z = o.z;
      if (Math.abs(x - o.x) < 0.03) x = o.x;
    }
    const e0 = itemExtents(it, x, z);
    const wallFront = d.baseDepth + 0.04;
    x = clamp(x, -W / 2 + e0.ex, W / 2 - e0.ex);
    z = clamp(z, wallFront + e0.ez, Dr - e0.ez);
    // דחיפה החוצה מהאי
    const box = ITEM_TYPES[it.type]?.collide === 'body' ? K.islandBody : K.islandTop;
    if (box) {
      const e = itemExtents(it, x, z);
      if (e.x1 > box.min.x && e.x0 < box.max.x && e.z1 > box.min.z && e.z0 < box.max.z) {
        const opts = [[box.min.x - e.ex, z, e.x1 - box.min.x], [box.max.x + e.ex, z, box.max.x - e.x0], [x, box.min.z - e.ez, e.z1 - box.min.z], [x, box.max.z + e.ez, box.max.z - e.z0]];
        // דוחפים לצד שממנו הפריט הגיע – אין "מעבר דרך" האי
        opts.sort((a, b) => Math.hypot(a[0] - from.x, a[1] - from.z) - Math.hypot(b[0] - from.x, b[1] - from.z));
        for (const [nx, nz] of opts) {
          const ee = itemExtents(it, nx, nz);
          if (ee.x0 >= -W / 2 - 1e-6 && ee.x1 <= W / 2 + 1e-6 && ee.z0 >= wallFront - 1e-6 && ee.z1 <= Dr + 1e-6) { x = nx; z = nz; break; }
        }
      }
    }
    const e = itemExtents(it, x, z);
    const parts = [`מקיר המטבח ${cmTxt(e.z0 - wallFront)}`];
    if (K.islandTop) {
      const g = rectGap(e, { x0: K.islandTop.min.x, x1: K.islandTop.max.x, z0: K.islandTop.min.z, z1: K.islandTop.max.z });
      parts.push(g > 0 ? `מהאי ${cmTxt(g)}` : 'מתחת למשטח');
    }
    parts.push(`מקיר צד ${cmTxt(Math.min(e.x0 + W / 2, W / 2 - e.x1))}`);
    return { x, z, text: parts.join(' • ') + ' ס״מ' };
  }
}
