// מצב התכנון: ברירת מחדל, שמירה בדפדפן, ביטול/חזרה, ייצוא/ייבוא
export const SAHARA = '#d3bf9f';
export const WOOD_TINT = '#f3dcc2';

let _id = 0;
export const uid = (p = 'm') => `${p}${Date.now().toString(36)}${(_id++).toString(36)}`;

const mod = (type, w, extra = {}) => ({ id: uid(), type, w, ...extra });

export function defaultState() {
  return {
    version: 1,
    room: { width: 6.0, depth: 6.2, height: 3.0, wallColor: '#efebe4', floor: 'floor_oak' },
    window: { width: 2.6, height: 0.75, sill: 1.25, center: 3.0 },
    dims: { counterH: 0.90, counterT: 0.03, baseDepth: 0.60, plinth: 0.10, upperDepth: 0.35, upperH: 0.80, upperGap: 0.60 },
    island: { aisle: 1.50, depth: 0.60, overhang: 0.35, offsetX: 0, waterfall: true, stools: 3, pendantH: 0.80,
      backMat: 'walnut', backColor: WOOD_TINT },
    style: {
      counter: 'marble_white', backsplash: 'counter', handle: 'black', faucet: 'black', sink: 'black',
      appliance: 'steel', lighting: 'day', led: true,
    },
    wall: [
      mod('fridge', 0.90, { mat: 'walnut', color: WOOD_TINT }),
      mod('doors', 0.45, { mat: 'lacquer', color: SAHARA, hinge: 'left', upper: { type: 'doors', mat: 'lacquer', color: SAHARA } }),
      mod('dishwasher', 0.60, { mat: 'lacquer', color: SAHARA, upper: { type: 'doors', mat: 'lacquer', color: SAHARA } }),
      mod('drawers', 0.60, { mat: 'lacquer', color: SAHARA, upper: { type: 'doors', mat: 'lacquer', color: SAHARA } }),
      mod('hob', 0.90, { mat: 'lacquer', color: SAHARA, upper: { type: 'hood', mat: 'walnut', color: WOOD_TINT } }),
      mod('drawers', 0.60, { mat: 'lacquer', color: SAHARA, upper: { type: 'doors', mat: 'lacquer', color: SAHARA } }),
      mod('doors', 0.90, { mat: 'lacquer', color: SAHARA, upper: { type: 'lift', mat: 'lacquer', color: SAHARA } }),
      mod('doors', 0.45, { mat: 'lacquer', color: SAHARA, hinge: 'right', upper: { type: 'open', mat: 'walnut', color: WOOD_TINT } }),
      mod('oven', 0.60, { mat: 'walnut', color: WOOD_TINT }),
    ],
    islandModules: [
      mod('drawers', 0.75, { mat: 'walnut', color: WOOD_TINT }),
      mod('sink', 0.90, { mat: 'walnut', color: WOOD_TINT }),
      mod('drawers', 0.75, { mat: 'walnut', color: WOOD_TINT }),
    ],
  };
}

const KEY = 'kitchen-lab-config-v1';
const ASSET_KEY = 'kitchen-lab-assets-v1';

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) { const o = JSON.parse(s); if (o && o.version === 1 && Array.isArray(o.wall)) return migrate(o); }
  } catch (e) { /* ignore */ }
  return defaultState();
}
function migrate(o) {
  const d = defaultState();
  for (const k of ['room', 'window', 'dims', 'island', 'style']) o[k] = { ...d[k], ...(o[k] || {}) };
  o.islandModules ||= d.islandModules;
  return o;
}
function loadAssets() {
  try { return JSON.parse(localStorage.getItem(ASSET_KEY) || '{}') || {}; } catch (e) { return {}; }
}

class Store {
  constructor() {
    this.state = load();
    this.assets = loadAssets(); // { id: { name, data, size } } – תמונות שהועלו
    this.undoStack = []; this.redoStack = [];
    this.pending = null;
    this.listeners = new Set();
    this._saveT = 0;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(reason) { for (const fn of this.listeners) fn(this.state, reason); this.scheduleSave(); }
  snapshot() { return JSON.stringify(this.state); }
  begin() { if (!this.pending) this.pending = this.snapshot(); }
  apply(mut, reason = 'edit') { mut(this.state); this.emit(reason); }
  end() {
    if (!this.pending) return;
    if (this.pending !== this.snapshot()) {
      this.undoStack.push(this.pending); if (this.undoStack.length > 120) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.pending = null; this.emit('history');
  }
  change(mut, reason) { this.begin(); this.apply(mut, reason); this.end(); }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  undo() {
    this.end(); if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot()); this.state = JSON.parse(this.undoStack.pop()); this.emit('undo');
  }
  redo() {
    this.end(); if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot()); this.state = JSON.parse(this.redoStack.pop()); this.emit('redo');
  }
  reset() { this.change(s => { const d = defaultState(); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, d); }, 'reset'); }
  replace(obj) {
    this.change(s => { const m = migrate(obj); for (const k of Object.keys(s)) delete s[k]; Object.assign(s, m); }, 'import');
  }
  addAsset(name, data, size) {
    const id = uid('a'); this.assets[id] = { name, data, size }; this.saveAssets(); return id;
  }
  saveAssets() {
    try { localStorage.setItem(ASSET_KEY, JSON.stringify(this.assets)); return true; }
    catch (e) { console.warn('assets too big for localStorage', e); return false; }
  }
  scheduleSave() {
    clearTimeout(this._saveT);
    this._saveT = setTimeout(() => { try { localStorage.setItem(KEY, this.snapshot()); } catch (e) { /* quota */ } }, 300);
  }
  exportJSON() {
    return JSON.stringify({ app: 'kitchen-lab', state: this.state, assets: this.assets }, null, 1);
  }
  importJSON(text) {
    const o = JSON.parse(text);
    const st = o.state || o;
    if (!st || !Array.isArray(st.wall)) throw new Error('bad file');
    if (o.assets) { Object.assign(this.assets, o.assets); this.saveAssets(); }
    this.replace(st);
  }
}

export const store = new Store();

// עזר: מציאת מודול לפי מזהה
export function findModule(state, id) {
  for (const zone of ['wall', 'islandModules']) {
    const arr = state[zone]; const i = arr.findIndex(m => m.id === id);
    if (i >= 0) return { zone, arr, index: i, m: arr[i] };
  }
  return null;
}

export const TALL_TYPES = new Set(['fridge', 'oven', 'pantry']);
export const isTall = (m) => TALL_TYPES.has(m.type);
