import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp } from './util.js';

// שני מצבי תנועה: סיבוב סביב החדר (Orbit) והליכה בגובה עיניים (גם במגע עם ג׳ויסטיק)
export const EYE = 1.62;

export class CameraRig {
  constructor(camera, dom, joystickEl) {
    this.camera = camera; this.dom = dom;
    this.mode = 'orbit';
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enableDamping = true; this.orbit.dampingFactor = 0.08;
    this.orbit.minDistance = 0.4; this.orbit.maxDistance = 10;
    this.orbit.maxPolarAngle = Math.PI * 0.53;
    this.orbit.screenSpacePanning = true;
    this.orbit.zoomToCursor = true;
    this.yaw = 0; this.pitch = 0;
    this.keys = new Set();
    this.joy = new THREE.Vector2();
    this.colliders = []; this.bounds = null;
    this.look = null;
    this._bind(joystickEl);
  }
  _bind(joy) {
    addEventListener('keydown', e => { if (e.target.closest?.('input,select,textarea')) return; this.keys.add(e.code); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // מבט בגרירה (מצב הליכה)
    this.dom.addEventListener('pointerdown', e => {
      if (this.mode !== 'walk') return;
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    addEventListener('pointermove', e => {
      if (this.mode !== 'walk' || !this.look || e.pointerId !== this.look.id) return;
      const s = e.pointerType === 'touch' ? 0.006 : 0.004;
      this.yaw -= (e.clientX - this.look.x) * s; this.pitch -= (e.clientY - this.look.y) * s;
      this.pitch = clamp(this.pitch, -1.35, 1.35);
      this.look.x = e.clientX; this.look.y = e.clientY;
      this.dirty = true;
    });
    const end = e => { if (this.look && e.pointerId === this.look.id) this.look = null; };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    this.dom.addEventListener('wheel', e => {
      if (this.mode !== 'walk') return;
      e.preventDefault();
      this.camera.fov = clamp(this.camera.fov + e.deltaY * 0.03, 35, 85); this.camera.updateProjectionMatrix(); this.dirty = true;
    }, { passive: false });
    // ג׳ויסטיק
    if (joy) {
      const knob = joy.querySelector('.knob'); let jid = null; let c = null;
      joy.addEventListener('pointerdown', e => {
        e.stopPropagation(); jid = e.pointerId; joy.setPointerCapture(e.pointerId);
        const r = joy.getBoundingClientRect(); c = { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 };
      });
      joy.addEventListener('pointermove', e => {
        if (e.pointerId !== jid) return;
        let dx = (e.clientX - c.x) / c.R, dy = (e.clientY - c.y) / c.R;
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        this.joy.set(dx, -dy); knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
      });
      const jend = e => { if (e.pointerId !== jid) return; jid = null; this.joy.set(0, 0); knob.style.transform = ''; };
      joy.addEventListener('pointerup', jend); joy.addEventListener('pointercancel', jend);
    }
  }
  setMode(mode, state) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'walk') {
      this.orbit.enabled = false;
      // עמידה מאחורי האי, מבט אל קיר המטבח
      const p = this.camera.position;
      const inside = this.bounds && p.x > this.bounds.min.x && p.x < this.bounds.max.x && p.z > this.bounds.min.z && p.z < this.bounds.max.z;
      if (!inside || p.y > 2.4) p.set(0.3, EYE, Math.min(state.room.depth - 0.6, (this.standZ || 4)));
      p.y = EYE;
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      this.yaw = Math.atan2(-dir.x, -dir.z); this.pitch = clamp(Math.asin(dir.y), -0.4, 0.2);
      this.camera.fov = 65; this.camera.updateProjectionMatrix();
      this._collide();
    } else {
      this.orbit.enabled = true;
      const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
      this.orbit.target.copy(this.camera.position).addScaledVector(dir, 2.2);
      this.orbit.target.y = clamp(this.orbit.target.y, 0.6, 1.6);
      this.camera.fov = innerWidth < innerHeight ? 68 : 55; this.camera.updateProjectionMatrix();
    }
    this.dirty = true;
  }
  setWorld(state, colliders, standZ) {
    const W = state.room.width, D = state.room.depth;
    this.bounds = new THREE.Box3(new THREE.Vector3(-W / 2 + 0.25, 0, 0.25), new THREE.Vector3(W / 2 - 0.25, 3, D - 0.25));
    this.colliders = colliders; this.standZ = standZ;
    if (this.mode === 'walk') this._collide();
  }
  _collide() {
    const p = this.camera.position; if (!this.bounds) return;
    p.x = clamp(p.x, this.bounds.min.x, this.bounds.max.x);
    p.z = clamp(p.z, this.bounds.min.z, this.bounds.max.z);
    const R = 0.22;
    for (const b of this.colliders) {
      const x0 = b.min.x - R, x1 = b.max.x + R, z0 = b.min.z - R, z1 = b.max.z + R;
      if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) {
        const dx0 = p.x - x0, dx1 = x1 - p.x, dz0 = p.z - z0, dz1 = z1 - p.z;
        const m = Math.min(dx0, dx1, dz0, dz1);
        if (m === dx0) p.x = x0; else if (m === dx1) p.x = x1; else if (m === dz0) p.z = z0; else p.z = z1;
      }
    }
  }
  update(dt) {
    if (this.mode === 'orbit') { const ch = this.orbit.update(); const d = this.dirty; this.dirty = false; return ch || d; }
    let f = 0, r = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) r += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) r -= 1;
    f += this.joy.y; r += this.joy.x;
    let moved = this.dirty; this.dirty = false;
    if (f || r) {
      const sp = 1.5 * dt * (this.keys.has('ShiftLeft') ? 1.8 : 1);
      const fw = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const rt = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.camera.position.addScaledVector(fw, f * sp).addScaledVector(rt, r * sp);
      this._collide(); moved = true;
    }
    this.camera.position.y = EYE;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    return moved;
  }
}
