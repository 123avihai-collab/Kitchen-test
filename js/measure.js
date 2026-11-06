import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { cm } from './util.js';

// כלי מדידה (שתי נקודות) וקווי מידות של התכנון
const Y = new THREE.Vector3(0, 1, 0);

function label(text, cls = 'dim-label') {
  const el = document.createElement('div'); el.className = cls; el.textContent = text;
  const o = new CSS2DObject(el); o.center.set(0.5, 0.5); return o;
}
function segment(a, b, r, mat) {
  const len = a.distanceTo(b); if (len < 1e-4) return new THREE.Object3D();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6, 1, true), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
  m.renderOrder = 998; m.userData.noPick = true; m.castShadow = false;
  return m;
}

export class Measure {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); this.group.userData.noPick = true; scene.add(this.group);
    this.mat = new THREE.MeshBasicMaterial({ color: '#ff6a00', depthTest: false, transparent: true });
    this.a = null; this.previewObj = null;
  }
  dot(p) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 10), this.mat);
    m.position.copy(p); m.renderOrder = 999; m.userData.noPick = true; return m;
  }
  add(p) {
    if (!this.a) { this.a = p.clone(); this.aDot = this.dot(p); this.group.add(this.aDot); return null; }
    const b = p.clone(), a = this.a; this.a = null; this.clearPreview();
    const g = new THREE.Group();
    g.add(this.dot(b), segment(a, b, 0.003, this.mat));
    const d = a.distanceTo(b);
    const l = label(`${cm(d)} ס״מ`, 'measure-label'); l.position.copy(a).add(b).multiplyScalar(0.5); g.add(l);
    this.group.add(g);
    return d;
  }
  preview(p) {
    this.clearPreview(); if (!this.a || !p) return;
    const g = new THREE.Group(); g.add(segment(this.a, p, 0.002, this.mat));
    const l = label(`${cm(this.a.distanceTo(p))}`, 'measure-label ghost'); l.position.copy(this.a).add(p).multiplyScalar(0.5); g.add(l);
    this.previewObj = g; this.group.add(g);
  }
  clearPreview() { if (this.previewObj) { this.dispose(this.previewObj); this.group.remove(this.previewObj); this.previewObj = null; } }
  cancelPending() { if (this.a) { this.a = null; this.group.remove(this.aDot); } this.clearPreview(); }
  clear() { this.a = null; for (const c of [...this.group.children]) { this.dispose(c); this.group.remove(c); } }
  dispose(o) { o.traverse(c => { c.geometry?.dispose(); if (c.isCSS2DObject) c.element.remove(); }); }
  get count() { return this.group.children.length; }
}

export class Dimensions {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); this.group.visible = false; this.group.userData.noPick = true; scene.add(this.group);
    this.mat = new THREE.MeshBasicMaterial({ color: '#1d4ed8', depthTest: false, transparent: true, opacity: 0.9 });
  }
  setVisible(v) { this.group.visible = v; this.group.traverse(o => { if (o.isCSS2DObject) { o.visible = v; if (!v) o.element.style.display = 'none'; } }); }
  clear() { for (const c of [...this.group.children]) { c.traverse(o => { o.geometry?.dispose(); if (o.isCSS2DObject) o.element.remove(); }); this.group.remove(c); } }
  line(a, b, text, tickDir) {
    const g = new THREE.Group();
    g.add(segment(a, b, 0.0035, this.mat));
    const t = tickDir.clone().multiplyScalar(0.05);
    g.add(segment(a.clone().sub(t), a.clone().add(t), 0.0035, this.mat));
    g.add(segment(b.clone().sub(t), b.clone().add(t), 0.0035, this.mat));
    const l = label(text); l.position.copy(a).add(b).multiplyScalar(0.5); g.add(l);
    this.group.add(g);
  }
  build(state, K) {
    this.clear();
    const d = state.dims, W = state.room.width, H = state.room.height, Dr = state.room.depth;
    const zF = d.baseDepth + 0.25;
    // רוחב כל מודול בקיר – על הרצפה מול הארונות
    for (const it of K.dims) {
      if (it.kind === 'mod') this.line(it.a.clone().setZ(zF), it.b.clone().setZ(zF), it.label, new THREE.Vector3(0, 0, 1));
      else if (it.kind === 'imod') this.line(it.a, it.b, it.label, new THREE.Vector3(0, 0, 1));
    }
    this.line(new THREE.Vector3(-W / 2, 0.004, zF + 0.25), new THREE.Vector3(W / 2, 0.004, zF + 0.25), `קיר ${cm(W)}`, new THREE.Vector3(0, 0, 1));
    // גובה תקרה
    this.line(new THREE.Vector3(-W / 2 + 0.06, 0, Dr - 0.06), new THREE.Vector3(-W / 2 + 0.06, H, Dr - 0.06), `תקרה ${cm(H)}`, new THREE.Vector3(1, 0, 0));
    // עומק חדר
    this.line(new THREE.Vector3(-W / 2 + 0.06, 0.004, 0), new THREE.Vector3(-W / 2 + 0.06, 0.004, Dr), `עומק ${cm(Dr)}`, new THREE.Vector3(1, 0, 0));
    if (K.island) {
      const I = K.island, x = I.x0 - 0.18;
      // מעבר
      this.line(new THREE.Vector3(x, d.counterH + 0.01, d.baseDepth + 0.04), new THREE.Vector3(x, d.counterH + 0.01, I.zFront), `מעבר ${cm(I.zFront - d.baseDepth - 0.04)}`, new THREE.Vector3(1, 0, 0));
      // אורך ועומק האי
      this.line(new THREE.Vector3(I.x0, d.counterH + 0.02, I.zBack + 0.06), new THREE.Vector3(I.x1, d.counterH + 0.02, I.zBack + 0.06), `אי ${cm(I.L)}`, new THREE.Vector3(0, 0, 1));
      this.line(new THREE.Vector3(I.x1 + 0.08, d.counterH + 0.02, I.zFront), new THREE.Vector3(I.x1 + 0.08, d.counterH + 0.02, I.zBack), `${cm(I.zBack - I.zFront)}`, new THREE.Vector3(1, 0, 0));
      // גובה משטח
      this.line(new THREE.Vector3(I.x1 + 0.08, 0, I.zBack + 0.06), new THREE.Vector3(I.x1 + 0.08, d.counterH, I.zBack + 0.06), `משטח ${cm(d.counterH)}`, new THREE.Vector3(1, 0, 0));
    }
    // עליונים: גובה ומרווח
    const ux = -W / 2 + 1.0, uz = d.upperDepth + 0.06;
    this.line(new THREE.Vector3(ux, d.counterH, uz), new THREE.Vector3(ux, d.counterH + d.upperGap, uz), `${cm(d.upperGap)}`, new THREE.Vector3(1, 0, 0));
    this.line(new THREE.Vector3(ux, d.counterH + d.upperGap, uz), new THREE.Vector3(ux, d.counterH + d.upperGap + d.upperH, uz), `${cm(d.upperH)}`, new THREE.Vector3(1, 0, 0));
    // חלון
    const w = state.window, xr = W / 2 - 0.03;
    this.line(new THREE.Vector3(xr, w.sill + w.height + 0.08, w.center - w.width / 2), new THREE.Vector3(xr, w.sill + w.height + 0.08, w.center + w.width / 2), `חלון ${cm(w.width)}×${cm(w.height)}`, new THREE.Vector3(0, 1, 0));
    this.line(new THREE.Vector3(xr, 0, w.center + w.width / 2 + 0.1), new THREE.Vector3(xr, w.sill, w.center + w.width / 2 + 0.1), `אדן ${cm(w.sill)}`, new THREE.Vector3(0, 0, 1));
    this.setVisible(this.group.visible);
  }
}
