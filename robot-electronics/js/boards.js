// Procedural models of every board, module and actuator. Units: millimetres.
// Each builder returns { group, pins: { name: Vector3 (local) }, spin?: Object3D, led?: Mesh }.
import * as THREE from 'three';

const P = 2.54;
const M = {};
function mat(key, make) { return M[key] || (M[key] = make()); }
const phys = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.35, ...o });
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });

export const MAT = {
  unoPcb: () => mat('unoPcb', () => phys(0x00818a, { roughness: 0.5 })),
  shieldPcb: () => mat('shieldPcb', () => phys(0x1d3f9a, { roughness: 0.5 })),
  redPcb: () => mat('redPcb', () => phys(0xb3201e, { roughness: 0.5 })),
  bluePcb: () => mat('bluePcb', () => phys(0x1f5fbf, { roughness: 0.5 })),
  greenPcb: () => mat('greenPcb', () => phys(0x2f7d4b, { roughness: 0.55 })),
  silk: () => mat('silk', () => std(0xf2f2f2, { roughness: 0.8 })),
  black: () => mat('black', () => phys(0x151517, { roughness: 0.55 })),
  plastic: () => mat('plastic', () => std(0x1b1b1d, { roughness: 0.7 })),
  gold: () => mat('gold', () => std(0xd8b25a, { metalness: 1, roughness: 0.28 })),
  tin: () => mat('tin', () => std(0xc9ccd1, { metalness: 1, roughness: 0.3 })),
  steel: () => mat('steel', () => std(0xb8bcc4, { metalness: 1, roughness: 0.22 })),
  alu: () => mat('alu', () => std(0x222326, { metalness: 0.6, roughness: 0.45 })),
  copper: () => mat('copper', () => std(0xb8733b, { metalness: 1, roughness: 0.35 })),
  termBlue: () => mat('termBlue', () => phys(0x2a6fd6, { roughness: 0.5 })),
  termGreen: () => mat('termGreen', () => phys(0x2f9a52, { roughness: 0.5 })),
  capBlack: () => mat('capBlack', () => phys(0x222a44, { roughness: 0.4 })),
  potBlue: () => mat('potBlue', () => phys(0x2b62d9)),
  servoBlue: () => mat('servoBlue', () => phys(0x2a64c8, { transmission: 0.25, thickness: 4, roughness: 0.35 })),
  white: () => mat('white', () => phys(0xf4f4f2, { roughness: 0.4 })),
  yellow: () => mat('yellow', () => phys(0xf2c230, { roughness: 0.45 })),
  cellBlue: () => mat('cellBlue', () => phys(0x2f78d8, { roughness: 0.3, clearcoat: 0.8 })),
  cellGreen: () => mat('cellGreen', () => phys(0x3aa063, { roughness: 0.3, clearcoat: 0.8 })),
  heatBlue: () => mat('heatBlue', () => phys(0x3b6fd0, { roughness: 0.6 })),
  ceramic: () => mat('ceramic', () => std(0xa8a49a, { roughness: 0.8 })),
};

function box(w, h, d, m, x = 0, y = 0, z = 0, parent) {
  const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  g.position.set(x, y + h / 2, z); g.castShadow = g.receiveShadow = true;
  if (parent) parent.add(g); return g;
}
function cyl(r, h, m, x = 0, y = 0, z = 0, parent, seg = 24, axis = 'y') {
  const g = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  g.castShadow = g.receiveShadow = true;
  if (axis === 'x') { g.rotation.z = Math.PI / 2; g.position.set(x + h / 2, y, z); }
  else if (axis === 'z') { g.rotation.x = Math.PI / 2; g.position.set(x, y, z + h / 2); }
  else g.position.set(x, y + h / 2, z);
  if (parent) parent.add(g); return g;
}
function pcb(w, d, m, parent, t = 1.6, holes = []) {
  const s = new THREE.Shape();
  const r = 1.2;
  s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2);
  s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
  for (const [hx, hz, hr] of holes) { const h = new THREE.Path(); h.absarc(hx, -hz, hr, 0, Math.PI * 2, true); s.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
  // plated rings around mounting holes
  for (const [hx, hz, hr] of holes) { const ring = new THREE.Mesh(new THREE.RingGeometry(hr, hr + 1.1, 20), MAT.tin()); ring.rotation.x = -Math.PI / 2; ring.position.set(hx, t + 0.02, hz); parent.add(ring); }
  return mesh;
}
// silkscreen text as a canvas texture on a thin plane
const texCache = new Map();
function label(text, w, h, parent, x, y, z, o = {}) {
  const key = text + '|' + (o.color || '#fff') + '|' + (o.bg || '');
  let tex = texCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas'); const px = 16; c.width = Math.max(32, Math.round(w * px)); c.height = Math.max(16, Math.round(h * px));
    const g = c.getContext('2d');
    if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, c.width, c.height); }
    g.fillStyle = o.color || '#f2f2f2'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = c.height * 0.8; g.font = `${o.weight || 600} ${fs}px ui-monospace, Consolas, monospace`;
    while (g.measureText(text).width > c.width * 0.96 && fs > 6) { fs -= 1; g.font = `${o.weight || 600} ${fs}px ui-monospace, Consolas, monospace`; }
    g.fillText(text, c.width / 2, c.height / 2 + 1);
    tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; texCache.set(key, tex);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: !o.bg, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; if (o.rot) m.rotation.z = o.rot;
  m.position.set(x, y + 0.03, z); parent.add(m); return m;
}
// male header pin (plastic base + gold post); returns tip position
function malePin(parent, x, y, z, len = 8.5, base = true) {
  if (base) box(P, 2.5, P, MAT.plastic(), x, y, z, parent);
  box(0.64, len, 0.64, MAT.gold(), x, y - 2.5, z, parent);
  return new THREE.Vector3(x, y + len - 2.5, z);
}
function femaleHeader(parent, n, x, y, z, along = 'x') {
  const w = along === 'x' ? n * P : P, d = along === 'x' ? P : n * P;
  box(w, 8.5, d, MAT.plastic(), x, y, z, parent);
  for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * P; box(0.9, 0.1, 0.9, MAT.black(), along === 'x' ? x + o : x, y + 8.5, along === 'x' ? z : z + o, parent); }
}
function smd(parent, w, d, h, x, y, z, m = MAT.black()) { box(w, h, d, m, x, y, z, parent); }
function eCap(parent, r, h, x, y, z, m = MAT.capBlack()) {
  cyl(r, h, m, x, y, z, parent, 28);
  const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 28), MAT.tin()); top.rotation.x = -Math.PI / 2; top.position.set(x, y + h + 0.02, z); parent.add(top);
  const stripe = box(r * 0.5, h * 0.96, 0.2, MAT.silk(), x - r * 0.25, y + h * 0.02, z + r * 0.99, parent); stripe.material = std(0xd9dde6);
}
function terminalPins(parent, n, x, y, z, rot, m) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; parent.add(g);
  const pitch = 5.0, w = n * pitch;
  box(w, 10, 7.5, m || MAT.termBlue(), 0, 0, 0, g);
  const out = [];
  for (let i = 0; i < n; i++) {
    const ox = (i - (n - 1) / 2) * pitch;
    cyl(1.6, 0.6, MAT.steel(), ox, 10, -1.2, g, 16);
    box(3.0, 0.3, 0.5, MAT.black(), ox, 10.6, -1.2, g);
    box(3.6, 3.4, 0.4, MAT.black(), ox, 2.8, 3.6, g);
    const v = new THREE.Vector3(ox, 4.4, 4.2);
    v.applyEuler(g.rotation).add(g.position); out.push(v);
  }
  return out;
}
function chipDIP(parent, pins, x, y, z, text) {
  const len = pins / 2 * P, w = 7.4;
  box(len, 3.4, w, MAT.black(), x, y + 0.5, z, parent);
  const notch = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), MAT.plastic()); notch.rotation.x = -Math.PI / 2; notch.position.set(x - len / 2 + 1.2, y + 3.92, z); parent.add(notch);
  for (let i = 0; i < pins / 2; i++) for (const s of [-1, 1]) box(0.5, 3.5, 0.6, MAT.tin(), x - len / 2 + P / 2 + i * P, y - 1, z + s * (w / 2 + 0.3), parent);
  if (text) label(text, len * 0.8, 2, parent, x, y + 3.9, z, { color: '#cfd2d6', weight: 500 });
}
function led(parent, x, y, z, color) {
  const m = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: color, emissiveIntensity: 0.0, roughness: 0.3 });
  const l = box(1.6, 0.7, 0.8, m, x, y, z, parent); l.userData.on = color; return l;
}

// ---------------------------------------------------------------- Arduino Uno + Sensor Shield V5 stack
export function unoStack() {
  const g = new THREE.Group(); const pins = {};
  const W = 68.6, D = 53.3, holes = [[-W / 2 + 14, D / 2 - 2.5, 1.6], [-W / 2 + 15.3, -D / 2 + 2.5, 1.6], [W / 2 - 2.5, D / 2 - 7.6, 1.6], [W / 2 - 2.5, -D / 2 + 20.3, 1.6]];
  // Uno
  const uno = new THREE.Group(); g.add(uno);
  pcb(W, D, MAT.unoPcb(), uno, 1.6, holes);
  box(16, 11, 12, MAT.steel(), -W / 2 + 6.2, 1.6, -D / 2 + 13.4, uno);           // USB-B
  box(13.6, 0.5, 9.4, MAT.plastic(), -W / 2 + 4.4, 12.6, -D / 2 + 13.4, uno);
  box(14, 11, 9, MAT.black(), -W / 2 + 6, 1.6, D / 2 - 7.7, uno);                  // barrel jack
  chipDIP(uno, 28, 12, 6.0, 9, 'ATMEGA328P');
  box(37, 2.5, 9, MAT.plastic(), 12, 1.6, 9, uno);                                  // DIP socket
  box(11, 4.5, 4.5, MAT.tin(), -12, 1.6, -4, uno).scale.set(1, 1, 1);             // crystal can
  eCap(uno, 3.1, 7, -22, 1.6, 9); eCap(uno, 3.1, 7, -22, 1.6, 16.5);
  smd(uno, 6.5, 6.5, 1.6, -13, 1.6, 14, MAT.black());                              // regulator
  femaleHeader(uno, 10, -2, 1.6, -D / 2 + 2, 'x'); femaleHeader(uno, 8, 22, 1.6, -D / 2 + 2, 'x');
  femaleHeader(uno, 8, -4, 1.6, D / 2 - 2, 'x'); femaleHeader(uno, 6, 21, 1.6, D / 2 - 2, 'x');
  // stacking pins up to the shield
  for (const [x, n] of [[-2, 10], [22, 8]]) for (let i = 0; i < n; i++) box(0.64, 9, 0.64, MAT.gold(), x + (i - (n - 1) / 2) * P, 10.1, -D / 2 + 2, uno);
  for (const [x, n] of [[-4, 8], [21, 6]]) for (let i = 0; i < n; i++) box(0.64, 9, 0.64, MAT.gold(), x + (i - (n - 1) / 2) * P, 10.1, D / 2 - 2, uno);
  label('UNO', 10, 4, uno, 30, 1.6, -9, { weight: 800 });

  // Sensor Shield V5 on top
  const sh = new THREE.Group(); sh.position.y = 15.2; g.add(sh);
  pcb(W + 1.4, D + 2, MAT.shieldPcb(), sh, 1.6, holes);
  const top = 1.6;
  // digital rows D0..D13 along the back edge: S outermost, then V, then G
  const dx = i => 28 - i * P;  // D0 at the right end
  const rowZ = { S: -D / 2 + 1.6, V: -D / 2 + 1.6 + P, G: -D / 2 + 1.6 + 2 * P };
  for (let i = 0; i <= 13; i++) {
    for (const r of ['S', 'V', 'G']) pins[`D${i}.${r}`] = malePin(sh, dx(i), top, rowZ[r]);
    label(String(i), 2.3, 1.8, sh, dx(i), top, rowZ.G + 2.6, { weight: 700 });
  }
  label('G  V  S', 7.4, 1.6, sh, dx(13) - 4, top, rowZ.V, { rot: -Math.PI / 2 });
  // analog rows A0..A5 along the front edge, S outermost
  const ax = i => 8 + i * P;
  const aZ = { S: D / 2 - 1.6, V: D / 2 - 1.6 - P, G: D / 2 - 1.6 - 2 * P };
  for (let i = 0; i <= 5; i++) {
    for (const r of ['S', 'V', 'G']) pins[`A${i}.${r}`] = malePin(sh, ax(i), top, aZ[r]);
    label('A' + i, 2.4, 1.6, sh, ax(i), top, aZ.G - 2.6, { weight: 700 });
  }
  // power header (5V / GND) on the front-left
  pins['5V'] = malePin(sh, -12, top, D / 2 - 1.6); pins['GND'] = malePin(sh, -12 + P, top, D / 2 - 1.6);
  label('5V GND', 6, 1.6, sh, -12 + P / 2, top, D / 2 - 4.2, { weight: 700 });
  // decorative: IIC, UART and Bluetooth headers, reset button, power LED
  for (let i = 0; i < 4; i++) malePin(sh, -26 + i * P, top, 4, 6);
  for (let i = 0; i < 4; i++) malePin(sh, -26 + i * P, top, 11, 6);
  label('IIC', 5, 1.6, sh, -22.2, top, 1.4); label('BLUETOOTH', 9, 1.6, sh, -22.2, top, 14);
  box(6, 3.5, 6, MAT.black(), 26, top, 8, sh); cyl(1.6, 1.2, MAT.black(), 26, top + 3.5, 8, sh);
  label('RESET', 6, 1.4, sh, 26, top, 12.6);
  label('SENSOR SHIELD V5.0', 26, 2.8, sh, 2, top, -2, { weight: 800 });
  const pled = led(sh, 18, top, 13, 0x33ff66);
  // stand-off columns
  for (const [hx, hz] of holes) cyl(1.9, 13.6, MAT.tin(), hx, 1.6, hz, g, 6);

  // pins of the Uno itself are reached through the shield header
  const out = {};
  for (const [k, v] of Object.entries(pins)) out[k] = v.clone().add(sh.position);
  return { group: g, pins: out, led: pled, shieldTopY: 15.2 + top };
}

// ---------------------------------------------------------------- L298N dual H-bridge module
export function l298n(tag) {
  const g = new THREE.Group(); const pins = {};
  pcb(43, 43, MAT.redPcb(), g, 1.6, [[-18.5, -18.5, 1.5], [18.5, -18.5, 1.5], [-18.5, 18.5, 1.5], [18.5, 18.5, 1.5]]);
  // heatsink with fins
  const hs = new THREE.Group(); hs.position.set(0, 1.6, -10); g.add(hs);
  box(23, 3, 16, MAT.alu(), 0, 0, 0, hs);
  for (let i = 0; i < 8; i++) box(1.4, 22, 16, MAT.alu(), -10.5 + i * 3, 3, 0, hs);
  box(23, 22, 1.6, MAT.alu(), 0, 3, 7.2, hs);
  box(20, 4, 3, MAT.black(), 0, 1.6, -0.5, g); // L298 body peeking under the sink
  for (let i = 0; i < 15; i++) box(0.5, 3, 0.5, MAT.tin(), -8.4 + i * 1.2, -0.6, 1.4, g);
  // output terminals: OUT1/OUT2 left edge, OUT3/OUT4 right edge
  const tl = terminalPins(g, 2, -17.5, 1.6, -6, Math.PI / 2);
  const tr = terminalPins(g, 2, 17.5, 1.6, -6, -Math.PI / 2);
  pins.OUT1 = tl[1]; pins.OUT2 = tl[0]; pins.OUT3 = tr[0]; pins.OUT4 = tr[1];
  // power terminal: +12V, GND, +5V at the front-left
  const tp = terminalPins(g, 3, -9, 1.6, 17.2, 0);
  pins.VS = tp[0]; pins.GND = tp[1]; pins['5V'] = tp[2];
  label('12V GND 5V', 15, 1.6, g, -9, 1.6, 11.4, { weight: 700 });
  // logic header ENA IN1 IN2 IN3 IN4 ENB (jumpers off ENA/ENB)
  const names = ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'];
  for (let i = 0; i < 6; i++) pins[names[i]] = malePin(g, 8 + i * P - 6.3 + 6, 1.6, 18.5);
  for (const i of [0, 5]) malePin(g, 8 + i * P - 6.3 + 6, 1.6, 18.5 - P);
  label('ENA IN1 IN2 IN3 IN4 ENB', 15.6, 1.4, g, 8 + 2.5 * P - 0.3, 1.6, 15.2, { weight: 700 });
  // caps, regulator, jumper, LED
  eCap(g, 4, 10, 4, 1.6, 6.5); eCap(g, 2.5, 6, -16, 1.6, 9.5);
  box(6.5, 2.4, 6, MAT.black(), -4, 1.6, 6.5, g);
  box(5, 2.5, 2.5, MAT.plastic(), -15.5, 1.6, 14, g); box(2.4, 5, 2.4, MAT.black(), -15.5, 4.1, 14, g);
  for (let i = 0; i < 8; i++) cyl(1.4, 4, MAT.black(), 12 + (i % 4) * 3.2 - 4.6, 1.6, 4 + Math.floor(i / 4) * 3.5, g, 12);
  const pled = led(g, 15, 1.6, 12, 0xff3333);
  label(tag, 14, 3.4, g, 0, 1.6, 9.6, { weight: 800 });
  return { group: g, pins, led: pled };
}

// ---------------------------------------------------------------- HC-05 on its breakout
export function hc05() {
  const g = new THREE.Group(); const pins = {};
  pcb(37, 16, MAT.bluePcb(), g);
  box(27, 2.2, 13, MAT.greenPcb(), -3, 1.6, 0, g);
  box(9, 1.6, 9, MAT.tin(), -6, 3.8, 0, g); // shield can
  for (let i = 0; i < 13; i++) for (const s of [-1, 1]) box(0.9, 0.3, 1, MAT.gold(), -15 + i * 1.6 + 2.6, 3.65, s * 6.2, g);
  // antenna meander
  for (let i = 0; i < 5; i++) box(0.5, 0.05, 8, MAT.gold(), -15 + i * 1.3, 3.8, 0, g);
  label('HC-05', 10, 2.6, g, 5, 3.8, 0, { weight: 800 });
  // right-angle header pointing +x
  const names = ['STATE', 'RXD', 'TXD', 'GND', 'VCC', 'EN'];
  for (let i = 0; i < 6; i++) {
    const z = (i - 2.5) * P;
    box(2.5, P, P, MAT.plastic(), 16, 1.6, z, g);
    box(8, 0.64, 0.64, MAT.gold(), 20.5, 2.6, z, g);
    pins[names[i]] = new THREE.Vector3(24.5, 2.9, z);
    label(names[i].slice(0, 3), 4, 1.3, g, 11.6, 1.6, z, { weight: 700 });
  }
  const pled = led(g, -14.5, 1.6, 6.5, 0xff2222);
  return { group: g, pins, led: pled };
}

// ---------------------------------------------------------------- LM2596 buck module
export function lm2596() {
  const g = new THREE.Group(); const pins = {};
  pcb(43, 21, MAT.bluePcb(), g);
  // toroid inductor
  const tor = new THREE.Mesh(new THREE.TorusGeometry(5, 2.4, 16, 40), MAT.black()); tor.rotation.x = Math.PI / 2; tor.position.set(-3, 3.2, -1); tor.castShadow = true; g.add(tor);
  const wind = new THREE.Mesh(new THREE.TorusGeometry(5, 2.65, 8, 40), new THREE.MeshStandardMaterial({ color: 0xb8733b, metalness: 1, roughness: 0.35, wireframe: true })); wind.rotation.x = Math.PI / 2; wind.position.copy(tor.position); g.add(wind);
  box(10, 4.5, 9, MAT.black(), 9.5, 1.6, -3, g); label('LM2596', 8, 1.6, g, 9.5, 6.1, -3, { color: '#c6c9ce', weight: 500 });
  eCap(g, 4, 9, -14, 1.6, 4); eCap(g, 4, 9, 14, 1.6, 5);
  box(9.5, 5, 4.6, MAT.potBlue(), 2, 1.6, 7, g); cyl(1.1, 0.6, MAT.gold(), 6.6, 4.4, 7, g, 12, 'x');
  box(5, 2, 4, MAT.black(), 3.5, 1.6, -7.5, g);
  for (const [n, x, z] of [['IN+', -19.5, -6.5], ['IN-', -19.5, 6.5], ['OUT+', 19.5, -6.5], ['OUT-', 19.5, 6.5]]) {
    const pad = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.9, 18), MAT.tin()); pad.rotation.x = -Math.PI / 2; pad.position.set(x, 1.63, z); g.add(pad);
    pins[n] = new THREE.Vector3(x, 1.8, z);
  }
  label('IN', 4, 1.6, g, -17, 1.6, 0, { weight: 700 }); label('OUT', 5, 1.6, g, 17, 1.6, 0, { weight: 700 });
  const pled = led(g, 14, 1.6, -7.5, 0x3399ff);
  return { group: g, pins, led: pled };
}

// ---------------------------------------------------------------- BEC in heat-shrink
export function bec() {
  const g = new THREE.Group(); const pins = {};
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(5.5, 22, 6, 16), MAT.heatBlue()); body.rotation.z = Math.PI / 2; body.scale.set(1, 1, 0.7); body.position.y = 4.2; body.castShadow = true; g.add(body);
  label('BEC 5V 3A', 14, 3, g, 0, 8.1, 0, { weight: 800 });
  pins['IN+'] = new THREE.Vector3(-17, 4, -2); pins['IN-'] = new THREE.Vector3(-17, 4, 2);
  pins['OUT+'] = new THREE.Vector3(17, 4, -2); pins['OUT-'] = new THREE.Vector3(17, 4, 2);
  return { group: g, pins };
}

// ---------------------------------------------------------------- servo power block (perfboard with two pin rows)
export function servoBus() {
  const g = new THREE.Group(); const pins = {};
  pcb(20, 12, std(0xc9a46a, { roughness: 0.8 }), g);
  for (let i = 0; i <= 5; i++) {
    const x = (i - 2.5) * P * 1.2;
    if (i <= 4) pins['P' + i] = malePin(g, x, 1.6, -2.2, 7);
    pins['N' + i] = malePin(g, x, 1.6, 2.2, 7);
  }
  const strip = (z, c) => box(17, 0.1, 0.8, std(c), 0, 1.6, z, g);
  strip(-4.6, 0xd23b2f); strip(4.6, 0x202020);
  return { group: g, pins };
}

// ---------------------------------------------------------------- continuous-rotation micro servo
export function servo(name) {
  const g = new THREE.Group(); const pins = {};
  box(22.5, 22.7, 12.2, MAT.servoBlue(), 0, 0, 0, g);
  box(32.2, 2.5, 12.2, MAT.servoBlue(), 0, 15.9, 0, g);
  for (const s of [-1, 1]) { const h = cyl(1, 2.6, MAT.black(), s * 14, 15.85, 0, g, 12); }
  cyl(5.9, 4, MAT.servoBlue(), 5.3, 22.7, 0, g, 28); cyl(3, 4, MAT.servoBlue(), -1, 22.7, 0, g, 20);
  cyl(2.4, 3, MAT.white(), 5.3, 26.7, 0, g, 18);
  const horn = new THREE.Group(); horn.position.set(5.3, 29.2, 0); g.add(horn);
  const arm = (len, rot) => { const a = box(len, 1.6, 4.2, MAT.white(), len / 2 - 2.5, 0, 0, horn); a.rotation.y = rot; a.position.set(Math.cos(rot) * (len / 2 - 2.5), 0, -Math.sin(rot) * (len / 2 - 2.5)); };
  cyl(3.6, 1.8, MAT.white(), 0, 0, 0, horn, 24);
  for (let i = 0; i < 4; i++) arm(i % 2 ? 11 : 15, i * Math.PI / 2);
  cyl(1, 0.4, MAT.steel(), 0, 1.8, 0, horn, 12);
  label('360°', 9, 3, g, -3, 22.75, 0, { weight: 800 });
  // lead: brown / red / orange
  const cols = [0x5a3a22, 0xd23b2f, 0xf08a24];
  for (let i = 0; i < 3; i++) box(5, 1, 1, std(cols[i]), -13.7, 3, (i - 1) * 1.1, g);
  pins.GND = new THREE.Vector3(-16, 3.5, -1.1); pins.VCC = new THREE.Vector3(-16, 3.5, 0); pins.SIG = new THREE.Vector3(-16, 3.5, 1.1);
  return { group: g, pins, spin: horn };
}

// ---------------------------------------------------------------- yellow TT gear motor with a hub
export function gearMotor() {
  const g = new THREE.Group(); const pins = {};
  box(37, 22.5, 18.8, MAT.yellow(), 0, 0, 0, g);
  box(10, 22.5, 7, MAT.yellow(), 23, 0, 0, g);
  cyl(10, 22, MAT.steel(), -40.5, 11.25, 0, g, 32, 'x');
  cyl(10.3, 2, MAT.tin(), -42, 11.25, 0, g, 32, 'x');
  box(1.4, 4, 3, MAT.copper(), -43, 15.5, -3.2, g); box(1.4, 4, 3, MAT.copper(), -43, 15.5, 3.2, g);
  pins['+'] = new THREE.Vector3(-43.5, 19, -3.2); pins['-'] = new THREE.Vector3(-43.5, 19, 3.2);
  // output shaft along +z with a hub disc so rotation is visible
  const hub = new THREE.Group(); hub.position.set(5, 11.25, -9.4); hub.rotation.y = Math.PI; g.add(hub); // faces the viewer once the motor is turned round
  cyl(2.7, 9, MAT.white(), 0, 0, 0, hub, 12, 'z');
  const disc = cyl(12, 3, std(0x2b2b2e, { roughness: 0.7 }), 0, 0, 8, hub, 36, 'z');
  for (let i = 0; i < 3; i++) { const sp = box(2, 2, 1, std(0xff7a1a), 0, -1, 11.1, hub); const a = i * Math.PI * 2 / 3; sp.position.set(Math.cos(a) * 7.5, Math.sin(a) * 7.5 - 1, 11.1); }
  return { group: g, pins, spin: hub };
}

// ---------------------------------------------------------------- 2-cell battery holder
export function battery(name, cellMat) {
  const g = new THREE.Group(); const pins = {};
  box(77, 3, 42, MAT.black(), 0, 0, 0, g);
  for (const s of [-1, 1]) { box(77, 14, 1.6, MAT.black(), 0, 3, s * 20.2, g); box(1.6, 14, 42, MAT.black(), s * 37.7, 3, 0, g); }
  for (const z of [-10, 10]) {
    cyl(9.2, 65, cellMat, -32.5, 12.2, z, g, 32, 'x');
    cyl(9.25, 1.5, MAT.white(), -34, 12.2, z, g, 32, 'x');
    cyl(3, 1, MAT.tin(), 32.5, 12.2, z, g, 16, 'x');
  }
  box(1, 10, 38, MAT.tin(), -35.8, 4, 0, g); box(1, 10, 38, MAT.tin(), 35.8, 4, 0, g);
  label(name, 34, 4.4, g, 0, 21.6, 0, { weight: 800, color: '#ffffff' });
  pins['+'] = new THREE.Vector3(39, 6, -14); pins['-'] = new THREE.Vector3(39, 6, 14);
  box(4, 1.2, 1.2, std(0xd23b2f), 39, 5.4, -14, g); box(4, 1.2, 1.2, std(0x202020), 39, 5.4, 14, g);
  return { group: g, pins };
}
