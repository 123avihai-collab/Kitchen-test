import * as THREE from 'three';
import { box, boxUV, cyl } from './util.js';

// החדר: רצפה, קירות, תקרה, חלון אופקי בקיר הימני, נוף חיצוני ותאורה
// מערכת צירים: קיר המטבח ב-z=0, החדר נמשך לכיוון +z. x=0 במרכז קיר המטבח. ימין (למי שמסתכל על הקיר) = +x.
export const WALL_T = 0.2;

export function buildRoom(state, lib, ctx) {
  const g = new THREE.Group(); g.name = 'room';
  const { width: W, depth: Dr, height: H, wallColor } = state.room;
  const win = state.window;
  const wallMat = lib.wall(wallColor);

  // רצפה
  const floorGeo = new THREE.PlaneGeometry(W, Dr); floorGeo.rotateX(-Math.PI / 2); floorGeo.translate(0, 0, Dr / 2);
  boxUV(floorGeo);
  const floor = new THREE.Mesh(floorGeo, lib.floor(state.room.floor));
  floor.receiveShadow = true; floor.name = 'floor'; g.add(floor);

  // תקרה (חד-צדדית – נראית מבפנים בלבד)
  const ceilGeo = new THREE.PlaneGeometry(W, Dr); ceilGeo.rotateX(Math.PI / 2); ceilGeo.translate(0, H, Dr / 2);
  boxUV(ceilGeo);
  const ceilMat = lib.get('ceiling', () => { const m = new THREE.MeshStandardMaterial({ color: '#f7f6f2', roughness: 0.95 }); m.shadowSide = THREE.DoubleSide; return m; });
  const ceil = new THREE.Mesh(ceilGeo, ceilMat); ceil.castShadow = true; ceil.receiveShadow = true; g.add(ceil);

  const plane = (w, h, mat, pos, rotY) => {
    const geo = new THREE.PlaneGeometry(w, h); geo.rotateY(rotY); geo.translate(pos.x, pos.y, pos.z);
    boxUV(geo);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m;
  };
  // קיר המטבח (אחורי)
  g.add(plane(W, H, wallMat, new THREE.Vector3(0, H / 2, 0), 0));
  // קיר שמאלי
  g.add(plane(Dr, H, wallMat, new THREE.Vector3(-W / 2, H / 2, Dr / 2), Math.PI / 2));
  // קיר קדמי (מאחורי הצופה)
  g.add(plane(W, H, wallMat, new THREE.Vector3(0, H / 2, Dr), Math.PI));

  // קיר ימני עם פתח חלון
  const wz0 = Math.max(0.05, win.center - win.width / 2), wz1 = Math.min(Dr - 0.05, win.center + win.width / 2);
  const wy0 = win.sill, wy1 = Math.min(H - 0.05, win.sill + win.height);
  const xR = W / 2, rot = -Math.PI / 2;
  const seg = (z0, z1, y0, y1) => { if (z1 - z0 > 0.001 && y1 - y0 > 0.001) g.add(plane(z1 - z0, y1 - y0, wallMat, new THREE.Vector3(xR, (y0 + y1) / 2, (z0 + z1) / 2), rot)); };
  seg(0, wz0, 0, H); seg(wz1, Dr, 0, H); seg(wz0, wz1, 0, wy0); seg(wz0, wz1, wy1, H);

  // עובי הקיר בפתח (ספלטים) + מסגרת אלומיניום שחורה + זכוכית
  const reveal = new THREE.Group();
  const ww = wz1 - wz0, wh = wy1 - wy0;
  const rx = xR + WALL_T / 2;
  reveal.add(box(WALL_T, 0.02, ww, wallMat, rx, wy0 - 0.01, (wz0 + wz1) / 2));
  reveal.add(box(WALL_T, 0.02, ww, wallMat, rx, wy1 + 0.01, (wz0 + wz1) / 2));
  reveal.add(box(WALL_T, wh, 0.02, wallMat, rx, (wy0 + wy1) / 2, wz0 - 0.01));
  reveal.add(box(WALL_T, wh, 0.02, wallMat, rx, (wy0 + wy1) / 2, wz1 + 0.01));
  // אדן אבן
  reveal.add(box(WALL_T + 0.03, 0.02, ww + 0.04, lib.stone(state.style.counter), xR + WALL_T / 2 - 0.015, wy0 + 0.01, (wz0 + wz1) / 2));
  const frameMat = lib.metal('black');
  const fx = xR + WALL_T * 0.55, fT = 0.05;
  reveal.add(box(0.06, fT, ww, frameMat, fx, wy0 + 0.02 + fT / 2, (wz0 + wz1) / 2));
  reveal.add(box(0.06, fT, ww, frameMat, fx, wy1 - fT / 2, (wz0 + wz1) / 2));
  reveal.add(box(0.06, wh, fT, frameMat, fx, (wy0 + wy1) / 2, wz0 + fT / 2));
  reveal.add(box(0.06, wh, fT, frameMat, fx, (wy0 + wy1) / 2, wz1 - fT / 2));
  const panes = Math.max(2, Math.round(ww / 1.0));
  for (let i = 1; i < panes; i++) reveal.add(box(0.05, wh, 0.035, frameMat, fx, (wy0 + wy1) / 2, wz0 + ww * i / panes));
  const glassGeo = new THREE.PlaneGeometry(ww, wh - 0.02); glassGeo.rotateY(rot);
  const glass = new THREE.Mesh(glassGeo, lib.glass); glass.position.set(fx, (wy0 + wy1) / 2 + 0.01, (wz0 + wz1) / 2);
  glass.castShadow = false; glass.name = 'glass'; glass.userData.noPick = true;
  reveal.add(glass);
  g.add(reveal);

  // פנלים (שיפולים) לבנים
  const skirtMat = lib.get('skirt', () => new THREE.MeshStandardMaterial({ color: '#f1efea', roughness: 0.6 }));
  g.add(box(0.012, 0.07, Dr, skirtMat, -W / 2 + 0.006, 0.035, Dr / 2, { cast: false }));
  g.add(box(W, 0.07, 0.012, skirtMat, 0, 0.035, Dr - 0.006, { cast: false }));
  g.add(box(0.012, 0.07, Dr - 1.0, skirtMat, W / 2 - 0.006, 0.035, (Dr + 1.0) / 2, { cast: false }));

  // נוף מבחוץ – כדור עם תמונת HDRI ממופה (נראה רק דרך החלון)
  if (ctx.outdoorTex) {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), lib.get('sky', () => new THREE.MeshBasicMaterial({ map: ctx.outdoorTex, side: THREE.BackSide, toneMapped: true })));
    sky.material.color.setScalar(state.style.lighting === 'evening' ? 0.12 : 1.6);
    sky.position.set(W / 2, 1.5, Dr / 2); sky.rotation.y = Math.PI * 0.35; sky.userData.noPick = true;
    g.add(sky);
    // קרקע חיצונית מתחת לחלון (לצל רך מבחוץ)
  }

  // ספוטים שקועים בתקרה (נראות) – אור מגיע מאורות ייעודיים
  const spotMat = lib.get('downlight', () => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff1da', emissiveIntensity: 3 }));
  const rimMat = lib.get('downrim', () => new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.4 }));
  const spots = [];
  const baseFront = state.dims.baseDepth + 0.04;
  for (let i = 0; i < 4; i++) spots.push([-W / 2 + W * (i + 0.5) / 4, baseFront + 0.25]);
  const islandZ = islandCenterZ(state);
  for (const sx of [-1, 1]) spots.push([sx * Math.min(W / 2 - 0.6, 1.9), islandZ + 0.9]);
  for (const [x, z] of spots) {
    const rim = cyl(0.05, 0.05, 0.006, rimMat, 24); rim.position.set(x, H - 0.003, z); rim.castShadow = false; g.add(rim);
    const lens = cyl(0.036, 0.036, 0.004, spotMat, 24); lens.position.set(x, H - 0.006, z); lens.castShadow = false; g.add(lens);
  }

  return g;
}

export function islandFrontZ(state) {
  // חזית ארונות האי: קצה משטח קיר המטבח + מעבר + בליטת משטח האי (2 ס"מ)
  return state.dims.baseDepth + 0.04 + state.island.aisle + 0.02;
}
export function islandPosZ(state) { return islandFrontZ(state) + state.island.depth + 0.02; }
export function islandCenterZ(state) {
  return islandPosZ(state) - (state.island.depth + 0.02 - state.island.overhang) / 2;
}

// תאורה
export class Lighting {
  constructor(scene, quality) {
    this.scene = scene;
    this.group = new THREE.Group(); this.group.name = 'lights'; scene.add(this.group);
    // שמש דרך החלון
    this.sun = new THREE.DirectionalLight('#fff6ea', 5.5);
    this.sun.castShadow = true;
    const sm = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02; this.sun.shadow.radius = 4;
    this.group.add(this.sun, this.sun.target);
    // אור מילוי רך מהתקרה – עם צל רך
    this.key = new THREE.SpotLight('#fffaf3', 18, 0, Math.PI / 3.2, 0.9, 1.6);
    this.key.castShadow = quality !== 'low';
    this.key.shadow.mapSize.set(sm, sm); this.key.shadow.bias = -0.0003; this.key.shadow.normalBias = 0.02; this.key.shadow.radius = 6;
    this.group.add(this.key, this.key.target);
    this.key2 = new THREE.SpotLight('#fffaf3', 14, 0, Math.PI / 3, 0.9, 1.6);
    this.key2.castShadow = quality === 'high';
    this.key2.shadow.mapSize.set(1024, 1024); this.key2.shadow.bias = -0.0003; this.key2.shadow.normalBias = 0.02; this.key2.shadow.radius = 6;
    this.group.add(this.key2, this.key2.target);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#e2d8ca', 0.5);
    this.group.add(this.hemi);
  }
  update(state) {
    const { width: W, depth: Dr, height: H } = state.room;
    const win = state.window;
    const evening = state.style.lighting === 'evening';
    // שמש מגיעה מימין (x+), גבוה, דרך החלון
    const target = new THREE.Vector3(W / 2 - 1.6, 0.6, win.center - 0.3);
    this.sun.target.position.copy(target);
    this.sun.position.set(W / 2 + 4.5, win.sill + win.height + 3.2, win.center + 1.4);
    const sc = this.sun.shadow.camera; const ext = Math.max(W, Dr) * 0.7;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.5; sc.far = 18; sc.updateProjectionMatrix();
    this.sun.intensity = evening ? 0 : 6.0;
    this.sun.visible = !evening;

    const iz = islandCenterZ(state);
    this.key.position.set(0.0, H - 0.05, iz - 0.2); this.key.target.position.set(0, 0, iz - 0.1);
    this.key2.position.set(0, H - 0.05, 0.75); this.key2.target.position.set(0, 0.9, 0.35);
    this.key.intensity = evening ? 14 : 9; this.key2.intensity = evening ? 12 : 7;
    this.hemi.intensity = evening ? 0.1 : 0.55;
  }
}
