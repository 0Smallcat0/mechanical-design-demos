// Procedural models of every board, module and actuator. Units: millimetres. +x right, +y up, +z toward the viewer.
// Each builder returns { group, pins: { name: Vector3 (local) }, spin?: Object3D, led?: Mesh }.
// Every part is built here from primitives and canvas-drawn silkscreen: no 3D files, no photos.
import * as THREE from 'three';

const P = 2.54;
const M = {};
const once = (key, make) => M[key] || (M[key] = make());
const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0, ...o });
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });

export const MAT = {
  plastic: () => once('plastic', () => phys(0x1a1a1c, { roughness: 0.55, clearcoat: 0.15 })),
  matte: () => once('matte', () => std(0x161618, { roughness: 0.8 })),
  epoxy: () => once('epoxy', () => phys(0x1c1c1e, { roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.5 })),
  gold: () => once('gold', () => std(0xe0b85a, { metalness: 1, roughness: 0.22 })),
  tin: () => once('tin', () => std(0xd4d6da, { metalness: 1, roughness: 0.28 })),
  steel: () => once('steel', () => std(0xc4c8ce, { metalness: 1, roughness: 0.2 })),
  brushed: () => once('brushed', () => std(0xb9bdc3, { metalness: 1, roughness: 0.38 })),
  anodized: () => once('anodized', () => std(0x18191b, { metalness: 0.7, roughness: 0.42 })),
  brass: () => once('brass', () => std(0xc9a24a, { metalness: 1, roughness: 0.3 })),
  white: () => once('white', () => phys(0xf3f1ec, { roughness: 0.42, clearcoat: 0.2 })),
  nylon: () => once('nylon', () => phys(0xeeeae0, { roughness: 0.55 })),
  termBlue: () => once('termBlue', () => phys(0x1f63c9, { roughness: 0.42, clearcoat: 0.2 })),
  termGreen: () => once('termGreen', () => phys(0x1e8a4a, { roughness: 0.42, clearcoat: 0.2 })),
  potBlue: () => once('potBlue', () => phys(0x2058c8, { roughness: 0.45 })),
  ceramic: () => once('ceramic', () => std(0xc8b48c, { roughness: 0.7 })),
  yellow: () => once('yellow', () => phys(0xf4c227, { roughness: 0.5, clearcoat: 0.1 })),
  servoBlue: () => once('servoBlue', () => phys(0x2a63d4, { roughness: 0.32, transmission: 0.35, thickness: 6, ior: 1.45 })),
  rubber: () => once('rubber', () => std(0x232325, { roughness: 0.9 })),
  shrink: () => once('shrink', () => phys(0x2a6fe0, { roughness: 0.35, transmission: 0.3, thickness: 3, clearcoat: 0.4 })),
  cellBlue: () => once('cellBlue', () => phys(0x2f6fd0)),
  cellGreen: () => once('cellGreen', () => phys(0x2f9a5c)),
};

// ---------------------------------------------------------------- geometry helpers
const GEO = new Map();
function rrShape(w, d, r) {
  const s = new THREE.Shape(); r = Math.min(r, w / 2 - 0.01, d / 2 - 0.01);
  s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  return s;
}
// rounded box sitting on y = 0, footprint w (x) by d (z), corner radius r in plan, edge bevel b
function rboxGeo(w, h, d, r = 0.4, b = 0.25) {
  const key = ['rb', w, h, d, r, b].join(',');
  if (GEO.has(key)) return GEO.get(key);
  b = Math.max(0, Math.min(b, h / 2 - 0.01, w / 2 - 0.05, d / 2 - 0.05));
  const g = new THREE.ExtrudeGeometry(rrShape(w - 2 * b, d - 2 * b, Math.max(0.05, r - b)), { depth: Math.max(0.01, h - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, b, 0);
  GEO.set(key, g); return g;
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
  if (parent) parent.add(m); return m;
}
const rbox = (parent, w, h, d, mat, x = 0, y = 0, z = 0, r = 0.4, b = 0.25) => mesh(rboxGeo(w, h, d, r, b), mat, parent, x, y, z);
function geoBox(w, h, d) { const k = ['gb', w, h, d].join(','); let g = GEO.get(k); if (!g) { g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); GEO.set(k, g); } return g; }
const box = (parent, w, h, d, mat, x = 0, y = 0, z = 0) => mesh(geoBox(w, h, d), mat, parent, x, y, z);
function cyl(parent, r, h, mat, x = 0, y = 0, z = 0, seg = 24, axis = 'y', r2 = r) {
  const key = ['c', r, r2, h, seg].join(',');
  let g = GEO.get(key); if (!g) { g = new THREE.CylinderGeometry(r2, r, h, seg); GEO.set(key, g); }
  const m = mesh(g, mat, parent);
  if (axis === 'x') { m.rotation.z = -Math.PI / 2; m.position.set(x + h / 2, y, z); }
  else if (axis === '-x') { m.rotation.z = Math.PI / 2; m.position.set(x - h / 2, y, z); }
  else if (axis === 'z') { m.rotation.x = Math.PI / 2; m.position.set(x, y, z + h / 2); }
  else m.position.set(x, y + h / 2, z);
  return m;
}
// many copies of one small mesh in one draw call: pts = [[x, y, z, rotY?], ...]
function inst(parent, geo, mat, pts) {
  const im = new THREE.InstancedMesh(geo, mat, pts.length); im.castShadow = true; im.receiveShadow = true;
  const o = new THREE.Object3D();
  pts.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.rotation.set(0, p[3] || 0, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  parent.add(im); return im;
}

// ---------------------------------------------------------------- canvas drawing: silkscreen, part markings
const PX = 14; // texture pixels per mm
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function shade(hex, k) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); }

// A board face, drawn in board millimetres (x across, z toward the viewer, board centre = 0, 0).
class Face {
  constructor(W, D, base, seed = 1) {
    this.W = W; this.D = D; this.base = base;
    const c = this.c = document.createElement('canvas'); c.width = Math.round(W * PX); c.height = Math.round(D * PX);
    const g = this.g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, c.width, c.height);
    const r = rng(seed);
    g.globalAlpha = 0.07; g.fillStyle = shade(base, 0.08);   // copper pours under the mask
    for (let i = 0; i < 6; i++) g.fillRect(r() * c.width, r() * c.height, c.width * (0.2 + r() * 0.3), c.height * (0.15 + r() * 0.3));
    g.globalAlpha = 1;
  }
  X(x) { return (x + this.W / 2) * PX; } Z(z) { return (z + this.D / 2) * PX; }
  traces(n, seed = 7) {
    const g = this.g, r = rng(seed); g.strokeStyle = shade(this.base, 0.07); g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      g.lineWidth = (0.25 + r() * 0.35) * PX; g.beginPath();
      let x = (r() - 0.5) * this.W * 0.9, z = (r() - 0.5) * this.D * 0.9; g.moveTo(this.X(x), this.Z(z));
      for (let k = 0; k < 3; k++) {
        const d = 4 + r() * 14, dir = Math.floor(r() * 8) * Math.PI / 4;
        x = Math.max(-this.W / 2 + 2, Math.min(this.W / 2 - 2, x + Math.cos(dir) * d)); z = Math.max(-this.D / 2 + 2, Math.min(this.D / 2 - 2, z + Math.sin(dir) * d));
        g.lineTo(this.X(x), this.Z(z));
      }
      g.stroke();
      g.fillStyle = shade(this.base, 0.12); g.beginPath(); g.arc(this.X(x), this.Z(z), 0.45 * PX, 0, 7); g.fill();
    }
  }
  text(t, x, z, size, o = {}) {
    const g = this.g; g.save(); g.translate(this.X(x), this.Z(z)); if (o.rot) g.rotate(o.rot);
    g.fillStyle = o.color || '#f4f4f0'; g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
    g.font = `${o.weight || 700} ${size * PX}px ${o.font || '"Segoe UI", Arial, Helvetica, sans-serif'}`;
    if (o.spacing) g.letterSpacing = o.spacing * PX + 'px';
    g.fillText(t, 0, 0); g.restore();
  }
  rect(x, z, w, d, o = {}) {
    const g = this.g; g.save(); g.lineWidth = (o.lw || 0.18) * PX;
    if (o.fill) { g.fillStyle = o.fill; g.fillRect(this.X(x - w / 2), this.Z(z - d / 2), w * PX, d * PX); }
    if (o.stroke !== false) { g.strokeStyle = o.stroke || '#f4f4f0'; g.strokeRect(this.X(x - w / 2), this.Z(z - d / 2), w * PX, d * PX); }
    g.restore();
  }
  pad(x, z, r = 0.85, o = {}) {
    const g = this.g; g.fillStyle = o.color || '#d9d4c4';
    if (o.square) g.fillRect(this.X(x - r), this.Z(z - r), 2 * r * PX, 2 * r * PX); else { g.beginPath(); g.arc(this.X(x), this.Z(z), r * PX, 0, 7); g.fill(); }
    if (o.hole !== false) { g.fillStyle = '#2a2622'; g.beginPath(); g.arc(this.X(x), this.Z(z), r * 0.48 * PX, 0, 7); g.fill(); }
  }
  smdPad(x, z, w, d) { const g = this.g; g.fillStyle = '#d9d4c4'; g.fillRect(this.X(x - w / 2), this.Z(z - d / 2), w * PX, d * PX); }
  line(pts, o = {}) { const g = this.g; g.strokeStyle = o.color || '#f4f4f0'; g.lineWidth = (o.lw || 0.2) * PX; g.beginPath(); pts.forEach(([x, z], i) => i ? g.lineTo(this.X(x), this.Z(z)) : g.moveTo(this.X(x), this.Z(z))); g.stroke(); }
  circle(x, z, r, o = {}) { const g = this.g; g.beginPath(); g.arc(this.X(x), this.Z(z), r * PX, 0, 7); if (o.fill) { g.fillStyle = o.fill; g.fill(); } if (o.stroke !== false) { g.strokeStyle = o.stroke || '#f4f4f0'; g.lineWidth = (o.lw || 0.2) * PX; g.stroke(); } }
  texture() { const t = new THREE.CanvasTexture(this.c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
}

// Printed marking (laser-etched or ink) on top of a part: a small textured quad facing up.
const markCache = new Map();
function mark(parent, lines, w, d, x, y, z, o = {}) {
  const key = [lines.join('|'), w, d, o.color, o.weight, o.bg].join(',');
  let tex = markCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas'); c.width = Math.max(16, Math.round(w * PX * 1.5)); c.height = Math.max(16, Math.round(d * PX * 1.5));
    const g = c.getContext('2d');
    if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, c.width, c.height); }
    g.fillStyle = o.color || 'rgba(225,225,222,.85)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lh = c.height / lines.length;
    lines.forEach((t, i) => {
      const font = s => `${o.weight || 600} ${s}px ${o.font || '"Segoe UI", Arial, sans-serif'}`;
      let fs = lh * 0.78; g.font = font(fs); while (g.measureText(t).width > c.width * 0.94 && fs > 4) { fs -= 1; g.font = font(fs); }
      g.fillText(t, c.width / 2, lh * (i + 0.5));
    });
    tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; markCache.set(key, tex);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, transparent: !o.bg, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; if (o.rot) m.rotation.z = o.rot;
  m.position.set(x, y + 0.02, z); parent.add(m); return m;
}

// Printed circuit board: extruded outline with holes; the top face carries the drawn silkscreen.
function pcb(parent, face, o = {}) {
  const W = face.W, D = face.D, t = o.t ?? 1.6;
  const s = rrShape(W, D, o.r ?? 1.0);
  for (const [hx, hz, hr] of o.holes || []) { const h = new THREE.Path(); h.absarc(hx, -hz, hr, 0, Math.PI * 2, true); s.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 16 });
  g.rotateX(-Math.PI / 2);
  const tex = face.texture(); tex.repeat.set(1 / W, 1 / D); tex.offset.set(0.5, 0.5);
  const top = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.28 });
  const edge = std(o.edge || 0x5f6b45, { roughness: 0.7 });
  const m = new THREE.Mesh(g, [top, edge]); m.castShadow = m.receiveShadow = true; parent.add(m);
  return m;
}
function hole(face, x, z, r = 1.6) { face.circle(x, z, r + 0.9, { fill: '#d9d4c4', stroke: false }); return [x, z, r]; }

// ---------------------------------------------------------------- component library
function femaleHeader(parent, n, x, y, z) {
  rbox(parent, n * P - 0.1, 8.5, P - 0.1, MAT.plastic(), x, y, z, 0.2, 0.2);
  const pts = []; for (let i = 0; i < n; i++) pts.push([x + (i - (n - 1) / 2) * P, y + 8.46, z]);
  inst(parent, geoBox(1.6, 0.03, 1.6), std(0x2a2a2c, { roughness: 0.6 }), pts);
  inst(parent, geoBox(1.0, 0.06, 1.0), std(0x050505, { roughness: 1 }), pts);
}
// male pins at pts = [[x, z], ...]; one plastic strip per row. Returns tip positions.
const tipGeo = (() => { const g = new THREE.ConeGeometry(0.46, 0.6, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, 0.3, 0); return g; })();
function malePins(parent, pts, y, len = 8.5, o = {}) {
  const rows = new Map();
  for (const [x, z] of pts) { const k = (o.alongZ ? x : z).toFixed(2); if (!rows.has(k)) rows.set(k, []); rows.get(k).push(o.alongZ ? z : x); }
  for (const [k, list] of rows) {
    const a = Math.min(...list), b = Math.max(...list), c = (a + b) / 2, L = b - a + P - 0.1;
    if (o.alongZ) rbox(parent, P - 0.1, 2.5, L, MAT.plastic(), +k, y, c, 0.2, 0.3); else rbox(parent, L, 2.5, P - 0.1, MAT.plastic(), c, y, +k, 0.2, 0.3);
  }
  const post = len - 0.6;
  inst(parent, geoBox(0.64, post, 0.64), MAT.gold(), pts.map(([x, z]) => [x, y - 2.0, z]));
  inst(parent, tipGeo, MAT.gold(), pts.map(([x, z]) => [x, y - 2.0 + post, z]));
  return pts.map(([x, z]) => new THREE.Vector3(x, y + len - 2.0, z));
}
function dip(parent, n, x, y, z, lines, o = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const L = n / 2 * P, Wb = 6.35, H = 3.3, lift = o.lift ?? 0.6;
  rbox(g, L, H, Wb, MAT.epoxy(), 0, lift, 0, 0.3, 0.45);
  const notch = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20, -Math.PI / 2, Math.PI), std(0x0d0d0e, { roughness: 0.9 }));
  notch.rotation.x = -Math.PI / 2; notch.position.set(-L / 2 + 0.02, lift + H + 0.01, 0); g.add(notch);
  const dim = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), std(0x101011, { roughness: 0.3 })); dim.rotation.x = -Math.PI / 2; dim.position.set(-L / 2 + 1.6, lift + H + 0.01, Wb / 2 - 1.4); g.add(dim);
  const pts = []; for (let i = 0; i < n / 2; i++) for (const s of [-1, 1]) pts.push([-L / 2 + P / 2 + i * P, s]);
  inst(g, geoBox(1.4, 0.25, 0.7), MAT.tin(), pts.map(([px, s]) => [px, lift + 1.1, s * (Wb / 2 + 0.3)]));
  inst(g, geoBox(0.5, lift + 1.2, 0.25), MAT.tin(), pts.map(([px, s]) => [px, -0.3, s * (Wb / 2 + 0.6)]));
  if (lines) mark(g, lines, L * 0.82, Wb * 0.6, 0.6, lift + H, 0, { color: 'rgba(205,205,200,.8)', weight: 500 });
  return g;
}
function qfn(parent, s, x, y, z, lines, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  rbox(g, s, 0.9, s, MAT.epoxy(), 0, 0, 0, 0.15, 0.1);
  const n = Math.round(s / 0.5) - 2, pts = [];
  for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.5; pts.push([o, 0, s / 2 + 0.1], [o, 0, -s / 2 - 0.1], [s / 2 + 0.1, 0, o, Math.PI / 2], [-s / 2 - 0.1, 0, o, Math.PI / 2]); }
  inst(g, geoBox(0.25, 0.2, 0.4), MAT.tin(), pts);
  if (lines) mark(g, lines, s * 0.8, s * 0.6, 0, 0.9, 0.2, { color: 'rgba(200,200,196,.75)', weight: 500 });
  return g;
}
function tqfp(parent, s, x, y, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  rbox(g, s, 1.1, s, MAT.epoxy(), 0, 0.15, 0, 0.15, 0.1);
  const n = Math.round(s / 0.8), pts = [];
  for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.8; pts.push([o, 0, s / 2 + 0.5], [o, 0, -s / 2 - 0.5], [s / 2 + 0.5, 0, o, Math.PI / 2], [-s / 2 - 0.5, 0, o, Math.PI / 2]); }
  inst(g, geoBox(0.3, 0.15, 1.0), MAT.tin(), pts);
  return g;
}
function sot223(parent, x, y, z, rot = 0, text) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  rbox(g, 6.5, 1.6, 3.5, MAT.epoxy(), 0, 0.1, 0, 0.15, 0.15);
  box(g, 3.0, 0.25, 2.2, MAT.tin(), 0, 0, -2.6);
  for (const dx of [-2.3, 0, 2.3]) box(g, 0.7, 0.25, 1.8, MAT.tin(), dx, 0, 2.4);
  if (text) mark(g, [text], 5.4, 1.6, 0, 1.7, 0.3, { color: 'rgba(200,200,196,.8)', weight: 500 });
  return g;
}
function to252(parent, x, y, z, rot = 0, text) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  rbox(g, 6.6, 2.3, 6.1, MAT.epoxy(), 0, 0.05, 0.4, 0.2, 0.2);
  box(g, 5.4, 0.5, 1.6, MAT.tin(), 0, 0, -3.3);
  for (const dx of [-2.28, 2.28]) box(g, 0.8, 0.4, 2.5, MAT.tin(), dx, 0, 4.4);
  if (text) mark(g, [text], 5.6, 2.2, 0, 2.35, 0.6, { color: 'rgba(200,200,196,.8)', weight: 500 });
  return g;
}
function to263(parent, x, y, z, rot = 0, lines) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  rbox(g, 10.1, 4.4, 8.9, MAT.epoxy(), 0, 0.05, 0.3, 0.25, 0.25);
  box(g, 8.0, 0.6, 2.0, MAT.tin(), 0, 0, -4.7);
  for (let i = 0; i < 5; i++) box(g, 0.8, 0.5, 3.4, MAT.tin(), (i - 2) * 1.7, 0, 5.6);
  if (lines) mark(g, lines, 8.6, 5.5, 0, 4.45, 0.6, { color: 'rgba(200,200,196,.8)', weight: 500 });
  return g;
}
// 0805 chip resistors (black) and capacitors (tan), one draw call per kind: list = [[x, z, 'r'|'c', rotY], ...]
function chips(parent, list, y) {
  const bodyR = [], bodyC = [], ends = [];
  for (const [x, z, kind, rot = 0] of list) {
    (kind === 'r' ? bodyR : bodyC).push([x, y, z, rot]);
    for (const e of [-1, 1]) ends.push([x + Math.cos(rot) * e * 0.75, y, z - Math.sin(rot) * e * 0.75, rot]);
  }
  if (bodyR.length) inst(parent, geoBox(1.5, 0.5, 1.25), phys(0x141414, { roughness: 0.5 }), bodyR);
  if (bodyC.length) inst(parent, geoBox(1.5, 0.75, 1.25), MAT.ceramic(), bodyC);
  if (ends.length) inst(parent, geoBox(0.5, 0.72, 1.27), MAT.tin(), ends);
}
let _glow;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (_glow = new THREE.CanvasTexture(c));
}
// SMD LED; returns the body mesh whose material.emissiveIntensity the app drives. A soft halo follows it.
function led(parent, x, y, z, color) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.65), emissive: color, emissiveIntensity: 0, roughness: 0.15 });
  const body = mesh(rboxGeo(1.6, 0.7, 0.9, 0.1, 0.1), m, g);
  for (const e of [-1, 1]) box(g, 0.35, 0.5, 0.92, MAT.tin(), e * 0.75, 0, 0);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(7, 7, 1); halo.position.y = 0.9; g.add(halo);
  halo.onBeforeRender = () => { halo.material.opacity = Math.min(1, m.emissiveIntensity / 2) * 0.85; };
  return body;
}
// aluminium electrolytic capacitor: printed sleeve with polarity band, rolled rim, vented lid
const sleeveCache = new Map();
function sleeveTex(color, band, text) {
  const k = color + band + text; if (sleeveCache.has(k)) return sleeveCache.get(k);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 256, 128);
  g.fillStyle = band; g.fillRect(150, 0, 56, 128);
  g.fillStyle = color; g.font = '700 22px Arial'; g.textAlign = 'center';
  for (let y = 28; y < 128; y += 34) g.fillText('−', 178, y);
  g.fillStyle = band; g.font = '600 15px Arial'; g.save(); g.translate(70, 64); g.rotate(-Math.PI / 2); g.scale(-1, 1); g.fillText(text, 0, 0); g.restore();
  g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 6, 256, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; sleeveCache.set(k, t); return t;
}
function eCap(parent, d, h, x, y, z, o = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const r = d / 2;
  const body = mesh(new THREE.CylinderGeometry(r, r, h - 0.6, 36, 1, true), phys(0xffffff, { map: sleeveTex(o.color || '#1b2a4a', o.band || '#c9d2e6', o.text || '220µF 25V'), roughness: 0.35, clearcoat: 0.5 }), g, 0, (h - 0.6) / 2 + 0.3, 0);
  body.rotation.y = o.bandAt ?? 0;
  cyl(g, r * 0.97, 0.3, MAT.rubber(), 0, 0, 0, 36);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, r * 0.1, 8, 36), phys(new THREE.Color(o.color || '#1b2a4a'), { roughness: 0.4 })); rim.rotation.x = Math.PI / 2; rim.position.y = h - 0.35; g.add(rim);
  cyl(g, r * 0.84, 0.05, MAT.brushed(), 0, h - 0.35, 0, 36);
  for (const a of [0, Math.PI / 3, -Math.PI / 3]) { const v = box(g, r * 1.2, 0.04, 0.18, std(0x7b7f86, { metalness: 1, roughness: 0.5 }), 0, h - 0.3, 0); v.rotation.y = a; }
  return g;
}
// SMD aluminium cap: silver can on a black square base, black half-moon on the lid
function smdCap(parent, d, h, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  rbox(g, d + 0.4, 1.0, d + 0.4, MAT.matte(), 0, 0, 0, 0.6, 0.1);
  cyl(g, d / 2, h - 1.0, MAT.brushed(), 0, 1.0, 0, 32);
  const lid = new THREE.Mesh(new THREE.CircleGeometry(d / 2 * 0.98, 32, Math.PI / 2, Math.PI), std(0x111111, { roughness: 0.6 })); lid.rotation.x = -Math.PI / 2; lid.position.y = h + 0.01; g.add(lid);
  return g;
}
function crystalHC49(parent, x, y, z, text = '16.000') {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const s = new THREE.Shape(); const L = 11, W = 4.65, r = W / 2;
  s.absarc(-L / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5, false); s.absarc(L / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 3.3, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3, curveSegments: 16 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0.25, 0);
  mesh(geo, MAT.steel(), g, 0, 0.4, 0);
  mark(g, [text], 6, 2.2, 0, 4.2, 0, { color: 'rgba(60,62,66,.85)', weight: 600 });
  return g;
}
function button6(parent, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
  rbox(g, 6, 3.1, 6, MAT.matte(), 0, 0, 0, 0.3, 0.2);
  box(g, 6.1, 0.25, 6.1, MAT.steel(), 0, 3.1, 0);
  cyl(g, 1.75, 1.6, MAT.plastic(), 0, 3.3, 0, 24);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.8, 0.3, 1.6, MAT.tin(), dx * 3.2, 0, dz * 2.25);
  return g;
}
// screw terminal block: n ways at pitch p, wire entries on local +z. Returns entry points in the parent's frame.
function terminal(parent, n, x, y, z, rot, mat, p = 5.0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  const w = n * p, H = 10, Dp = 7.6;
  rbox(g, w - 0.1, H, Dp, mat, 0, 0, 0, 0.3, 0.4);
  rbox(g, w - 0.4, 1.4, 3.4, mat, 0, H - 0.2, -1.8, 0.3, 0.3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const ox = (i - (n - 1) / 2) * p;
    box(g, 3.5, 0.1, 3.5, std(0x0b0b0c, { roughness: 1 }), ox, H + 1.15, -1.8);
    cyl(g, 1.55, 0.5, MAT.tin(), ox, H + 0.75, -1.8, 20);
    const slot = box(g, 2.6, 0.2, 0.45, std(0x5b5f66, { metalness: 1, roughness: 0.5 }), ox, H + 1.1, -1.8); slot.rotation.y = 0.5 + i;
    box(g, 3.4, 3.6, 0.2, std(0x0b0b0c, { roughness: 1 }), ox, 2.2, Dp / 2 + 0.01);
    box(g, 2.8, 0.5, 0.3, MAT.tin(), ox, 3.2, Dp / 2 - 0.05);
    const v = new THREE.Vector3(ox, 4.0, Dp / 2 + 0.3); v.applyEuler(g.rotation).add(g.position);
    v.dir = new THREE.Vector3(0, 0, 1).applyEuler(g.rotation); out.push(v);
  }
  return out;
}
function trimpot(parent, x, y, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  rbox(g, 9.5, 4.8, 9.8, MAT.potBlue(), 0, 0, 0, 0.3, 0.3);
  cyl(g, 1.25, 0.6, MAT.brass(), 4.7, 3.5, 3.0, 16, 'x');
  box(g, 0.2, 0.3, 1.8, std(0x6b5420, { metalness: 1, roughness: 0.5 }), 5.35, 3.35, 3.0);
  mark(g, ['103'], 4, 2, -1.5, 4.8, 0, { color: 'rgba(235,240,255,.85)' });
  return g;
}
function sma(parent, x, y, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  rbox(g, 4.3, 2.1, 2.7, MAT.epoxy(), 0, 0.05, 0, 0.15, 0.2);
  box(g, 0.6, 0.02, 2.5, std(0x9aa0a8), -1.5, 2.15, 0);
  for (const e of [-1, 1]) box(g, 1.2, 0.3, 1.5, MAT.tin(), e * 2.4, 0, 0);
  return g;
}
function jumperCap(parent, x, y, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  rbox(g, 2.4, 6, 5.0, phys(0x1a1a1c, { roughness: 0.5 }), 0, 0, 0, 0.3, 0.3);
  return g;
}

// ---------------------------------------------------------------- Arduino Uno + Sensor Shield V5 stack
export function unoStack() {
  const g = new THREE.Group(); const pins = {};
  const W = 68.6, D = 53.3;
  // Arduino drawing coordinates (origin bottom-left, Y toward the back) to scene coordinates
  const ax = X => X - W / 2, az = Y => D / 2 - Y;
  const HOLES = [[14.0, 2.5], [15.3, 50.7], [66.1, 7.6], [66.1, 35.5]].map(([X, Y]) => [ax(X), az(Y), 1.6]);

  // ---------- Uno
  const uno = new THREE.Group(); g.add(uno);
  const f = new Face(W, D, '#00878f', 3);
  f.traces(40, 11);
  for (const [x, z, r] of HOLES) hole(f, x, z, r);
  f.text('UNO', ax(42), az(31), 6.2, { weight: 800, spacing: 0.4 });
  f.text('ARDUINO', ax(42), az(37.5), 2.6, { weight: 800, spacing: 0.35 });
  f.circle(ax(31), az(34.5), 2.1, { lw: 0.45 }); f.circle(ax(35), az(34.5), 2.1, { lw: 0.45 });
  f.text('DIGITAL (PWM~)', ax(47), az(46.6), 1.4);
  f.text('POWER', ax(36.8), az(6.4), 1.4); f.text('ANALOG IN', ax(57), az(6.4), 1.4);
  f.line([[ax(28), az(5.4)], [ax(46.2), az(5.4)]]); f.line([[ax(50), az(5.4)], [ax(64), az(5.4)]]);
  pcb(uno, f, { holes: HOLES, edge: 0x2f5552 });
  // USB-B receptacle: steel shell profile extruded along x, opening toward -x
  {
    const sh = new THREE.Shape(); const w = 12.0, h = 10.9, c = 1.6;
    sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(w / 2, h - c); sh.lineTo(w / 2 - c, h); sh.lineTo(-w / 2 + c, h); sh.lineTo(-w / 2, h - c); sh.closePath();
    const inner = new THREE.Path(); const iw = 8.4, ih = 7.6, ic = 1.2;
    inner.moveTo(-iw / 2, 1.4); inner.lineTo(iw / 2, 1.4); inner.lineTo(iw / 2, 1.4 + ih - ic); inner.lineTo(iw / 2 - ic, 1.4 + ih); inner.lineTo(-iw / 2 + ic, 1.4 + ih); inner.lineTo(-iw / 2, 1.4 + ih - ic); inner.closePath();
    sh.holes.push(inner);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 16, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 1 });
    const m = mesh(geo, MAT.steel(), uno); m.rotation.y = -Math.PI / 2; m.position.set(ax(9.8), 1.6, az(38.1));
    box(uno, 8, 9, 8.6, std(0x111112, { roughness: 0.9 }), ax(5.6), 1.6 + 1.2, az(38.1));
    rbox(uno, 9, 2.8, 5.4, MAT.white(), ax(-1.0), 1.6 + 4.0, az(38.1), 0.3, 0.2);
  }
  // DC barrel jack
  rbox(uno, 14.2, 11, 9, MAT.plastic(), ax(5.3), 1.6, az(7.6), 0.6, 0.5);
  rbox(uno, 3, 11.6, 9.4, MAT.plastic(), ax(-0.8), 1.6, az(7.6), 0.6, 0.5);
  cyl(uno, 3.15, 0.4, std(0x050505, { roughness: 1 }), ax(-2.3), 1.6 + 6.3, az(7.6), 28, '-x');
  // ATmega328P in its socket
  box(uno, 36.6, 2.8, 9.6, MAT.plastic(), ax(46.99), 1.6, az(15.24));
  dip(uno, 28, ax(46.99), 1.6 + 2.8, az(15.24), ['ATMEGA328P-PU', 'ATMEL'], { lift: 0.2 });
  // USB chip, crystal, regulator, caps, LEDs, reset, ICSP
  qfn(uno, 5, ax(25.4), 1.6, az(36.5), ['16U2'], Math.PI / 4);
  crystalHC49(uno, ax(21.5), 1.6, az(26.5));
  sot223(uno, ax(13.5), 1.6, az(19.5), Math.PI / 2, '1117');
  smdCap(uno, 6.3, 5.6, ax(19.6), 1.6, az(8.2)); smdCap(uno, 6.3, 5.6, ax(19.6), 1.6, az(15.0));
  button6(uno, ax(6.3), 1.6, az(49.6));
  malePins(uno, [[ax(63.6), az(27.9)], [ax(66.14), az(27.9)], [ax(63.6), az(25.36)], [ax(66.14), az(25.36)], [ax(63.6), az(22.82)], [ax(66.14), az(22.82)]], 1.6, 8.5);
  malePins(uno, [[ax(17.8), az(45.4)], [ax(17.8), az(42.9)], [ax(20.3), az(45.4)], [ax(20.3), az(42.9)], [ax(22.9), az(45.4)], [ax(22.9), az(42.9)]], 1.6, 8.5);
  const cl = []; const r = rng(5);
  for (let i = 0; i < 18; i++) cl.push([ax(26 + r() * 8), az(14 + r() * 8), r() < 0.5 ? 'r' : 'c', r() < 0.5 ? 0 : Math.PI / 2]);
  for (let i = 0; i < 12; i++) cl.push([ax(30 + r() * 30), az(26 + r() * 9), r() < 0.6 ? 'r' : 'c', r() < 0.5 ? 0 : Math.PI / 2]);
  chips(uno, cl, 1.6);
  for (const [X, Y, c] of [[30.0, 42.8, 0xffb000], [30.0, 40.2, 0xffb000], [30.0, 37.6, 0xffb000], [60.0, 32.0, 0x33ff66]]) led(uno, ax(X), 1.6, az(Y), c);
  femaleHeader(uno, 10, ax(18.796 + 4.5 * P), 1.6, az(50.8)); femaleHeader(uno, 8, ax(45.72 + 3.5 * P), 1.6, az(50.8));
  femaleHeader(uno, 8, ax(27.94 + 3.5 * P), 1.6, az(2.54)); femaleHeader(uno, 6, ax(50.8 + 2.5 * P), 1.6, az(2.54));

  // ---------- Sensor Shield V5 on top
  const SY = 15.2, top = 1.6;
  const sh = new THREE.Group(); sh.position.y = SY; g.add(sh);
  const s = new Face(W + 1.4, D + 2, '#1c4fb8', 9);
  s.traces(55, 4);
  for (const [x, z, rr] of HOLES) hole(s, x, z, rr);
  const dx = i => 28 - i * P;
  const rowZ = { S: -D / 2 + 1.6, V: -D / 2 + 1.6 + P, G: -D / 2 + 1.6 + 2 * P };
  const axx = i => 8 + i * P;
  const aZ = { S: D / 2 - 1.6, V: D / 2 - 1.6 - P, G: D / 2 - 1.6 - 2 * P };
  s.rect(dx(6.5), rowZ.V, 14 * P + 1.2, 3 * P + 1.2, { lw: 0.25 });
  for (let i = 0; i <= 13; i++) s.text(String(i), dx(i), rowZ.G + 2.7, 1.5);
  for (const k of ['S', 'V', 'G']) { s.text(k, dx(13) - 3.2, rowZ[k], 1.5); s.text(k, dx(0) + 3.0, rowZ[k], 1.5); }
  s.rect(axx(2.5), aZ.V, 6 * P + 1.2, 3 * P + 1.2, { lw: 0.25 });
  for (let i = 0; i <= 5; i++) s.text(String(i), axx(i), aZ.G - 2.7, 1.5);
  for (const k of ['S', 'V', 'G']) s.text(k, axx(5) + 3.0, aZ[k], 1.5);
  s.text('ANALOG IN', axx(2.5), aZ.G - 4.9, 1.5);
  s.text('Sensor Shield V5.0', 8, -8.6, 3.3, { weight: 800, font: 'Georgia, "Times New Roman", serif' });
  s.text('DIGITAL', dx(6.5), rowZ.G + 4.9, 1.5);
  s.text('IIC', -26 + 1.5 * P, 1.0, 1.4); s.text('BLUETOOTH', -26 + 1.5 * P, 15.0, 1.4);
  s.text('RESET', 26, 13.4, 1.3); s.text('5V GND', -12 + P / 2, D / 2 - 4.4, 1.3);
  s.text('SEL', 7.3, 14.0, 1.2); s.text('EXT_PWR', -25.6, D / 2 - 11.5, 1.2); s.text('PWR', 18, 15.4, 1.1);
  pcb(sh, s, { holes: HOLES, edge: 0x163a86 });
  const dig = []; for (let i = 0; i <= 13; i++) for (const k of ['S', 'V', 'G']) dig.push([dx(i), rowZ[k], `D${i}.${k}`]);
  const dt = malePins(sh, dig.map(([x, z]) => [x, z]), top, 8.5); dig.forEach(([, , n], i) => { pins[n] = dt[i]; });
  const an = []; for (let i = 0; i <= 5; i++) for (const k of ['S', 'V', 'G']) an.push([axx(i), aZ[k], `A${i}.${k}`]);
  const at = malePins(sh, an.map(([x, z]) => [x, z]), top, 8.5); an.forEach(([, , n], i) => { pins[n] = at[i]; });
  const pw = malePins(sh, [[-12, D / 2 - 1.6], [-12 + P, D / 2 - 1.6]], top, 8.5); pins['5V'] = pw[0]; pins.GND = pw[1];
  malePins(sh, [0, 1, 2, 3].map(i => [-26 + i * P, 4]), top, 6);
  malePins(sh, [0, 1, 2, 3].map(i => [-26 + i * P, 11]), top, 6);
  malePins(sh, [[4.8, 10.8], [7.3, 10.8], [9.8, 10.8]], top, 6);
  jumperCap(sh, 6.05, top + 1.0, 10.8, Math.PI / 2);
  terminal(sh, 2, -25.6, top, D / 2 - 6.2, 0, MAT.termGreen());
  button6(sh, 26, top, 8.4);
  smdCap(sh, 5, 5.2, 14, top, 6);
  chips(sh, [[10, 3, 'r', 0], [10, 0.6, 'c', 0], [17, 2.4, 'r', Math.PI / 2], [-14, 4, 'c', 0], [-14, 7, 'r', 0]], top);
  const pled = led(sh, 18, top, 13, 0x22ff66);
  for (const [hx, hz] of HOLES) { cyl(g, 1.9, 13.6, MAT.brass(), hx, 1.6, hz, 6); cyl(g, 2.6, 1.2, MAT.tin(), hx, SY + 1.6, hz, 6); }

  const out = {};
  for (const [k, v] of Object.entries(pins)) out[k] = v.clone().add(sh.position);
  return { group: g, pins: out, led: pled, shieldTopY: SY + top };
}

// ---------------------------------------------------------------- L298N dual H-bridge module
export function l298n(tag) {
  const g = new THREE.Group(); const pins = {};
  const f = new Face(43, 43, '#b71c1c', tag.length);
  f.traces(30, 3 + tag.length);
  const holes = [[-18.5, -18.5], [18.5, -18.5], [-18.5, 18.5], [18.5, 18.5]].map(([x, z]) => hole(f, x, z, 1.5));
  f.text('OUT1', -12.2, -8.5, 1.2); f.text('OUT2', -12.2, -3.5, 1.2);
  f.text('OUT3', 12.6, -3.5 + 6.2, 1.2); f.text('OUT4', 12.6, -8.5 + 6.2 - 2.5, 1.2);
  f.text('+12V', -14, 12.0, 1.2); f.text('GND', -9, 12.0, 1.2); f.text('+5V', -4, 12.0, 1.2);
  ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'].forEach((n, i) => f.text(n, 7.7 + i * P, 21.0, 0.85));
  f.text('L298N', 0, 0.6, 1.8, { weight: 800 });
  f.text('5V_EN', -15.5, 10.4, 1.0);
  pcb(g, f, { holes, edge: 0x6e1414 });
  // finned heatsink with the Multiwatt L298 bolted to its front face
  const hs = new THREE.Group(); hs.position.set(0, 1.6, -11); g.add(hs);
  rbox(hs, 23, 2.4, 15, MAT.anodized(), 0, 0, 0, 0.6, 0.3);
  for (let i = 0; i < 9; i++) rbox(hs, 1.2, 23, 15, MAT.anodized(), -9.6 + i * 2.4, 2.0, 0, 0.4, 0.3);
  rbox(hs, 23, 25, 2.0, MAT.anodized(), 0, 0, 6.6, 0.6, 0.3);
  const chip = new THREE.Group(); chip.position.set(0, 1.6, -2.5); g.add(chip);
  rbox(chip, 19.6, 10.2, 5.0, MAT.epoxy(), 0, 4.0, 0, 0.3, 0.3);
  box(chip, 19.6, 4.0, 0.6, MAT.tin(), 0, 13.6, -2.7);
  cyl(chip, 1.6, 0.8, MAT.steel(), 0, 16.0, 2.4, 16, 'z');
  const legPts = []; for (let i = 0; i < 15; i++) legPts.push([-8.4 + i * 1.2, 0, i % 2 ? 1.2 : -0.6]);
  inst(chip, geoBox(0.5, 4.2, 0.4), MAT.tin(), legPts);
  const mk = mark(chip, ['L298N', 'ST  E8'], 13, 6, 0, 0, 0, { color: 'rgba(205,205,200,.85)', weight: 600 });
  mk.rotation.x = 0; mk.position.set(0, 9.3, 2.53);
  // terminals: OUT1/OUT2 left, OUT3/OUT4 right (entries face outward), power at the front
  const tl = terminal(g, 2, -17.5, 1.6, -6, -Math.PI / 2, MAT.termBlue());
  const tr = terminal(g, 2, 17.5, 1.6, -6, Math.PI / 2, MAT.termBlue());
  pins.OUT1 = tl[0]; pins.OUT2 = tl[1]; pins.OUT3 = tr[1]; pins.OUT4 = tr[0];
  const tp = terminal(g, 3, -9, 1.6, 17.2, 0, MAT.termBlue());
  pins.VS = tp[0]; pins.GND = tp[1]; pins['5V'] = tp[2];
  // logic header ENA IN1 IN2 IN3 IN4 ENB plus the ENA / ENB jumper pins (jumpers off so the Uno can PWM them)
  const names = ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'];
  const lp = malePins(g, names.map((n, i) => [7.7 + i * P, 18.5]), 1.6, 8.5);
  names.forEach((n, i) => { pins[n] = lp[i]; });
  malePins(g, [[7.7, 18.5 - P], [7.7 + 5 * P, 18.5 - P]], 1.6, 8.5);
  // 5V_EN jumper, 78M05, filter caps, flyback diodes, LED
  malePins(g, [[-15.5, 14.6], [-15.5, 12.1]], 1.6, 6, { alongZ: true });
  jumperCap(g, -15.5, 1.6 + 1.2, 13.35);
  to252(g, -3.5, 1.6, 8.0, Math.PI, '78M05');
  eCap(g, 8, 11, 6.5, 1.6, 4.5, { text: '220µF 35V', bandAt: 2.4 });
  eCap(g, 5, 7, -14.5, 1.6, 4.5, { text: '10µF 50V', bandAt: 2.4 });
  for (let i = 0; i < 4; i++) sma(g, 14.4, 1.6, 1.0 + i * 3.0, 0);
  chips(g, [[-6, 15, 'r', 0], [-2.5, 15, 'r', 0], [1, 15, 'c', 0]], 1.6);
  const pled = led(g, 16.5, 1.6, 13.2, 0xff2a2a);
  return { group: g, pins, led: pled };
}

// ---------------------------------------------------------------- HC-05 on its breakout board
export function hc05() {
  const g = new THREE.Group(); const pins = {};
  const f = new Face(37.3, 15.5, '#1d58c4', 21);
  f.traces(12, 21);
  const names = ['STATE', 'RXD', 'TXD', 'GND', 'VCC', 'EN'];
  names.forEach((n, i) => { f.text(n, 14.6, (i - 2.5) * P, 1.15, { align: 'right' }); f.pad(16.9, (i - 2.5) * P, 0.85, { square: i === 0 }); });
  f.text('LEVEL: 3.3V', -4, 7.0, 0.95); f.text('POWER: 3.6V-6V', -4, -7.0, 0.95);
  pcb(g, f, { edge: 0x173f8a });
  // core module: green, castellated pads, antenna meander
  const core = new THREE.Group(); core.position.set(-4.4, 1.6, 0); g.add(core);
  const cf = new Face(27, 13, '#1e7a43', 4);
  for (let i = 0; i < 13; i++) for (const s2 of [-1, 1]) cf.smdPad(-13.5 + 2.8 + i * 1.5 + 4.5, s2 * 6.1, 0.9, 1.2);
  const zig = []; let zx = -12.8; for (let i = 0; i < 5; i++) { zig.push([zx, -5], [zx, 5], [zx + 0.6, 5], [zx + 0.6, -5]); zx += 1.2; }
  cf.line(zig, { color: '#c9b37a', lw: 0.45 });
  pcb(core, cf, { t: 0.9, r: 0.4, edge: 0x14522d });
  rbox(core, 11, 1.6, 9, MAT.steel(), 3.5, 0.9, 0, 0.4, 0.15);
  mark(core, ['HC-05'], 8, 2.6, 3.5, 2.5, 0, { color: 'rgba(40,40,44,.75)', weight: 700 });
  tqfp(core, 4.5, 11.2, 0.9, 0);
  // right-angle header pointing +x
  for (let i = 0; i < 6; i++) {
    const z = (i - 2.5) * P;
    rbox(g, 2.5, P - 0.05, P - 0.05, MAT.plastic(), 18.0, 1.6, z, 0.15, 0.2);
    box(g, 0.64, 3.2, 0.64, MAT.gold(), 16.9, -1.6, z);
    box(g, 9.0, 0.64, 0.64, MAT.gold(), 22.0, 2.6, z);
    pins[names[i]] = new THREE.Vector3(26.7, 2.9, z); pins[names[i]].dir = new THREE.Vector3(1, 0, 0);
  }
  button6(g, -14.4, 1.6, -4.0, 0.6);
  sot223(g, 9.5, 1.6, -4.6, 0, '662K');
  chips(g, [[9.5, 3.0, 'r', 0], [9.5, 5.6, 'c', 0], [12.2, 5.6, 'r', 0]], 1.6);
  const pled = led(g, -14.6, 1.6, 5.6, 0xff2222);
  return { group: g, pins, led: pled };
}

// ---------------------------------------------------------------- LM2596 buck module
export function lm2596() {
  const g = new THREE.Group(); const pins = {};
  const f = new Face(43, 21, '#1d58c4', 33);
  f.traces(16, 33);
  const PADS = [['IN+', -19.4, -6.6], ['IN-', -19.4, 6.6], ['OUT+', 19.4, -6.6], ['OUT-', 19.4, 6.6]];
  for (const [n, x, z] of PADS) { f.pad(x, z, 1.7); f.text(n, x + (x < 0 ? 4.4 : -4.6), z, 1.25); }
  f.text('DC-DC', -7, -9.0, 1.2); f.text('LM2596', 7, 9.3, 1.2);
  const holes = [[-15.5, -7.8], [15.5, 7.8]].map(([x, z]) => hole(f, x, z, 1.5));
  pcb(g, f, { holes, edge: 0x173f8a });
  rbox(g, 12, 7, 12, std(0x1b1b1d, { roughness: 0.75 }), -1.5, 1.6, -1.2, 1.4, 0.6);
  mark(g, ['330'], 6, 3, -1.5, 8.6, -1.2, { color: 'rgba(220,220,215,.8)', weight: 700 });
  to263(g, 10.5, 1.6, -3.0, Math.PI, ['LM2596S', '-ADJ']);
  eCap(g, 8, 10, -13.0, 1.6, 1.0, { text: '220µF 50V', bandAt: 0.4 });
  eCap(g, 8, 10, 13.6, 1.6, 5.3, { text: '220µF 35V', bandAt: 3.4 });
  trimpot(g, 2.6, 1.6, 6.0, Math.PI);
  sma(g, -7.5, 1.6, -8.4, 0);
  chips(g, [[-7.0, 8.4, 'r', 0], [-10.0, 8.4, 'r', 0]], 1.6);
  for (const [n, x, z] of PADS) pins[n] = new THREE.Vector3(x, 1.8, z);
  const pled = led(g, 15.5, 1.6, -8.6, 0x3399ff);
  return { group: g, pins, led: pled };
}

// ---------------------------------------------------------------- servo BEC in clear blue heat-shrink
export function bec() {
  const g = new THREE.Group(); const pins = {};
  const f = new Face(24, 9.5, '#0f5e2e', 41); f.traces(6, 41);
  const inner = new THREE.Group(); inner.position.set(0, 2.2, 0); g.add(inner);
  pcb(inner, f, { t: 1.0, r: 0.4, edge: 0x0b3d1f });
  rbox(inner, 6, 3.2, 6, std(0x1b1b1d, { roughness: 0.7 }), -4, 1.0, 0, 0.8, 0.4);
  to252(inner, 5, 1.0, 0, Math.PI / 2, null);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(5.0, 20, 8, 24), MAT.shrink()); body.rotation.z = Math.PI / 2; body.scale.set(1, 0.72, 1); body.position.y = 4.4; body.castShadow = true; g.add(body);
  mark(g, ['SERVO BEC'], 12, 3, 0, 8.05, 0, { color: 'rgba(255,255,255,.92)', weight: 800 });
  for (const [x0, z, col] of [[-20, -1.8, 0xd23b2f], [-20, 1.8, 0x1e1e20], [14, -1.8, 0xd23b2f], [14, 1.8, 0x1e1e20]]) cyl(g, 0.75, 6, std(col, { roughness: 0.5 }), x0, 4.0, z, 12, 'x');
  pins['IN+'] = new THREE.Vector3(-20, 4, -1.8); pins['IN-'] = new THREE.Vector3(-20, 4, 1.8);
  pins['OUT+'] = new THREE.Vector3(20, 4, -1.8); pins['OUT-'] = new THREE.Vector3(20, 4, 1.8);
  for (const k of ['IN+', 'IN-']) pins[k].dir = new THREE.Vector3(-1, 0, 0);
  for (const k of ['OUT+', 'OUT-']) pins[k].dir = new THREE.Vector3(1, 0, 0);
  return { group: g, pins };
}

// ---------------------------------------------------------------- servo power block (perfboard with two pin rows)
export function servoBus() {
  const g = new THREE.Group(); const pins = {};
  const f = new Face(22, 14, '#c99a5c', 51);
  for (let x = -9.5; x <= 9.6; x += P) for (let z = -5.5; z <= 5.6; z += P) f.pad(x, z, 0.75, { color: '#d8b07a' });
  f.line([[-10, -4.6], [10, -4.6]], { color: '#c0392b', lw: 0.6 }); f.line([[-10, 4.6], [10, 4.6]], { color: '#222', lw: 0.6 });
  pcb(g, f, { edge: 0x9c7442, r: 0.6 });
  const pp = [], nn = [];
  for (let i = 0; i <= 5; i++) { const x = (i - 2.5) * P * 1.2; if (i <= 4) pp.push([x, -2.2]); nn.push([x, 2.2]); }
  const pt = malePins(g, pp, 1.6, 7), nt = malePins(g, nn, 1.6, 7);
  pt.forEach((v, i) => { pins['P' + i] = v; }); nt.forEach((v, i) => { pins['N' + i] = v; });
  return { group: g, pins };
}

// ---------------------------------------------------------------- continuous-rotation micro servo
let _sticker;
function servoSticker() {
  if (_sticker) return _sticker;
  const c = document.createElement('canvas'); c.width = 420; c.height = 300; const g = c.getContext('2d');
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, 420, 300);
  g.fillStyle = '#1d1d1f'; g.font = '800 96px Arial'; g.textAlign = 'center'; g.fillText('360°', 210, 120);
  g.font = '600 36px Arial'; g.fillText('CONTINUOUS ROTATION', 210, 185); g.fillText('SERVO', 210, 228);
  g.fillStyle = '#2a63d4'; g.fillRect(0, 262, 420, 38);
  _sticker = new THREE.CanvasTexture(c); _sticker.colorSpace = THREE.SRGBColorSpace; _sticker.anisotropy = 8; return _sticker;
}
export function servo() {
  const g = new THREE.Group(); const pins = {};
  rbox(g, 22.5, 15.4, 12.2, MAT.servoBlue(), 0, 0, 0, 0.8, 0.5);
  for (const s of [-1, 1]) {
    rbox(g, 5.0, 2.4, 12.2, MAT.servoBlue(), s * 13.6, 15.6, 0, 0.6, 0.3);
    cyl(g, 1.0, 2.5, std(0x0a0a0a, { roughness: 1 }), s * 14.3, 15.55, 0, 12);
  }
  rbox(g, 22.5, 7.3, 12.2, MAT.servoBlue(), 0, 15.4, 0, 0.8, 0.4);
  const st = new THREE.Mesh(new THREE.PlaneGeometry(15, 10.7), new THREE.MeshStandardMaterial({ map: servoSticker(), roughness: 0.55 }));
  st.position.set(0, 8.0, 6.13); g.add(st);
  rbox(g, 22.5, 4.0, 12.2, MAT.servoBlue(), 0, 22.7, 0, 0.8, 0.5);
  cyl(g, 5.9, 3.6, MAT.servoBlue(), 5.3, 26.0, 0, 32); cyl(g, 3.0, 2.5, MAT.servoBlue(), -1.2, 26.0, 0, 24);
  cyl(g, 2.4, 3.2, MAT.white(), 5.3, 28.4, 0, 18);
  const horn = new THREE.Group(); horn.position.set(5.3, 31.4, 0); g.add(horn);
  cyl(horn, 3.6, 2.0, MAT.nylon(), 0, 0, 0, 28);
  for (let i = 0; i < 4; i++) {
    const len = i % 2 ? 10 : 15;
    const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / 2; horn.add(arm);
    const s2 = new THREE.Shape(); s2.moveTo(0, -2.6); s2.lineTo(len, -1.4); s2.absarc(len, 0, 1.4, -Math.PI / 2, Math.PI / 2, false); s2.lineTo(0, 2.6); s2.closePath();
    const geo = new THREE.ExtrudeGeometry(s2, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 2 }); geo.rotateX(-Math.PI / 2);
    mesh(geo, MAT.nylon(), arm, 0, 0.2, 0);
    for (let k = 4.5; k < len; k += 2.6) cyl(arm, 0.45, 1.9, std(0x0a0a0a, { roughness: 1 }), k, 0.25, 0, 10);
  }
  cyl(horn, 1.1, 0.5, MAT.steel(), 0, 2.0, 0, 16);
  // lead: brown / red / orange ribbon into a 3-pin housing
  const cols = [0x5a3a22, 0xd23b2f, 0xf08a24];
  for (let i = 0; i < 3; i++) cyl(g, 0.55, 8.5, std(cols[i], { roughness: 0.55 }), -11.25, 3.0, (i - 1) * 1.1, 10, '-x');
  rbox(g, 5.0, 2.6, 7.6, MAT.plastic(), -22.0, 1.7, 0, 0.3, 0.3);
  pins.GND = new THREE.Vector3(-24.6, 3.0, -P); pins.VCC = new THREE.Vector3(-24.6, 3.0, 0); pins.SIG = new THREE.Vector3(-24.6, 3.0, P);
  for (const k of ['GND', 'VCC', 'SIG']) pins[k].dir = new THREE.Vector3(-1, 0, 0);
  return { group: g, pins, spin: horn };
}

// ---------------------------------------------------------------- yellow TT gear motor with a crank
export function gearMotor() {
  const g = new THREE.Group(); const pins = {};
  const prof = new THREE.Shape(); const L = 37, H = 22.5, rr = 5;
  prof.moveTo(-L / 2, 0); prof.lineTo(L / 2 - rr, 0); prof.quadraticCurveTo(L / 2, 0, L / 2, rr); prof.lineTo(L / 2, H - rr); prof.quadraticCurveTo(L / 2, H, L / 2 - rr, H); prof.lineTo(-L / 2, H); prof.closePath();
  for (const z0 of [-9.4, 0.2]) mesh(new THREE.ExtrudeGeometry(prof, { depth: 9.2, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2 }), MAT.yellow(), g, 0, 0, z0);
  rbox(g, 10, 22.5, 7, MAT.yellow(), 23, 0, 0, 1.2, 0.5);
  cyl(g, 1.6, 7.4, std(0x0a0a0a, { roughness: 1 }), 24.5, 7.6, -3.7, 14, 'z');
  for (const [x, y] of [[-14, 3], [-14, 19.5], [12, 3], [12, 19.5]]) cyl(g, 1.1, 0.4, MAT.steel(), x, y, 9.85, 12, 'z');
  cyl(g, 10, 21, MAT.brushed(), -39.5, 11.25, 0, 40, 'x');
  cyl(g, 10.05, 0.6, std(0x8d9198, { metalness: 1, roughness: 0.4 }), -26, 11.25, 0, 40, 'x');
  cyl(g, 9.6, 3.2, MAT.white(), -42.7, 11.25, 0, 40, 'x');
  for (const s of [-1, 1]) box(g, 1.0, 5, 2.6, MAT.brass(), -43.2, 17.0, s * 3.4);
  pins['+'] = new THREE.Vector3(-43.2, 21.5, -3.4); pins['-'] = new THREE.Vector3(-43.2, 21.5, 3.4);
  // output: white D-shaft and an aluminium crank (what drives the leg linkage)
  const hub = new THREE.Group(); hub.position.set(5, 11.25, -9.9); hub.rotation.y = Math.PI; g.add(hub);
  cyl(hub, 2.7, 8, MAT.white(), 0, 0, 0, 16, 'z');
  const crank = new THREE.Group(); crank.position.z = 7.5; hub.add(crank);
  const cs = new THREE.Shape(); cs.absarc(0, 0, 5, Math.PI / 2, Math.PI * 1.5, false); cs.absarc(14, 0, 3.4, -Math.PI / 2, Math.PI / 2, false); cs.closePath();
  const ch = new THREE.Path(); ch.absarc(14, 0, 1.3, 0, Math.PI * 2, true); cs.holes.push(ch);
  mesh(new THREE.ExtrudeGeometry(cs, { depth: 3, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2, curveSegments: 20 }), std(0xb7bcc4, { metalness: 1, roughness: 0.3 }), crank);
  cyl(crank, 1.3, 6, MAT.steel(), 14, 0, 2.5, 16, 'z');
  cyl(crank, 1.8, 1, MAT.steel(), 0, 0, 3.0, 6, 'z');
  return { group: g, pins, spin: hub };
}

// ---------------------------------------------------------------- 2-cell battery holder
const wrapCache = {};
function wrapTex(color, flip = false) {
  const key = color + (flip ? '/f' : '');
  if (wrapCache[key]) return wrapCache[key];
  // u runs around the cell, v along its length: print the text along v
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 256, 1024);
  g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(0, 70, 256, 10); g.fillRect(0, 944, 256, 10);
  g.fillStyle = 'rgba(255,255,255,.88)'; g.font = '700 46px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const u of [64, 192]) { g.save(); g.translate(u, 512); g.rotate(flip ? -Math.PI / 2 : Math.PI / 2); g.fillText('Li-ion  RECHARGEABLE', 0, 0); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return (wrapCache[key] = t);
}
export function battery(name, cellMat, flip = false) {   // flip: the holder is placed turned round, keep the print readable
  const g = new THREE.Group(); const pins = {};
  const holder = std(0x1a1a1c, { roughness: 0.7 });
  rbox(g, 77, 2.4, 42, holder, 0, 0, 0, 2, 0.6);
  for (const s of [-1, 1]) { rbox(g, 77, 15, 1.6, holder, 0, 0, s * 20.2, 0.6, 0.4); rbox(g, 2.4, 15, 42, holder, s * 37.3, 0, 0, 0.6, 0.4); }
  rbox(g, 73, 6, 1.4, holder, 0, 2.4, 0, 0.5, 0.4);
  const wrap = new THREE.MeshPhysicalMaterial({ map: wrapTex('#' + cellMat.color.getHexString(), flip), roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.15 });
  for (const z of [-10, 10]) {
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(9.1, 9.1, 64, 40, 1, true), wrap);
    cell.rotation.set(z > 0 ? Math.PI : 0, 0, Math.PI / 2); cell.position.set(-1, 11.6, z); cell.castShadow = cell.receiveShadow = true; g.add(cell);
    cyl(g, 9.0, 0.6, MAT.brushed(), -33.6, 11.6, z, 40, 'x'); cyl(g, 9.0, 0.6, MAT.brushed(), 30.9, 11.6, z, 40, 'x');
    cyl(g, 3.0, 1.0, MAT.steel(), 31.5, 11.6, z, 24, 'x');
    const pts = []; for (let i = 0; i <= 120; i++) { const a = i / 120 * Math.PI * 2 * 5, k = 1 - i / 240; pts.push(new THREE.Vector3(-34.2 - i / 120 * 2.6, 11.6 + Math.sin(a) * 4 * k, z + Math.cos(a) * 4 * k)); }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.35, 6), MAT.steel(), g);
  }
  box(g, 0.6, 12, 36, MAT.steel(), -36.0, 3, 0); box(g, 0.6, 12, 36, MAT.steel(), 35.6, 3, 0);
  pins['+'] = new THREE.Vector3(40.5, 6, -14); pins['-'] = new THREE.Vector3(40.5, 6, 14);
  pins['+'].dir = new THREE.Vector3(1, 0, 0); pins['-'].dir = new THREE.Vector3(1, 0, 0);
  cyl(g, 0.9, 4, std(0xd23b2f, { roughness: 0.5 }), 37, 6, -14, 12, 'x'); cyl(g, 0.9, 4, std(0x1e1e20, { roughness: 0.5 }), 37, 6, 14, 12, 'x');
  return { group: g, pins };
}
