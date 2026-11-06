import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { store, findModule, findItem } from './state.js';
import { MaterialLibrary } from './materials.js';
import { buildRoom, Lighting, islandCenterZ } from './room.js';
import { buildKitchen } from './cabinets.js';
import { Interaction } from './interaction.js';
import { CameraRig, EYE } from './controls.js';
import { Measure, Dimensions } from './measure.js';
import { Editor } from './editor.js';
import { FloorDrag } from './drag.js';
import { ShareDialog, loadFromUrl, showSharedBanner, restoreBackup } from './share.js';
import { disposeTree, isMobile } from './util.js';

// ---------- איכות ----------
const qPref = localStorage.getItem('kitchen-quality') || 'auto';
const quality = qPref === 'auto' ? (isMobile() ? 'medium' : 'high') : qPref;
document.body.classList.add(`q-${quality}`);

// ---------- רנדרר וסצנה ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
const pr = Math.min(devicePixelRatio, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1);
renderer.setPixelRatio(pr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
RectAreaLightUniformsLib.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfc9bf');
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.03, 120);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: 5 });
labelRenderer.domElement.dir = 'ltr';
document.body.appendChild(labelRenderer.domElement);

let composer = null, gtao = null;
if (quality === 'high') {
  const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.28, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1.0 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
}

// ---------- טעינה ----------
const loaderEl = document.getElementById('loader'), loadBar = document.getElementById('load-bar');
const manager = new THREE.LoadingManager();
manager.onProgress = (url, n, total) => { loadBar.style.width = `${Math.round(n / total * 100)}%`; };
const lib = new MaterialLibrary(renderer, manager);
lib.preload();
lib.setAssets(store.assets);
lib.onAssetLoaded = () => requestRender(true);
const ctx = {};
function applyEnv(t) {
  // נטרול חלקי של הגוון החם של ה-HDRI (רצפת עץ) כדי שהלבנים יישארו לבנים
  const a = t.image.data;
  for (let i = 0; i < a.length; i += 4) { const l = a[i] * 0.2126 + a[i + 1] * 0.7152 + a[i + 2] * 0.0722; a[i] = a[i] * 0.45 + l * 0.55; a[i + 1] = a[i + 1] * 0.45 + l * 0.55; a[i + 2] = a[i + 2] * 0.45 + l * 0.55 * 1.04; }
  t.needsUpdate = true;
  t.mapping = THREE.EquirectangularReflectionMapping; scene.environment = t; requestRender();
}
const hdrLoader = new HDRLoader(manager).setDataType(THREE.FloatType);
hdrLoader.load('assets/hdri/lebombo_1k.hdr', applyEnv, undefined, () => {
  // גיבוי: אותו קובץ בקידוד base64 (לאירוח שלא מגיש קבצי ‎.hdr)
  new THREE.FileLoader(manager).load('assets/hdri/lebombo_1k.hdr.txt', (txt) => {
    const bin = atob(txt.trim()); const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const d = hdrLoader.parse(buf.buffer);
    const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RGBAFormat, d.type);
    t.colorSpace = THREE.LinearSRGBColorSpace; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = true;
    applyEnv(t);
  });
});
ctx.outdoorTex = new THREE.TextureLoader(manager).load('assets/hdri/garden.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping; });
ctx.outdoorTex.colorSpace = THREE.SRGBColorSpace;

const lighting = new Lighting(scene, quality);
const inter = new Interaction(camera, canvas);
const rig = new CameraRig(camera, canvas, document.getElementById('joystick'));
const measure = new Measure(scene);
const dims = new Dimensions(scene);

let roomG = null, kitchenG = null, lastK = null;
let needsRender = true;
function requestRender(shadows = false) { needsRender = true; if (shadows) renderer.shadowMap.needsUpdate = true; }

// ---------- אפליקציה ----------
const app = {
  mode: 'view', selected: null,
  select(sel) {
    this.selected = sel;
    updateOutline();
    if (sel) { document.body.classList.add('panel-open'); document.body.classList.remove('panel-min'); syncPanelBtn(); if (editor) editor.setTab('sel'); }
    else if (editor && editor.tab === 'sel') editor.render();
    requestRender();
  },
  setMode(m) {
    if (this.mode === 'measure' && m !== 'measure') measure.cancelPending();
    this.mode = m;
    document.body.classList.remove('mode-view', 'mode-edit', 'mode-measure'); document.body.classList.add(`mode-${m}`);
    for (const b of document.querySelectorAll('#mode-seg button')) b.classList.toggle('on', b.dataset.mode === m);
    if (m === 'edit') { document.body.classList.add('panel-open'); syncPanelBtn(); }
    if (m !== 'edit' && this.selected) this.select(null);
    showHint();
    requestRender();
  },
  toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800); },
  assetsChanged() { lib.setAssets(store.assets); lib.cache.clear(); scheduleRebuild(); },
  exportFile() {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kitchen-design-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.toast('הקובץ יוצא');
  },
  // צילום מוקטן לשליחה (JPEG עד 1280 פיקסלים)
  captureImage() {
    render();
    const k = Math.min(1, 1280 / canvas.width);
    const c = document.createElement('canvas'); c.width = Math.round(canvas.width * k); c.height = Math.round(canvas.height * k);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  },
  openShare() { share.open(); },
  islandBackZ() { return lastK?.island?.zBack; },
  restoreMine() { if (restoreBackup()) { this.select(null); this.toast('התכנון שלך שוחזר'); } },
  screenshot() {
    render();
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'kitchen.png'; a.click();
  },
};
window.__app = { app, store, scene, renderer, camera, rig, inter, lib, get kitchen() { return kitchenG; }, get K() { return lastK; }, quality };

let editor = null;
let share = null;
const drag = new FloorDrag({ canvas, camera, inter, rig, app, requestRender: () => requestRender(), getKitchen: () => kitchenG, getK: () => lastK, getOutline: () => inter.outline });

function findSelectGroup(sel) {
  if (!sel || !kitchenG) return null;
  let found = null;
  kitchenG.traverse(o => { const s = o.userData.select; if (!found && s && s.id === sel.id && s.part === sel.part) found = o; });
  return found;
}
function updateOutline() {
  const g = findSelectGroup(app.selected);
  if (app.selected && !g && !rebuildPending) { app.selected = null; if (editor && editor.tab === 'sel') editor.render(); }
  inter.setOutline(scene, g);
}

// ---------- בנייה מחדש ----------
let rebuildPending = false;
function scheduleRebuild() { rebuildPending = true; }
function rebuild() {
  rebuildPending = false;
  const s = store.state;
  if (roomG) { scene.remove(roomG); disposeTree(roomG); }
  if (kitchenG) { scene.remove(kitchenG); disposeTree(kitchenG); }
  roomG = buildRoom(s, lib, ctx); scene.add(roomG);
  const { group, K } = buildKitchen(s, lib); kitchenG = group; lastK = K; scene.add(kitchenG);
  lighting.update(s);
  const evening = s.style.lighting === 'evening';
  scene.environmentIntensity = evening ? 0.12 : 0.6;
  renderer.toneMappingExposure = evening ? 1.1 : 1.12;
  inter.setTargets([roomG, kitchenG]);
  rig.setWorld(s, K.colliders, K.island ? Math.min(s.room.depth - 0.5, K.island.zBack + 1.1) : s.room.depth - 1);
  dims.build(s, K);
  updateOutline();
  requestRender(true);
}

// ---------- רנדר ----------
function render() {
  if (composer) composer.render(); else renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
const clock = new THREE.Timer();
function frame() {
  requestAnimationFrame(frame);
  clock.update(); const dt = Math.min(clock.getDelta(), 0.05);
  if (rebuildPending) rebuild();
  const moved = rig.update(dt);
  const anim = inter.update(dt);
  if (anim) renderer.shadowMap.needsUpdate = true;
  if (needsRender || moved || anim) { render(); needsRender = false; }
}

// ---------- קלט ----------
const pointers = new Map(); let tapCandidate = null;
canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  tapCandidate = pointers.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null;
});
canvas.addEventListener('pointerup', (e) => {
  pointers.delete(e.pointerId);
  if (!tapCandidate || tapCandidate.id !== e.pointerId) return;
  const d = Math.hypot(e.clientX - tapCandidate.x, e.clientY - tapCandidate.y), dt = performance.now() - tapCandidate.t;
  tapCandidate = null;
  if (d < (e.pointerType === 'touch' ? 12 : 6) && dt < 600) onTap(e.clientX, e.clientY);
});
canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); tapCandidate = null; });
let hoverT = 0;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || pointers.size) return;
  const now = performance.now(); if (now - hoverT < 50) return; hoverT = now;
  if (app.mode === 'measure') { const h = inter.raycast(e.clientX, e.clientY); measure.preview(h?.point); requestRender(); canvas.style.cursor = 'crosshair'; return; }
  const p = inter.pick(e.clientX, e.clientY);
  let dragOk = false; if (app.mode === 'edit' && p) { let o = p.hit.object; while (o) { if (o.userData.drag) { dragOk = true; break; } o = o.parent; } }
  canvas.style.cursor = dragOk ? 'grab' : p && ((app.mode === 'view' && p.openable) || (app.mode === 'edit' && p.select)) ? 'pointer' : '';
});

function onTap(x, y) {
  if (app.mode === 'measure') {
    const h = inter.raycast(x, y); if (!h) return;
    const dist = measure.add(h.point);
    if (dist != null) app.toast(`מרחק: ${Math.round(dist * 1000) / 10} ס״מ`); else showHint('בחר נקודה שנייה');
    requestRender(); return;
  }
  const p = inter.pick(x, y);
  if (app.mode === 'edit') {
    app.select(p?.select ? { id: p.select.id, part: p.select.part } : null);
    return;
  }
  if (p?.openable) {
    const opened = inter.toggle(p.openable);
    const lbl = p.openable.userData.openable.label || '';
    showHint(opened ? `${lbl} נפתח/ה – לחיצה נוספת סוגרת` : `${lbl} נסגר/ה`);
    requestRender(true);
  }
}

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input,select,textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
  else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); }
  else if (k === 'r' && app.selected?.part === 'item') { const id = app.selected.id; store.change(s => { const f = findItem(s, id); if (f) f.it.rot = ((f.it.rot || 0) + (e.shiftKey ? -15 : 15) + 360) % 360; }, 'struct'); }
  else if ((k === 'delete' || k === 'backspace') && app.selected?.part === 'item') { const id = app.selected.id; store.change(s => { const f = findItem(s, id); if (f) f.arr.splice(f.index, 1); }, 'struct'); app.select(null); }
  else if ((k === 'delete' || k === 'backspace') && app.selected && app.selected.part === 'base') {
    const id = app.selected.id; store.change(s => { const f = findModule(s, id); if (f) f.arr.splice(f.index, 1); }, 'struct'); app.select(null);
  } else if (k === 'escape') { app.select(null); measure.cancelPending(); requestRender(); }
});

// מרכז התמונה עובר לאזור הגלוי כשהפאנל פתוח (בטלפון – למעלה, במחשב – שמאלה)
function updateViewOffset() {
  const W = innerWidth, H = innerHeight, b = document.body.classList;
  if (!b.contains('panel-open')) { camera.aspect = W / H; camera.clearViewOffset(); }
  else if (W <= 820) {
    const p = b.contains('panel-min') ? 92 : H * 0.52; const F = Math.max(120, H - p);
    camera.aspect = W / F; camera.setViewOffset(W, F, 0, 0, W, H);
  } else {
    const F = Math.max(200, W - 368); camera.aspect = F / H; camera.setViewOffset(F, H, 0, 0, W, H);
  }
  camera.updateProjectionMatrix(); requestRender();
}
new MutationObserver(updateViewOffset).observe(document.body, { attributes: true, attributeFilter: ['class'] });

addEventListener('resize', () => {
  updateViewOffset();
  renderer.setSize(innerWidth, innerHeight, false);
  composer?.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
  requestRender();
});

// ---------- סרגל כלים ----------
const HINTS = {
  view: 'לחיצה על דלת, מגירה, מקרר, תנור או מדיח – פותחת. גרירה – סיבוב המצלמה',
  edit: 'לחץ על ארון לבחירה • גרור את האי, כיסא או רהיט כדי להזיז אותו על הרצפה',
  measure: 'לחץ על שתי נקודות כדי למדוד מרחק',
};
let hintT = 0;
function showHint(msg) {
  const el = document.getElementById('hint');
  el.textContent = msg || (rig.mode === 'walk' && app.mode === 'view' ? 'הליכה: ג׳ויסטיק / W A S D • גרירה – הסתכלות • לחיצה – פתיחה' : HINTS[app.mode]);
  el.style.opacity = 1; clearTimeout(hintT);
  hintT = setTimeout(() => { el.style.opacity = 0; }, msg ? 2600 : 6000);
}
for (const b of document.querySelectorAll('#mode-seg button')) b.addEventListener('click', () => app.setMode(b.dataset.mode));
for (const b of document.querySelectorAll('#cam-seg button')) b.addEventListener('click', () => {
  rig.setMode(b.dataset.cam, store.state);
  for (const x of document.querySelectorAll('#cam-seg button')) x.classList.toggle('on', x === b);
  document.body.classList.toggle('cam-walk', b.dataset.cam === 'walk');
  showHint(); requestRender();
});
const btnDims = document.getElementById('btn-dims');
btnDims.addEventListener('click', () => { const v = !dims.group.visible; dims.setVisible(v); btnDims.classList.toggle('on', v); requestRender(); });
document.getElementById('btn-undo').addEventListener('click', () => store.undo());
document.getElementById('btn-redo').addEventListener('click', () => store.redo());
const btnPanel = document.getElementById('btn-panel');
function syncPanelBtn() { btnPanel.classList.toggle('on', document.body.classList.contains('panel-open')); }
btnPanel.addEventListener('click', () => { document.body.classList.toggle('panel-open'); document.body.classList.remove('panel-min'); syncPanelBtn(); });
document.getElementById('panel-grip').addEventListener('click', () => document.body.classList.toggle('panel-min'));
document.getElementById('btn-clear-measure').addEventListener('click', () => { measure.clear(); requestRender(); });
document.getElementById('file-import').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { store.importJSON(await f.text()); lib.setAssets(store.assets); app.select(null); app.toast('התכנון יובא בהצלחה'); }
  catch (err) { alert('הקובץ אינו תקין'); }
  e.target.value = '';
});
function updateUndo() {
  document.getElementById('btn-undo').disabled = !store.canUndo();
  document.getElementById('btn-redo').disabled = !store.canRedo();
}
store.on((s, reason) => { updateUndo(); if (reason !== 'history') scheduleRebuild(); });

// ---------- הפעלה ----------
manager.onLoad = async () => {
  const loaded = await loadFromUrl();
  rebuild();
  const s = store.state, iz = islandCenterZ(s);
  camera.position.set(1.9, 1.85, Math.min(s.room.depth - 0.35, iz + 2.7));
  rig.orbit.target.set(-0.1, 1.05, 0.9);
  if (innerWidth < innerHeight) { camera.fov = 68; camera.position.set(1.6, 1.9, Math.min(s.room.depth - 0.3, iz + 2.9)); rig.orbit.target.set(0, 1.0, 1.2); }
  camera.updateProjectionMatrix();
  rig.orbit.update();
  editor = new Editor(app);
  share = new ShareDialog(app);
  document.getElementById('btn-share').addEventListener('click', () => share.open());
  if (loaded?.state) showSharedBanner(loaded, () => app.restoreMine());
  else if (loaded?.error) app.toast('לא הצלחתי לפתוח את התכנון ששותף');
  app.setMode('view');
  updateUndo();
  if (!isMobile() && innerWidth > 1100) { document.body.classList.add('panel-open'); syncPanelBtn(); }
  // קומפילציה מוקדמת של השיידרים כדי למנוע קפיצות
  renderer.compile(scene, camera);
  renderer.shadowMap.needsUpdate = true;
  render();
  loaderEl.classList.add('done');
  setTimeout(() => loaderEl.remove(), 700);
  window.__app.ready = true;
  frame();
};
manager.onError = (url) => { if (!url.endsWith('.hdr')) document.getElementById('load-sub').textContent = `שגיאה בטעינת ${url}`; };
