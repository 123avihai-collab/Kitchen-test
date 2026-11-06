import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const cm = (m) => `${Math.round(m * 1000) / 10}`;

/**
 * UV במטרים לפי הקרנת קופסה (box projection) – מרקמים בקנה מידה אמיתי ורציפים בין חזיתות.
 * offset – מיקום עולמי של מרכז הגאומטריה, כדי שהטקסטורה "תזרום" בין חלקים סמוכים.
 */
export function boxUV(geo, offset = null, rotate = false) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const ox = offset ? offset.x : 0, oy = offset ? offset.y : 0, oz = offset ? offset.z : 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox, y = pos.getY(i) + oy, z = pos.getZ(i) + oz;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = x; v = z; }
    else if (ax >= az) { u = z; v = y; }
    else { u = x; v = y; }
    if (rotate) { const t = u; u = v; v = t; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

const _geoCache = new Map();
/** קופסה בגודל w×h×d, ממוקמת לפי מרכז (x,y,z). round – רדיוס פינה. */
export function box(w, h, d, mat, x = 0, y = 0, z = 0, opts = {}) {
  const r = opts.round || 0;
  let geo;
  if (r > 0 && Math.min(w, h, d) > r * 2.2) geo = new RoundedBoxGeometry(w, h, d, 2, r);
  else geo = new THREE.BoxGeometry(w, h, d);
  if (opts.uv !== false) boxUV(geo, new THREE.Vector3(x + (opts.uvOff?.x || 0), y + (opts.uvOff?.y || 0), z + (opts.uvOff?.z || 0)), opts.rotUV);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  return m;
}

export function cyl(rTop, rBot, h, mat, seg = 24, opts = {}) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, !!opts.open);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.cast !== false; m.receiveShadow = true;
  return m;
}

/** גאומטריית מלבן מעוגל (Shape) */
export function roundRectShape(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
export function roundRectPath(w, h, r, cx = 0, cy = 0) {
  const p = new THREE.Path();
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

export function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.isCSS2DObject && o.element?.parentNode) o.element.parentNode.removeChild(o.element);
  });
}

export const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export const isMobile = () => isTouch() && Math.min(screen.width, screen.height) < 900;

export function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
