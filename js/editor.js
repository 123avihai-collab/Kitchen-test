import { store, findModule, findItem, isTall, uid, SAHARA, WOOD_TINT } from './state.js';
import { ITEM_TYPES, stoolRow } from './items.js';
import { TYPE_LABELS, UPPER_LABELS } from './cabinets.js';
import { hasBackup } from './share.js';
import { FRONT_MATS, SWATCHES, WOOD_TINTS, WALL_SWATCHES, TEXTURE_SETS, COUNTER_MATS, FLOOR_MATS } from './materials.js';

// פאנל העריכה בעברית
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const r1 = (v) => Math.round(v * 10) / 10;
const toCm = (m) => r1(m * 100);

const WALL_TYPES = ['doors', 'drawers', 'open', 'dishwasher', 'hob', 'fridge', 'oven', 'pantry'];
const ISLAND_TYPES = ['doors', 'drawers', 'open', 'dishwasher', 'sink'];
const UPPER_TYPES = ['doors', 'lift', 'open', 'hood', 'none'];
const TABS = [['sel', 'בחירה'], ['mods', 'מודולים'], ['room', 'חדר'], ['island', 'אי'], ['mat', 'חומרים'], ['file', 'קובץ']];

export class Editor {
  constructor(app) {
    this.app = app;
    this.tab = 'sel';
    this.tabsEl = document.getElementById('tabs');
    this.body = document.getElementById('panel-body');
    this.matTarget = 'wallBase';
    this.matPick = { mat: 'lacquer', color: SAHARA };
    this.addType = { wall: 'drawers', islandModules: 'drawers' };
    this.addW = { wall: 60, islandModules: 60 };
    this.renderTabs();
    this.render();
    store.on((s, reason) => {
      if (reason === 'panel') { this.refreshStatus(); return; }
      if (reason === 'history' || reason === 'edit') return;
      this.render();
    });
  }
  setTab(t) { this.tab = t; this.renderTabs(); this.render(); this.body.scrollTop = 0; }
  renderTabs() {
    this.tabsEl.replaceChildren(...TABS.map(([k, n]) => h('button', { class: this.tab === k ? 'on' : '', onclick: () => this.setTab(k) }, n)));
  }
  render() {
    const fn = { sel: this.selTab, mods: this.modsTab, room: this.roomTab, island: this.islandTab, mat: this.matTab, file: this.fileTab }[this.tab];
    const st = this.body.scrollTop;
    this.body.replaceChildren(...[fn.call(this)].flat());
    this.body.scrollTop = st;
  }
  refreshStatus() {
    const el = this.body.querySelector('[data-status]');
    if (el) el.replaceWith(this.wallStatus());
  }

  // ---------- רכיבי טופס ----------
  num(label, getM, setM, min, max, step = 1, unit = 'ס״מ') {
    const v = toCm(getM());
    const rng = h('input', { type: 'range', min, max, step, value: v });
    const inp = h('input', { type: 'number', min, max, step, value: v, inputmode: 'decimal' });
    const apply = (cmv, final) => {
      cmv = Math.max(min, Math.min(max, Number(cmv))); if (!isFinite(cmv)) return;
      store.begin(); store.apply(s => setM(s, cmv / 100), 'panel'); if (final) store.end();
    };
    rng.addEventListener('input', () => { inp.value = rng.value; apply(rng.value, false); });
    rng.addEventListener('change', () => { store.end(); });
    inp.addEventListener('change', () => { rng.value = inp.value; apply(inp.value, true); inp.value = toCm(getM()); });
    return h('div', { class: 'field' }, h('label', {}, h('span', {}, label), h('span', { class: 'num' }, inp, h('span', {}, unit))), rng);
  }
  select(label, value, options, onChange) {
    const sel = h('select', { onchange: (e) => onChange(e.target.value) }, ...options.map(([k, n]) => h('option', { value: k, selected: k === value }, n)));
    return h('div', { class: 'field' }, label ? h('label', {}, label) : null, sel);
  }
  chips(label, value, options, onChange) {
    return h('div', { class: 'field' }, label ? h('label', {}, label) : null,
      h('div', { class: 'chips' }, ...options.map(([k, n]) => h('button', { class: 'chip' + (k === value ? ' on' : ''), onclick: () => onChange(k) }, n))));
  }
  swatches(label, value, list, onChange) {
    const pick = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#cccccc' });
    pick.addEventListener('input', () => { store.begin(); store.apply(s => onChange(pick.value, s), 'panel'); });
    pick.addEventListener('change', () => { store.end(); this.render(); });
    return h('div', { class: 'field' }, label ? h('label', {}, label) : null,
      h('div', { class: 'swatches' },
        ...list.map(({ c, n }) => h('button', { class: 'sw' + (c.toLowerCase() === (value || '').toLowerCase() ? ' on' : ''), title: n, style: `background:${c}`, onclick: () => store.change(s => onChange(c, s), 'struct') })),
        h('label', { class: 'sw picker', title: 'צבע חופשי' }, pick)));
  }
  matOptions(includeMarble = false) {
    const opts = FRONT_MATS.map(m => [m.key, m.label]);
    if (includeMarble) for (const k of COUNTER_MATS) opts.push([k, TEXTURE_SETS[k].label]);
    for (const [id, a] of Object.entries(store.assets)) opts.push([`custom:${id}`, `תמונה: ${a.name}`]);
    opts.push(['__upload', '⬆ העלאת תמונה של חזית…']);
    return opts;
  }
  finishEditor(obj, setter) {
    const isWood = obj.mat === 'walnut' || obj.mat === 'oak';
    const isLacquer = !obj.mat || obj.mat === 'lacquer';
    return [
      this.select('חומר', obj.mat || 'lacquer', this.matOptions(true), (v) => {
        if (v === '__upload') return this.upload(0.6, (id) => store.change(s => setter(s, { mat: `custom:${id}` }), 'struct'));
        store.change(s => setter(s, { mat: v, color: (v === 'walnut' || v === 'oak') ? WOOD_TINT : (v === 'lacquer' ? SAHARA : '#ffffff') }), 'struct');
      }),
      isLacquer ? this.swatches('צבע', obj.color, SWATCHES, (c, s) => setter(s, { color: c })) :
        isWood ? this.swatches('גוון העץ', obj.color, WOOD_TINTS, (c, s) => setter(s, { color: c })) : null,
    ];
  }

  // ---------- טאב בחירה ----------
  selTab() {
    const sel = this.app.selected;
    const st = store.state;
    if (sel && sel.part === 'item') return this.itemPanel(sel.id);
    const f = sel && findModule(st, sel.id);
    if (!f) {
      return h('div', { class: 'empty', html: `<b>לחץ על ארון במודל</b> כדי לבחור אותו ולשנות רוחב, גובה, סוג, חומר וצבע.<br><br>במצב <b>עריכה</b> לחיצה בוחרת. במצב <b>צפייה</b> לחיצה פותחת דלתות ומגירות.<br><br>אפשר גם לבחור מהרשימה בטאב <b>מודולים</b>.` });
    }
    const { m, zone, index, arr } = f;
    const zoneName = zone === 'wall' ? 'קיר המטבח' : 'אי';
    const out = [];
    const set = (mut) => (s) => { const x = findModule(s, m.id); if (x) mut(x.m, s); };
    if (sel.part === 'upper' && m.upper) {
      const u = m.upper;
      out.push(h('div', { class: 'sel-title' }, `ארון עליון – ${UPPER_LABELS[u.type]}`), h('div', { class: 'sel-sub' }, `${zoneName} • מעל מודול ${index + 1} • רוחב ${toCm(m.w)} ס״מ (לפי התחתון)`));
      out.push(this.select('סוג', u.type, UPPER_TYPES.map(t => [t, UPPER_LABELS[t]]), (v) => store.change(set(x => { x.upper.type = v; }), 'struct')));
      out.push(...this.finishEditor(u, (s, patch) => { const x = findModule(s, m.id); Object.assign(x.m.upper, patch); }));
      out.push(this.num('גובה העליונים (לכל המטבח)', () => st.dims.upperH, (s, v) => { s.dims.upperH = v; }, 40, 120, 1));
      out.push(h('div', { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'btn', onclick: () => this.app.select({ id: m.id, part: 'base' }) }, 'בחר את הארון התחתון'),
        h('button', { class: 'btn danger', onclick: () => store.change(set(x => { x.upper.type = 'none'; }), 'struct') }, 'הסר עליון')));
      return out;
    }
    out.push(h('div', { class: 'sel-title' }, TYPE_LABELS[m.type] || m.type), h('div', { class: 'sel-sub' }, `${zoneName} • מודול ${index + 1} מתוך ${arr.length}`));
    if (zone === 'islandModules') out.push(h('div', { class: 'status' }, '✥ גרור את האי במודל כדי להזיז אותו (המעבר מתעדכן)'));
    if (zone === 'wall') out.push(this.wallStatus());
    out.push(this.num('רוחב', () => findModule(store.state, m.id)?.m.w || m.w, (s, v) => { const x = findModule(s, m.id); if (x) x.m.w = v; }, isTall(m) ? 40 : 15, 150, 1));
    if (isTall(m)) out.push(this.num('גובה הטור', () => findModule(store.state, m.id)?.m.h || st.room.height, (s, v) => { const x = findModule(s, m.id); if (x) x.m.h = v; }, 200, Math.round(st.room.height * 100), 1));
    const types = zone === 'wall' ? WALL_TYPES : ISLAND_TYPES;
    out.push(this.select('סוג', m.type, types.map(t => [t, TYPE_LABELS[t]]), (v) => store.change(set((x) => {
      x.type = v;
      if (isTall(x)) { delete x.upper; if (v === 'fridge' && x.w < 0.7) x.w = 0.9; }
      else if (zone === 'wall' && !x.upper) x.upper = { type: v === 'hob' ? 'hood' : 'doors', mat: 'lacquer', color: SAHARA };
      if (v === 'hob' && x.upper) x.upper.type = 'hood';
    }), 'struct')));
    if ((m.type === 'doors' || m.type === 'pantry' || m.type === 'oven') && m.w <= 0.62) {
      out.push(this.chips('צד ציר הדלת', m.hinge || (m.type === 'oven' ? 'right' : 'left'), [['left', 'שמאל'], ['right', 'ימין']], (v) => store.change(set(x => { x.hinge = v; }), 'struct')));
    }
    out.push(...this.finishEditor(m, (s, patch) => { const x = findModule(s, m.id); Object.assign(x.m, patch); }));
    if (zone === 'wall' && !isTall(m)) {
      const u = m.upper || { type: 'none' };
      out.push(h('h3', {}, 'ארון עליון מעל'));
      out.push(this.select(null, u.type, UPPER_TYPES.map(t => [t, UPPER_LABELS[t]]), (v) => store.change(set(x => { x.upper = { mat: 'lacquer', color: SAHARA, ...(x.upper || {}), type: v }; }), 'struct')));
      if (u.type !== 'none') out.push(h('button', { class: 'btn small', onclick: () => this.app.select({ id: m.id, part: 'upper' }) }, 'ערוך את הארון העליון'));
    }
    out.push(h('h3', {}, 'מיקום ופעולות'));
    // בקיר: index קטן = שמאל. באי (מסובב 180°): index קטן = ימין למי שיושב מול הקיר
    const leftDelta = zone === 'wall' ? -1 : 1;
    const move = (delta) => store.change(s => {
      const x = findModule(s, m.id); const j = x.index + delta; if (j < 0 || j >= x.arr.length) return;
      [x.arr[x.index], x.arr[j]] = [x.arr[j], x.arr[x.index]];
    }, 'struct');
    out.push(h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => move(-leftDelta) }, 'הזז ימינה ▶'),
      h('button', { class: 'btn', onclick: () => move(leftDelta) }, '◀ הזז שמאלה')));
    out.push(h('div', { class: 'row', style: 'margin-top:6px' },
      h('button', { class: 'btn', onclick: () => { const id = uid(); store.change(s => { const x = findModule(s, m.id); const c = JSON.parse(JSON.stringify(x.m)); c.id = id; x.arr.splice(x.index + 1, 0, c); }, 'struct'); this.app.select({ id, part: 'base' }); } }, 'שכפל'),
      h('button', { class: 'btn danger', onclick: () => { store.change(s => { const x = findModule(s, m.id); x.arr.splice(x.index, 1); }, 'struct'); this.app.select(null); } }, 'מחק מודול')));
    out.push(h('p', { class: 'note' }, 'טיפ: "הזז" מחליף מקום עם המודול השכן. אחרי שינוי רוחב אפשר להשתמש ב"התאם לרוחב הקיר" בטאב מודולים.'));
    return out;
  }

  itemPanel(id) {
    const f = findItem(store.state, id);
    if (!f) return h('div', { class: 'empty' }, 'הפריט לא נמצא');
    const it = f.it, T = ITEM_TYPES[it.type] || { label: it.type };
    const set = (mut) => store.change(s => { const x = findItem(s, id); if (x) mut(x.it); }, 'struct');
    const rot = (d) => set(x => { x.rot = ((x.rot || 0) + d + 360) % 360; });
    return [
      h('div', { class: 'sel-title' }, T.label), h('div', { class: 'sel-sub' }, 'פריט חופשי על הרצפה'),
      h('div', { class: 'status' }, '✥ גרור את הפריט במודל כדי להזיז אותו. הוא נשאר צמוד לרצפה ולא נכנס בקירות, בארונות או באי.'),
      this.num('מיקום לרוחב (0 = מרכז קיר המטבח)', () => findItem(store.state, id)?.it.x ?? 0, (s, v) => { const x = findItem(s, id); if (x) x.it.x = v; }, -Math.round(store.state.room.width * 50), Math.round(store.state.room.width * 50), 1),
      this.num('מרחק מקיר המטבח', () => findItem(store.state, id)?.it.z ?? 0, (s, v) => { const x = findItem(s, id); if (x) x.it.z = v; }, 0, Math.round(store.state.room.depth * 100), 1),
      h('div', { class: 'field' }, h('label', {}, `סיבוב: ${Math.round(it.rot || 0)}°`),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => rot(-15) }, '↻ 15°'), h('button', { class: 'btn', onclick: () => rot(-90) }, '↻ 90°'),
          h('button', { class: 'btn', onclick: () => rot(90) }, '↺ 90°'), h('button', { class: 'btn', onclick: () => rot(15) }, '↺ 15°'))),
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn', onclick: () => { const nid = uid('it'); store.change(s => { const x = findItem(s, id); s.items.splice(x.index + 1, 0, { ...x.it, id: nid, x: x.it.x + 0.5 }); }, 'struct'); this.app.select({ id: nid, part: 'item', zone: 'items' }); } }, 'שכפל'),
        h('button', { class: 'btn danger', onclick: () => { store.change(s => { const x = findItem(s, id); if (x) x.arr.splice(x.index, 1); }, 'struct'); this.app.select(null); } }, 'מחק')),
    ];
  }
  addItem(type) {
    const id = uid('it'); const s = store.state;
    const z = Math.min(s.room.depth - 0.8, (this.app.islandBackZ?.() ?? s.room.depth - 1.5) + 1.0);
    store.change(st => { (st.items ||= []).push({ id, type, x: 0, z, rot: type === 'stool' ? 180 : 0 }); }, 'struct');
    this.app.select({ id, part: 'item', zone: 'items' });
    this.app.toast('הפריט נוסף – גרור אותו למקום');
  }

  wallStatus() {
    const s = store.state; const sum = s.wall.reduce((a, m) => a + m.w, 0); const W = s.room.width;
    const diff = Math.round((sum - W) * 1000) / 10;
    const cls = Math.abs(diff) < 0.5 ? 'status' : diff < 0 ? 'status warn' : 'status err';
    const txt = Math.abs(diff) < 0.5 ? `✓ המודולים ממלאים את הקיר (${toCm(sum)} / ${toCm(W)} ס״מ)` :
      diff < 0 ? `נשארו ${-diff} ס״מ פנויים (ימולאו בפנל מילוי)` : `חריגה של ${diff} ס״מ מאורך הקיר!`;
    return h('div', { class: cls, 'data-status': '1' }, txt);
  }

  // ---------- טאב מודולים ----------
  modsTab() {
    const s = store.state; const out = [];
    const list = (zone, title) => {
      const arr = s[zone];
      const sorted = zone === 'wall' ? arr : arr;
      out.push(h('h3', {}, title));
      if (zone === 'wall') {
        out.push(this.wallStatus());
        out.push(h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => this.fitWall() }, 'התאם לרוחב הקיר'), h('span', { class: 'note', style: 'flex:2;align-self:center' }, 'משנה את רוחב הארונות התחתונים כדי למלא בדיוק')));
        out.push(h('p', { class: 'note' }, 'הסדר משמאל לימין, למי שמסתכל על קיר המטבח.'));
      } else out.push(h('p', { class: 'note' }, `אורך האי: ${toCm(arr.reduce((a, m) => a + m.w, 0))} ס״מ (ללא מפל השיש).`));
      out.push(h('div', { class: 'list' }, ...sorted.map((m, i) => {
        const on = this.app.selected?.id === m.id;
        return h('div', { class: 'it' + (on ? ' on' : ''), onclick: () => { this.app.select({ id: m.id, part: 'base' }); this.setTab('sel'); } },
          h('span', { class: 'n' }, String(i + 1)),
          h('span', { class: 'tag', style: `background:${m.mat === 'walnut' ? '#7a4f32' : m.mat === 'oak' ? '#b8895a' : (m.color || '#ccc')}` }),
          h('span', {}, TYPE_LABELS[m.type] + (m.upper && m.upper.type !== 'none' ? ` + ${UPPER_LABELS[m.upper.type]}` : '')),
          h('span', { class: 'w' }, `${toCm(m.w)}`));
      })));
      const types = zone === 'wall' ? WALL_TYPES : ISLAND_TYPES;
      out.push(h('div', { class: 'row', style: 'margin-top:8px;align-items:end' },
        h('div', { style: 'flex:2' }, this.select('הוסף מודול', this.addType[zone], types.map(t => [t, TYPE_LABELS[t]]), (v) => { this.addType[zone] = v; })),
        h('div', { class: 'field' }, h('label', {}, 'רוחב'), h('span', { class: 'num' }, h('input', { type: 'number', value: this.addW[zone], min: 15, max: 150, onchange: (e) => { this.addW[zone] = Number(e.target.value) || 60; } }))),
      ));
      out.push(h('button', { class: 'btn primary', style: 'width:100%', onclick: () => this.addModule(zone) }, zone === 'wall' ? '+ הוסף לקיר' : '+ הוסף לאי'));
    };
    list('wall', 'קיר המטבח');
    list('islandModules', 'האי');
    out.push(h('h3', {}, 'רהיטים ופריטים על הרצפה'));
    out.push(h('p', { class: 'note' }, 'במצב עריכה – גוררים פריט במודל כדי להזיז אותו על הרצפה. R מסובב.'));
    out.push(h('div', { class: 'list' }, ...(s.items || []).map((it, i) => h('div', { class: 'it' + (this.app.selected?.id === it.id ? ' on' : ''), onclick: () => this.app.select({ id: it.id, part: 'item', zone: 'items' }) },
      h('span', { class: 'n' }, String(i + 1)), h('span', {}, ITEM_TYPES[it.type]?.label || it.type), h('span', { class: 'w' }, `${Math.round(it.x * 100)}, ${Math.round(it.z * 100)}`)))));
    out.push(h('div', { class: 'row', style: 'margin-top:8px;align-items:end' },
      h('div', { style: 'flex:2' }, this.select('הוסף פריט', this.addItemType || 'chair', Object.entries(ITEM_TYPES).map(([k, v]) => [k, v.label]), (v) => { this.addItemType = v; })),
      h('button', { class: 'btn primary', style: 'margin-bottom:10px', onclick: () => this.addItem(this.addItemType || 'chair') }, '+ הוסף')));
    return out;
  }
  addModule(zone) {
    const type = this.addType[zone]; const w = (this.addW[zone] || 60) / 100;
    const id = uid();
    store.change(s => {
      const arr = s[zone];
      const m = { id, type, w: type === 'fridge' ? Math.max(w, 0.9) : w, mat: zone === 'wall' && !['fridge', 'oven', 'pantry'].includes(type) ? 'lacquer' : 'walnut', color: zone === 'wall' && !['fridge', 'oven', 'pantry'].includes(type) ? SAHARA : WOOD_TINT };
      if (zone === 'wall' && !['fridge', 'oven', 'pantry'].includes(type)) m.upper = { type: type === 'hob' ? 'hood' : 'doors', mat: 'lacquer', color: SAHARA };
      let at = arr.length;
      const sel = this.app.selected && findModule(s, this.app.selected.id);
      if (sel && sel.zone === zone) at = sel.index + 1;
      else if (zone === 'wall' && arr.length && isTall(arr[arr.length - 1])) at = arr.length - 1;
      arr.splice(at, 0, m);
    }, 'struct');
    this.app.select({ id, part: 'base' });
    this.setTab('sel');
  }
  fitWall() {
    store.change(s => {
      const W = s.room.width; const base = s.wall.filter(m => !isTall(m));
      const tall = s.wall.filter(isTall).reduce((a, m) => a + m.w, 0);
      const cur = base.reduce((a, m) => a + m.w, 0); if (!base.length || cur <= 0) return;
      const k = (W - tall) / cur;
      let acc = 0; base.forEach((m, i) => { if (i < base.length - 1) { m.w = Math.max(0.15, Math.round(m.w * k * 100) / 100); acc += m.w; } else m.w = Math.max(0.15, Math.round((W - tall - acc) * 100) / 100); });
    }, 'struct');
    this.app.toast('הארונות התחתונים הותאמו לאורך הקיר');
  }

  // ---------- טאב חדר ----------
  roomTab() {
    const s = store.state; const out = [];
    out.push(h('h3', {}, 'מידות החדר'));
    out.push(this.num('אורך קיר המטבח', () => s.room.width, (st, v) => { st.room.width = v; }, 300, 900, 5));
    out.push(this.num('עומק החדר', () => s.room.depth, (st, v) => { st.room.depth = v; st.window.center = Math.min(st.window.center, v - st.window.width / 2 - 0.1); }, 400, 900, 5));
    out.push(this.num('גובה תקרה', () => s.room.height, (st, v) => { st.room.height = v; for (const m of st.wall) if (m.h && m.h > v) m.h = v; }, 240, 380, 1));
    out.push(this.swatches('צבע קירות', s.room.wallColor, WALL_SWATCHES, (c, st) => { st.room.wallColor = c; }));
    const floorOpts = FLOOR_MATS.map(k => [k, TEXTURE_SETS[k].label]);
    for (const [id, a] of Object.entries(store.assets)) floorOpts.push([`custom:${id}`, `תמונה: ${a.name}`]);
    floorOpts.push(['__upload', '⬆ העלאת תמונה של אריח…']);
    out.push(this.select('ריצוף', s.room.floor, floorOpts, (v) => {
      if (v === '__upload') return this.upload(0.6, (id) => store.change(st => { st.room.floor = `custom:${id}`; }, 'struct'), true);
      store.change(st => { st.room.floor = v; }, 'struct');
    }));
    out.push(h('h3', {}, 'חלון (קיר ימני)'));
    out.push(this.num('רוחב החלון', () => s.window.width, (st, v) => { st.window.width = v; }, 40, 500, 5));
    out.push(this.num('גובה החלון', () => s.window.height, (st, v) => { st.window.height = Math.min(v, st.room.height - st.window.sill - 0.1); }, 20, 220, 5));
    out.push(this.num('גובה אדן מהרצפה', () => s.window.sill, (st, v) => { st.window.sill = Math.min(v, st.room.height - st.window.height - 0.1); }, 0, 250, 5));
    out.push(this.num('מרכז החלון – מרחק מקיר המטבח', () => s.window.center, (st, v) => { st.window.center = v; }, 50, Math.round(s.room.depth * 100) - 50, 5));
    out.push(h('h3', {}, 'מידות סטנדרטיות'));
    out.push(this.num('גובה משטח', () => s.dims.counterH, (st, v) => { st.dims.counterH = v; }, 80, 105, 1));
    out.push(this.num('עובי משטח', () => s.dims.counterT, (st, v) => { st.dims.counterT = v; }, 1, 8, 0.5));
    out.push(this.num('עומק ארונות תחתונים', () => s.dims.baseDepth, (st, v) => { st.dims.baseDepth = v; }, 45, 75, 1));
    out.push(this.num('גובה צוקל', () => s.dims.plinth, (st, v) => { st.dims.plinth = v; }, 5, 20, 1));
    out.push(this.num('מרווח משטח–עליונים', () => s.dims.upperGap, (st, v) => { st.dims.upperGap = v; }, 40, 90, 1));
    out.push(this.num('גובה עליונים', () => s.dims.upperH, (st, v) => { st.dims.upperH = v; }, 40, 120, 1));
    out.push(this.num('עומק עליונים', () => s.dims.upperDepth, (st, v) => { st.dims.upperDepth = v; }, 25, 45, 1));
    return out;
  }

  // ---------- טאב אי ----------
  islandTab() {
    const s = store.state; const I = s.island; const out = [];
    const L = () => store.state.islandModules.reduce((a, m) => a + m.w, 0);
    out.push(h('h3', {}, 'מיקום ומידות'));
    out.push(this.num('מעבר בין האי לארונות', () => I.aisle, (st, v) => { st.island.aisle = v; }, 80, 250, 1));
    out.push(this.num('אורך האי (ארונות)', L, (st, v) => {
      const cur = st.islandModules.reduce((a, m) => a + m.w, 0); const k = v / cur;
      let acc = 0; st.islandModules.forEach((m, i, arr) => { if (i < arr.length - 1) { m.w = Math.round(m.w * k * 1000) / 1000; acc += m.w; } else m.w = Math.max(0.15, v - acc); });
    }, 100, 450, 1));
    out.push(this.num('עומק ארונות האי', () => I.depth, (st, v) => { st.island.depth = v; }, 40, 90, 1));
    out.push(this.num('בליטת משטח לברכיים', () => I.overhang, (st, v) => { st.island.overhang = v; }, 0, 60, 1));
    out.push(this.num('הזזה הצידה (ימינה +)', () => I.offsetX, (st, v) => { st.island.offsetX = v; }, -150, 150, 1));
    out.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: I.waterfall, onchange: (e) => store.change(st => { st.island.waterfall = e.target.checked; }, 'struct') }), 'מפל שיש בקצוות (Waterfall)'));
    out.push(h('h3', {}, 'ישיבה ותאורה'));
    const nSt = (s.items || []).filter(t => t.type === 'stool').length;
    out.push(this.chips('מספר כיסאות בר (מסדר מחדש בשורה)', String(nSt), ['0', '1', '2', '3', '4', '5'].map(n => [n, n]), (v) => store.change(st => { st.island.stools = Number(v); st.items = (st.items || []).filter(t => t.type !== 'stool').concat(stoolRow(st, Number(v))); }, 'struct')));
    out.push(this.num('גובה מנורות מעל המשטח', () => I.pendantH, (st, v) => { st.island.pendantH = v; }, 55, 130, 1));
    out.push(h('h3', {}, 'גב האי (צד הישיבה)'));
    out.push(...this.finishEditor({ mat: I.backMat, color: I.backColor }, (st, p) => { if (p.mat) st.island.backMat = p.mat; if (p.color) st.island.backColor = p.color; }));
    return out;
  }

  // ---------- טאב חומרים ----------
  matTab() {
    const s = store.state; const out = [];
    out.push(h('h3', {}, 'החלה מהירה על קבוצת ארונות'));
    out.push(this.select('על מה להחיל', this.matTarget, [['wallBase', 'ארונות תחתונים בקיר'], ['wallUpper', 'ארונות עליונים'], ['tall', 'טורים גבוהים'], ['island', 'ארונות האי'], ['all', 'כל הארונות']], (v) => { this.matTarget = v; }));
    out.push(...this.finishEditorLocal());
    out.push(h('button', { class: 'btn primary', style: 'width:100%;margin-top:4px', onclick: () => this.applyGroup() }, 'החל'));

    out.push(h('h3', {}, 'משטח עבודה'));
    const cOpts = COUNTER_MATS.map(k => [k, TEXTURE_SETS[k].label]);
    for (const [id, a] of Object.entries(store.assets)) cOpts.push([`custom:${id}`, `תמונה: ${a.name}`]);
    cOpts.push(['__upload', '⬆ העלאת תמונה של משטח…']);
    out.push(this.select(null, s.style.counter, cOpts, (v) => {
      if (v === '__upload') return this.upload(1.5, (id) => store.change(st => { st.style.counter = `custom:${id}`; }, 'struct'));
      store.change(st => { st.style.counter = v; }, 'struct');
    }));
    out.push(h('h3', {}, 'חיפוי קיר בין המשטח לעליונים'));
    const bOpts = [['counter', 'כמו המשטח (לוח שיש)'], ['zellige', 'אריחי זליג׳ לבנים'], ['paint', 'צבע קיר']];
    for (const [id, a] of Object.entries(store.assets)) bOpts.push([`custom:${id}`, `תמונה: ${a.name}`]);
    bOpts.push(['__upload', '⬆ העלאת תמונה של אריח…']);
    out.push(this.select(null, s.style.backsplash, bOpts, (v) => {
      if (v === '__upload') return this.upload(0.3, (id) => store.change(st => { st.style.backsplash = `custom:${id}`; }, 'struct'), true);
      store.change(st => { st.style.backsplash = v; }, 'struct');
    }));
    out.push(h('h3', {}, 'נגיעות מתכת'));
    const metals = [['black', 'שחור מט'], ['steel', 'נירוסטה'], ['gold', 'זהב מוברש']];
    out.push(this.chips('ידיות', s.style.handle, metals, (v) => store.change(st => { st.style.handle = v; }, 'struct')));
    out.push(this.chips('ברז', s.style.faucet, metals, (v) => store.change(st => { st.style.faucet = v; }, 'struct')));
    out.push(this.chips('כיור', s.style.sink, [['black', 'גרניט שחור'], ['steel', 'נירוסטה']], (v) => store.change(st => { st.style.sink = v; }, 'struct')));
    out.push(this.chips('מכשירים', s.style.appliance, [['steel', 'נירוסטה'], ['black', 'נירוסטה שחורה']], (v) => store.change(st => { st.style.appliance = v; }, 'struct')));
    out.push(h('h3', {}, 'תאורה'));
    out.push(this.chips(null, s.style.lighting, [['day', 'יום – אור שמש'], ['evening', 'ערב – תאורה פנימית']], (v) => store.change(st => { st.style.lighting = v; }, 'struct')));
    out.push(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.style.led, onchange: (e) => store.change(st => { st.style.led = e.target.checked; }, 'struct') }), 'פס LED חם מתחת לעליונים'));
    const assets = Object.entries(store.assets);
    out.push(h('h3', {}, 'התמונות שלי'));
    out.push(h('button', { class: 'btn small', onclick: () => this.upload(0.6, () => this.render()) }, '⬆ העלה תמונה (אריח / חזית)'));
    if (assets.length) out.push(h('div', { class: 'assets' }, ...assets.map(([id, a]) => h('div', { class: 'a' }, h('img', { src: a.data }), h('span', { style: 'flex:1' }, a.name),
      h('span', { class: 'num' }, h('input', { type: 'number', value: Math.round((a.size || 0.6) * 100), min: 5, max: 400, title: 'גודל אריח בס״מ', onchange: (e) => { a.size = Number(e.target.value) / 100; store.saveAssets(); this.app.assetsChanged(); } }), h('span', {}, 'ס״מ')),
      h('button', { class: 'btn small danger', onclick: () => { delete store.assets[id]; store.saveAssets(); this.app.assetsChanged(); this.render(); } }, '✕')))));
    else out.push(h('p', { class: 'note' }, 'אפשר להעלות צילום של אריח, חזית או משטח. התמונה נשמרת בדפדפן וגם בקובץ הייצוא.'));
    return out;
  }
  finishEditorLocal() {
    const p = this.matPick;
    return this.finishEditorLike(p, (patch) => { Object.assign(this.matPick, patch); this.render(); });
  }
  finishEditorLike(obj, onPatch) {
    const isWood = obj.mat === 'walnut' || obj.mat === 'oak';
    const sel = this.select('חומר', obj.mat, this.matOptions(true), (v) => {
      if (v === '__upload') return this.upload(0.6, (id) => onPatch({ mat: `custom:${id}` }));
      onPatch({ mat: v, color: isWoodKey(v) ? WOOD_TINT : v === 'lacquer' ? SAHARA : '#ffffff' });
    });
    const list = obj.mat === 'lacquer' ? SWATCHES : isWood ? WOOD_TINTS : null;
    const sw = list ? h('div', { class: 'field' }, h('label', {}, isWood ? 'גוון' : 'צבע'), h('div', { class: 'swatches' },
      ...list.map(({ c, n }) => h('button', { class: 'sw' + (c === obj.color ? ' on' : ''), title: n, style: `background:${c}`, onclick: () => onPatch({ color: c }) })),
      h('label', { class: 'sw picker' }, h('input', { type: 'color', value: obj.color || '#cccccc', onchange: (e) => onPatch({ color: e.target.value }) })))) : null;
    return [sel, sw];
  }
  applyGroup() {
    const { mat, color } = this.matPick; const t = this.matTarget;
    store.change(s => {
      for (const m of s.wall) {
        if ((t === 'wallBase' || t === 'all') && !isTall(m)) Object.assign(m, { mat, color });
        if ((t === 'tall' || t === 'all') && isTall(m)) Object.assign(m, { mat, color });
        if ((t === 'wallUpper' || t === 'all') && m.upper) Object.assign(m.upper, { mat, color });
      }
      if (t === 'island' || t === 'all') for (const m of s.islandModules) Object.assign(m, { mat, color });
    }, 'struct');
    this.app.toast('החומר הוחל');
  }

  // ---------- טאב קובץ ----------
  fileTab() {
    const q = localStorage.getItem('kitchen-quality') || 'auto';
    return [
      h('h3', {}, 'שליחה ושיתוף'),
      h('button', { class: 'btn primary', style: 'width:100%', onclick: () => this.app.openShare() }, 'שליחת התכנון / קישור לשיתוף'),
      hasBackup() ? h('button', { class: 'btn', style: 'width:100%;margin-top:6px', onclick: () => this.app.restoreMine() }, 'חזרה לתכנון הקודם שלי') : null,
      h('h3', {}, 'שמירה'),
      h('p', { class: 'note' }, 'כל שינוי נשמר אוטומטית בדפדפן הזה. כדי להעביר למחשב או לטלפון אחר – ייצא קובץ וייבא אותו שם.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => this.app.exportFile() }, 'ייצוא קובץ'),
        h('button', { class: 'btn', onclick: () => document.getElementById('file-import').click() }, 'ייבוא קובץ')),
      h('div', { class: 'row', style: 'margin-top:6px' },
        h('button', { class: 'btn', onclick: () => this.app.screenshot() }, 'צילום מסך (PNG)'),
        h('button', { class: 'btn danger', onclick: () => { if (confirm('לאפס את כל התכנון לברירת המחדל?')) { store.reset(); this.app.select(null); } } }, 'איפוס')),
      h('h3', {}, 'איכות תצוגה'),
      this.chips(null, q, [['auto', 'אוטומטי'], ['high', 'גבוהה'], ['medium', 'בינונית'], ['low', 'נמוכה']], (v) => { localStorage.setItem('kitchen-quality', v); location.reload(); }),
      h('p', { class: 'note' }, 'גבוהה: צללים חדים יותר ו-Ambient Occlusion. בינונית/נמוכה מתאימות לטלפונים חלשים. (רענון הדף)'),
      h('h3', {}, 'קיצורי מקלדת'),
      h('p', { class: 'note', html: 'Ctrl+Z ביטול • Ctrl+Y חזרה • Delete מחיקת מודול נבחר • Esc ביטול בחירה<br>במצב הליכה: W/A/S/D או חיצים, Shift להאצה, גרירה להסתכלות' }),
      h('h3', {}, 'גרסה'),
      h('p', { class: 'note', style: 'direction:ltr;text-align:right' }, document.querySelector('meta[name=app-version]')?.content || '—'),
      h('h3', {}, 'קרדיטים'),
      h('p', { class: 'note' }, 'טקסטורות ו-HDRI: Poly Haven ו-ambientCG (רישיון CC0). מנוע: three.js.'),
    ];
  }

  // העלאת תמונה – הקטנה ל-1024 פיקסלים ושמירה כ-JPEG
  upload(sizeM, done, square = false) {
    const inp = document.getElementById('file-image');
    inp.value = '';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const img = new Image();
      img.onload = () => {
        const max = 1024, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const data = c.toDataURL('image/jpeg', 0.85);
        const name = f.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'תמונה';
        const id = store.addAsset(name, data, sizeM);
        this.app.assetsChanged();
        done(id);
        this.app.toast('התמונה נוספה');
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(f);
    };
    inp.click();
  }
}
const isWoodKey = (k) => k === 'walnut' || k === 'oak';
