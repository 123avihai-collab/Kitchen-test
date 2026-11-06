import * as THREE from 'three';
import { canvasTexture } from './util.js';

// ספריית חומרים מבוססי פיזיקה (PBR) עם טקסטורות אמיתיות (Poly Haven / ambientCG, רישיון CC0)
const TEX = 'assets/textures/';

// גודל אריח הטקסטורה במטרים (כמה מטרים מכסה תמונה אחת)
export const TEXTURE_SETS = {
  walnut: { size: 1.1, label: 'עץ אגוז' },
  oak: { size: 1.1, label: 'עץ אלון' },
  floor_oak: { size: 1.6, label: 'פרקט אלון בהיר' },
  floor_herringbone: { size: 1.3, label: 'פרקט אדרי (פישבון)' },
  floor_dark: { size: 1.8, label: 'פרקט עץ כהה' },
  marble_white: { size: 1.7, label: 'שיש לבן – עורקי שמנת/חום' },
  marble_carrara: { size: 1.4, label: 'שיש לבן קררה' },
  marble_cream: { size: 1.4, label: 'שיש קרם' },
  marble_black: { size: 1.4, label: 'שיש שחור' },
  zellige: { size: 0.9, label: 'אריחי זליג׳ לבנים' },
  leather: { size: 0.6, label: 'עור קוניאק' },
  plaster: { size: 2.0, label: 'טיח' },
};

export const FRONT_MATS = [
  { key: 'lacquer', label: 'לכה מט (צבע)' },
  { key: 'walnut', label: 'עץ אגוז' },
  { key: 'oak', label: 'עץ אלון' },
];
export const COUNTER_MATS = ['marble_white', 'marble_carrara', 'marble_cream', 'marble_black'];
export const FLOOR_MATS = ['floor_oak', 'floor_herringbone', 'floor_dark', 'marble_carrara'];

export const SWATCHES = [
  { c: '#d3bf9f', n: 'סהרה' }, { c: '#efe9df', n: 'לבן שמנת' }, { c: '#c9c1b4', n: 'קשמיר' },
  { c: '#9a9a8a', n: 'זית אפור' }, { c: '#8b9a86', n: 'מרווה' }, { c: '#5a5f63', n: 'גרפיט' },
  { c: '#2a2c2e', n: 'שחור' }, { c: '#2f3d4f', n: 'כחול לילה' }, { c: '#b07656', n: 'טרקוטה' },
];
export const WOOD_TINTS = [
  { c: '#f3dcc2', n: 'חום תה' }, { c: '#ffffff', n: 'טבעי' }, { c: '#d9b99b', n: 'כהה' }, { c: '#fff0dc', n: 'בהיר' },
];
export const WALL_SWATCHES = [
  { c: '#efebe4', n: 'לבן חם' }, { c: '#f6f6f3', n: 'לבן' }, { c: '#e3dbcd', n: 'חול' },
  { c: '#d5d2c8', n: 'אבן' }, { c: '#c7cfc3', n: 'מרווה' }, { c: '#8e8a83', n: 'אפור חם' },
];

export class MaterialLibrary {
  constructor(renderer, manager) {
    this.loader = new THREE.TextureLoader(manager);
    this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.sets = {};
    this.cache = new Map();
    this.custom = new Map(); // id -> texture
    this.assets = {};
  }

  // טעינת כל הטקסטורות מראש
  preload() {
    for (const key of Object.keys(TEXTURE_SETS)) {
      const isPlaster = key === 'plaster';
      this.sets[key] = {
        map: isPlaster ? null : this.tex(`${TEX}${key}/color.jpg`, true),
        normalMap: this.tex(`${TEX}${key}/normal.jpg`, false),
        roughnessMap: this.tex(`${TEX}${key}/rough.jpg`, false),
        size: TEXTURE_SETS[key].size,
      };
    }
  }
  tex(url, srgb) {
    const t = this.loader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  setAssets(assets) {
    this.assets = assets;
    for (const [id, a] of Object.entries(assets)) {
      if (this.custom.has(id)) continue;
      const img = new Image(); img.src = a.data;
      const t = new THREE.Texture(img);
      img.onload = () => { t.needsUpdate = true; this.onAssetLoaded?.(); };
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.maxAniso;
      this.custom.set(id, t);
    }
  }

  // חזרה על הטקסטורה לפי גודלה במטרים (UV של הגאומטריה הוא במטרים)
  applySet(mat, key, scaleNormal = 1, rot = 0) {
    const s = this.sets[key]; if (!s) return;
    const rep = 1 / s.size;
    for (const slot of ['map', 'normalMap', 'roughnessMap']) {
      if (!s[slot]) continue;
      const t = s[slot].clone(); // משתף את אותה תמונה ב-GPU
      t.repeat.set(rep, rep); t.rotation = rot; t.needsUpdate = true;
      mat[slot] = t;
    }
    if (mat.normalScale) mat.normalScale.set(scaleNormal, scaleNormal);
  }

  get(key, build) {
    if (!this.cache.has(key)) this.cache.set(key, build());
    return this.cache.get(key);
  }

  /** חזית/גוף ארון: mat = lacquer | walnut | oak | marble_* | custom:<id>, color = צבע או גוון */
  front(mat = 'lacquer', color = '#d3bf9f') {
    return this.get(`front|${mat}|${color}`, () => {
      if (mat.startsWith('custom:')) return this.customMat(mat.slice(7), color);
      if (mat === 'walnut' || mat === 'oak') {
        const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.85, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45 });
        this.applySet(m, mat, 0.5); return m;
      }
      if (mat.startsWith('marble')) return this.stone(mat);
      // לכה מט – צבע אחיד, מעט ברק סאטן
      return new THREE.MeshPhysicalMaterial({ color, roughness: 0.48, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, sheen: 0.15, sheenRoughness: 0.8, sheenColor: new THREE.Color(color) });
    });
  }
  customMat(id, color = '#ffffff') {
    const t0 = this.custom.get(id); const a = this.assets[id];
    const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.55, clearcoat: 0.15 });
    if (t0) { const t = t0.clone(); const rep = 1 / ((a && a.size) || 0.6); t.repeat.set(rep, rep); t.needsUpdate = true; m.map = t; }
    return m;
  }
  stone(key) {
    return this.get(`stone|${key}`, () => {
      if (key.startsWith('custom:')) { const m = this.customMat(key.slice(7)); m.roughness = 0.25; m.clearcoat = 0.6; return m; }
      const m = new THREE.MeshPhysicalMaterial({ color: key === 'marble_white' ? '#eef2f6' : '#ffffff', roughness: 0.55, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.12 });
      this.applySet(m, key, 0.25);
      return m;
    });
  }
  floor(key) {
    return this.get(`floor|${key}`, () => {
      if (key.startsWith('custom:')) { const m = this.customMat(key.slice(7)); m.roughness = 0.6; return m; }
      if (key.startsWith('marble')) { const m = this.stone(key).clone(); return m; }
      const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.9, clearcoat: 0.25, clearcoatRoughness: 0.35 });
      this.applySet(m, key, 0.6);
      return m;
    });
  }
  wall(color) {
    return this.get(`wall|${color}`, () => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
      this.applySet(m, 'plaster', 0.18);
      m.shadowSide = THREE.DoubleSide;
      return m;
    });
  }
  backsplash(kind, counterKey) {
    if (kind === 'counter') return this.stone(counterKey);
    if (kind === 'zellige') return this.get('zellige', () => {
      const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.6, clearcoat: 0.8, clearcoatRoughness: 0.08 });
      this.applySet(m, 'zellige', 1.0); return m;
    });
    if (kind.startsWith('custom:')) return this.get(`bs|${kind}`, () => { const m = this.customMat(kind.slice(7)); m.clearcoat = 0.6; m.roughness = 0.35; return m; });
    return null; // צבע קיר
  }
  leather() {
    return this.get('leather', () => { const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.75, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color('#8a5a36') }); this.applySet(m, 'leather', 0.8); return m; });
  }

  // מתכות וחומרים קבועים
  metal(kind) {
    return this.get(`metal|${kind}`, () => {
      switch (kind) {
        case 'black': return new THREE.MeshPhysicalMaterial({ color: '#141414', metalness: 0.75, roughness: 0.42, clearcoat: 0.1 });
        case 'gold': return new THREE.MeshPhysicalMaterial({ color: '#c9a46a', metalness: 1, roughness: 0.3 });
        case 'steel': return new THREE.MeshPhysicalMaterial({ color: '#8d9093', metalness: 1, roughness: 0.4, anisotropy: 0.5 });
        case 'darksteel': return new THREE.MeshPhysicalMaterial({ color: '#4a4b4d', metalness: 1, roughness: 0.32, anisotropy: 0.6 });
        case 'chrome': return new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 1, roughness: 0.08 });
        default: return new THREE.MeshStandardMaterial({ color: '#888' });
      }
    });
  }
  applianceSkin(kind) { return kind === 'black' ? this.metal('darksteel') : this.metal('steel'); }

  get blackGlass() { return this.get('blackGlass', () => new THREE.MeshPhysicalMaterial({ color: '#060606', roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, reflectivity: 0.6 })); }
  get glass() { return this.get('glass', () => new THREE.MeshPhysicalMaterial({ color: '#e8f2ef', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false, clearcoat: 1, side: THREE.DoubleSide })); }
  get shelfGlass() { return this.get('shelfGlass', () => new THREE.MeshPhysicalMaterial({ color: '#cfe3df', roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false })); }
  get carcass() { return this.get('carcass', () => new THREE.MeshStandardMaterial({ color: '#e9e6e0', roughness: 0.62 })); }
  get carcassDark() { return this.get('carcassDark', () => new THREE.MeshStandardMaterial({ color: '#3b3b3d', roughness: 0.55, metalness: 0.2 })); }
  get plinth() { return this.get('plinth', () => new THREE.MeshStandardMaterial({ color: '#2b2a29', roughness: 0.7 })); }
  get fridgeLiner() { return this.get('fridgeLiner', () => new THREE.MeshPhysicalMaterial({ color: '#f4f6f7', roughness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.08, clearcoat: 0.5 })); }
  get enamel() { return this.get('enamel', () => new THREE.MeshPhysicalMaterial({ color: '#15181b', roughness: 0.35, metalness: 0.2, clearcoat: 0.6 })); }
  get ceramic() { return this.get('ceramic', () => new THREE.MeshPhysicalMaterial({ color: '#f4f1ea', roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.05 })); }
  get ceramicDark() { return this.get('ceramicDark', () => new THREE.MeshPhysicalMaterial({ color: '#3a3632', roughness: 0.5, clearcoat: 0.6 })); }
  get rubber() { return this.get('rubber', () => new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 })); }
  get sinkBlack() { return this.get('sinkBlack', () => new THREE.MeshPhysicalMaterial({ color: '#1d1d1e', roughness: 0.6, metalness: 0, clearcoat: 0.2 })); }
  get led() { return this.get('led', () => new THREE.MeshStandardMaterial({ color: '#fff3dd', emissive: '#ffd59a', emissiveIntensity: 4, roughness: 1 })); }
  get bulb() { return this.get('bulb', () => new THREE.MeshStandardMaterial({ color: '#fff8ea', emissive: '#ffcf87', emissiveIntensity: 9, roughness: 1 })); }
  get coolLight() { return this.get('coolLight', () => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#eef6ff', emissiveIntensity: 2.5 })); }
  get warmLight() { return this.get('warmLight', () => new THREE.MeshStandardMaterial({ color: '#ffe8c4', emissive: '#ffb257', emissiveIntensity: 2.2 })); }
  get pendantInner() { return this.get('pendantInner', () => new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.35, emissive: '#ffe2b8', emissiveIntensity: 0.35 })); }
  get antiSlip() { return this.get('antiSlip', () => new THREE.MeshStandardMaterial({ color: '#4a4a4c', roughness: 0.95 })); }
  get wood() { return this.front('walnut', '#f3dcc2'); }
  get plant() { return this.get('plant', () => new THREE.MeshStandardMaterial({ color: '#3f6b3a', roughness: 0.7, side: THREE.DoubleSide })); }

  // טקסטורת לוח מגע לכיריים אינדוקציה
  get hobTop() {
    return this.get('hobTop', () => {
      const t = canvasTexture(1024, 896, (g, w, h) => {
        g.fillStyle = '#050506'; g.fillRect(0, 0, w, h);
        const rings = [[0.28, 0.30, 0.20], [0.72, 0.30, 0.15], [0.28, 0.70, 0.15], [0.72, 0.68, 0.19]];
        g.strokeStyle = 'rgba(150,150,150,0.55)'; g.lineWidth = 3;
        for (const [x, y, r] of rings) {
          g.beginPath(); g.arc(x * w, y * h, r * w * 0.8, 0, Math.PI * 2); g.stroke();
          for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
            g.beginPath(); g.moveTo(x * w + Math.cos(a) * r * w * 0.8, y * h + Math.sin(a) * r * w * 0.8);
            g.lineTo(x * w + Math.cos(a) * r * w * 0.88, y * h + Math.sin(a) * r * w * 0.88); g.stroke();
          }
        }
        // פס מגע
        g.fillStyle = 'rgba(200,200,200,0.75)'; g.font = '26px sans-serif'; g.textAlign = 'center';
        for (let i = 0; i < 9; i++) { g.fillRect(w * 0.3 + i * w * 0.05, h * 0.935, w * 0.03, 3); }
        g.fillText('–', w * 0.24, h * 0.95); g.fillText('+', w * 0.76, h * 0.95);
        g.beginPath(); g.arc(w * 0.88, h * 0.93, 12, 0, Math.PI * 2); g.stroke();
      });
      return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 });
    });
  }
  get ovenDisplay() {
    return this.get('ovenDisplay', () => {
      const t = canvasTexture(512, 64, (g, w, h) => {
        g.fillStyle = '#070707'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#ffffff'; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('18:30', w / 2, h / 2 + 2);
        g.fillStyle = '#ff9f43'; g.font = '24px sans-serif'; g.fillText('180°', w * 0.18, h / 2 + 2); g.fillText('▣', w * 0.82, h / 2);
      });
      return new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.1 });
    });
  }
  // רשת מתכת לסלסלות מדיח / מדפי תנור
  get wireRack() {
    return this.get('wireRack', () => {
      const t = canvasTexture(256, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h); g.strokeStyle = '#ffffff'; g.lineWidth = 5;
        for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 8); g.lineTo(w, i * h / 8); g.stroke(); }
      }, false);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
      return new THREE.MeshStandardMaterial({ color: '#b9bcc0', metalness: 0.9, roughness: 0.35, alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide });
    });
  }
  get outline() { return this.get('outline', () => new THREE.LineBasicMaterial({ color: '#ff7a1a', depthTest: false, transparent: true })); }
}
