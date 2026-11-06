import * as THREE from 'three';
import { easeInOut } from './util.js';

// בחירה בלחיצה, פתיחה/סגירה של דלתות ומגירות באנימציה, מסגרת בחירה
export class Interaction {
  constructor(camera, dom) {
    this.camera = camera; this.dom = dom;
    this.ray = new THREE.Raycaster();
    this.targets = [];
    this.active = new Set();
    this.outline = null;
  }
  setTargets(list) { this.targets = list; this.active.clear(); }

  ndc(cx, cy) {
    const r = this.dom.getBoundingClientRect();
    return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  }
  raycast(cx, cy) {
    this.ray.setFromCamera(this.ndc(cx, cy), this.camera);
    const hits = this.ray.intersectObjects(this.targets, true);
    for (const h of hits) {
      let o = h.object, skip = false;
      while (o) { if (o.userData.noPick || o.visible === false) { skip = true; break; } o = o.parent; }
      if (!skip && h.object.isMesh) return h;
    }
    return null;
  }
  pick(cx, cy) {
    const hit = this.raycast(cx, cy);
    if (!hit) return null;
    let o = hit.object, openable = null, select = null;
    while (o) {
      if (!openable && o.userData.openable) openable = o;
      if (!select && o.userData.select) select = { ...o.userData.select, object: o };
      if (o.userData.noSelect) break;
      o = o.parent;
    }
    return { hit, openable, select };
  }
  toggle(pivot) {
    const a = pivot.userData.openable;
    a.target = a.target > 0.5 ? 0 : 1;
    this.active.add(pivot);
    return a.target === 1;
  }
  closeAll() {
    for (const root of this.targets) root.traverse(o => { const a = o.userData.openable; if (a && a.t > 0) { a.target = 0; this.active.add(o); } });
  }
  update(dt) {
    if (!this.active.size) return false;
    for (const p of this.active) {
      const a = p.userData.openable;
      const dir = Math.sign(a.target - a.t);
      a.t = THREE.MathUtils.clamp(a.t + dir * dt / 0.65, 0, 1);
      const e = easeInOut(a.t);
      if (a.kind === 'rot') p.rotation[a.axis] = a.rest + a.amount * e;
      else p.position[a.axis] = a.rest + a.amount * e;
      a.onChange?.(e);
      if (a.t === a.target) this.active.delete(p);
    }
    return true;
  }

  // מסגרת בחירה כתומה סביב אובייקט
  setOutline(scene, obj) {
    if (this.outline) { scene.remove(this.outline); this.outline.geometry.dispose(); this.outline = null; }
    if (!obj) return;
    obj.updateMatrixWorld(true);
    const bb = new THREE.Box3();
    obj.traverse(o => {
      if (!o.isMesh || o.userData.noPick) return;
      // התעלם מחלקים פתוחים כדי שהמסגרת תתאים לגוף הארון
      const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
      bb.union(g.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    if (bb.isEmpty()) return;
    bb.expandByScalar(0.008);
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(...bb.getSize(new THREE.Vector3()).toArray()));
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#ff7a1a', depthTest: false, transparent: true, opacity: 0.95 }));
    line.position.copy(bb.getCenter(new THREE.Vector3()));
    line.renderOrder = 999; line.userData.noPick = true;
    this.outline = line; scene.add(line);
    // מילוי חצי שקוף
    const fill = new THREE.Mesh(new THREE.BoxGeometry(...bb.getSize(new THREE.Vector3()).toArray()), new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.08, depthWrite: false }));
    fill.userData.noPick = true; line.add(fill);
  }
}
