import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { unoStack, l298n, hc05, lm2596, bec, servoBus, servo, gearMotor, battery, MAT } from './boards.js';
import { COMPONENTS, FAULTS, BRINGUP, TUNING, PINS, Firmware, hardware, pinLevel, railCheck, wiresFor } from './net.js';

const qs = new URLSearchParams(location.search);
let simNow = 0;
const clockNow = () => (FILM ? simNow : performance.now());
const timers = [];
const later = (ms, f) => timers.push([simNow + ms, f]);
const FILM = qs.has('film');
if (FILM) document.body.classList.add('film');
const CLEAN = qs.has('clean');
if (CLEAN) document.body.classList.add('clean');

// ---------------------------------------------------------------- renderer, scene, light
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: FILM });
renderer.setPixelRatio(FILM ? 1 : Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);

const BG = 0xefe8da;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 900, 1900);

// photo-studio environment for reflections: warm cream room with large soft boxes
{
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 p; void main(){ float h = normalize(p).y; vec3 floorC = vec3(.52,.47,.40); vec3 wall = vec3(.93,.89,.82); vec3 top = vec3(1.,.98,.95); vec3 c = mix(floorC, wall, smoothstep(-.35,.05,h)); c = mix(c, top, smoothstep(.3,.9,h)); gl_FragColor = vec4(c,1.); }',
  }));
  env.add(dome);
  for (const [x, y, z, w, h, k] of [[0, 40, 0, 40, 40, 2.2], [30, 18, 25, 26, 16, 1.6], [-34, 14, 10, 18, 22, 1.1], [5, 12, -40, 36, 14, 0.9]]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.92).multiplyScalar(k), side: THREE.DoubleSide }));
    b.position.set(x, y, z); b.lookAt(0, 0, 0); env.add(b);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.03).texture;
  scene.environmentIntensity = 0.75;
}
scene.add(new THREE.HemisphereLight(0xfff6e6, 0xcdbfa6, 0.35));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.position.set(-160, 420, 260); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.25; sun.shadow.radius = 4;
Object.assign(sun.shadow.camera, { left: -320, right: 240, top: 240, bottom: -220, near: 10, far: 1200 });
sun.target.position.set(-60, 0, 30); scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xdfe9ff, 0.5); fill.position.set(300, 160, -120); scene.add(fill);

// desk and a self-healing cutting mat with a 10 mm grid and ruler marks
{
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.9 }));
  desk.rotation.x = -Math.PI / 2; desk.position.y = -2.2; desk.receiveShadow = true; scene.add(desk);
  const MW = 560, MD = 380, S = 6;
  const c = document.createElement('canvas'); c.width = MW * S; c.height = MD * S; const g = c.getContext('2d');
  g.fillStyle = '#5f8274'; g.fillRect(0, 0, c.width, c.height);
  const r = (() => { let x = 7; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.025})`; g.fillRect(r() * c.width, r() * c.height, 2 + r() * 6, 2 + r() * 6); }
  const m0 = 20;
  for (let x = m0; x <= MW - m0; x += 10) { const bold = (x - m0) % 50 === 0; g.strokeStyle = bold ? 'rgba(235,245,238,.55)' : 'rgba(235,245,238,.22)'; g.lineWidth = bold ? 2.2 : 1.1; g.beginPath(); g.moveTo(x * S, m0 * S); g.lineTo(x * S, (MD - m0) * S); g.stroke(); }
  for (let y = m0; y <= MD - m0; y += 10) { const bold = (y - m0) % 50 === 0; g.strokeStyle = bold ? 'rgba(235,245,238,.55)' : 'rgba(235,245,238,.22)'; g.lineWidth = bold ? 2.2 : 1.1; g.beginPath(); g.moveTo(m0 * S, y * S); g.lineTo((MW - m0) * S, y * S); g.stroke(); }
  g.fillStyle = 'rgba(240,248,242,.75)'; g.font = `600 ${4.2 * S}px "Segoe UI", Arial`; g.textAlign = 'center';
  for (let x = m0, n = 0; x <= MW - m0; x += 10, n++) { g.fillRect(x * S - 1, (m0 - (n % 5 ? 3 : 6)) * S, 2, (n % 5 ? 3 : 6) * S); if (n % 5 === 0) g.fillText(String(n), x * S, (m0 - 8) * S); }
  for (let y = m0, n = 0; y <= MD - m0; y += 10, n++) g.fillRect((m0 - (n % 5 ? 3 : 6)) * S, y * S - 1, (n % 5 ? 3 : 6) * S, 2);
  g.textAlign = 'right'; g.font = `600 ${3.4 * S}px "Segoe UI", Arial`; g.fillText('SELF-HEALING CUTTING MAT  ·  cm', (MW - m0) * S, (MD - 7) * S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  const side = new THREE.MeshStandardMaterial({ color: 0x4d6c60, roughness: 0.85 });
  const topM = new THREE.MeshStandardMaterial({ map: t, roughness: 0.82 });
  const mat = new THREE.Mesh(new THREE.BoxGeometry(MW, 2.2, MD), [side, side, topM, side, side, side]);
  mat.position.set(-60, -1.1, 30); mat.receiveShadow = true; scene.add(mat);
}

const camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 40; controls.maxDistance = 1100;
const HOME = { pos: new THREE.Vector3(-55, 470, 500), tgt: new THREE.Vector3(-45, 0, 40) };
camera.position.copy(HOME.pos); controls.target.copy(HOME.tgt);

// ---------------------------------------------------------------- place every part
const parts = {};
function place(id, built, x, z, rotY = 0, y = 0) {
  built.group.position.set(x, y, z); built.group.rotation.y = rotY; scene.add(built.group);
  built.group.updateMatrixWorld(true);
  built.group.traverse(o => { o.userData.part = id; });
  parts[id] = built; return built;
}
const stack = place('shield', unoStack(), 0, 0);
parts.uno = stack;
place('hc05', hc05(), 20, -78, -Math.PI / 2);
place('l1', l298n('L298N #1'), -85, -48, Math.PI / 2);
place('l2', l298n('L298N #2'), -85, 42, Math.PI / 2);
place('mWL', gearMotor(), -215, -86, Math.PI);
place('mWR', gearMotor(), -215, -30, Math.PI);
place('mRot', gearMotor(), -215, 30, Math.PI);
place('mLift', gearMotor(), -215, 86, Math.PI);
['sv1', 'sv2', 'sv3', 'sv4'].forEach((id, i) => place(id, servo(id), 112, -62 + i * 36));
place('bus', servoBus(), 70, 82);
place('bec', bec(), 44, 106);
place('buck', lm2596(), -18, 82);
place('batA', battery('BATTERY A · MOTORS', MAT.cellBlue()), -100, 140);
place('batB', battery('BATTERY B · LOGIC', MAT.cellGreen(), true), 40, 150, Math.PI);

function pinWorld(ref) {
  const [id, ...rest] = ref.split('.');
  const p = parts[id]; const key = rest.join('.');
  const local = p.pins[key];
  if (!local) throw new Error('no pin ' + ref);
  const v = p.group.localToWorld(local.clone());
  if (local.dir) v.dir = local.dir.clone().applyQuaternion(p.group.quaternion);   // wire leaves sideways
  return v;
}

// ---------------------------------------------------------------- wires
const KIND_COLOR = { ser: 0xf2c200, pwm: 0xff8a1f, sig: 0x3b8cff, mot: 0xe8e8e8, 'p+': 0xd8302a, gnd: 0x26262a };
const RAIL_COLOR = { motor: 0xff3b30, logic: 0xffb300, servo: 0x34c759, batB: 0xaf52de, gnd: 0x1e1e20, sig: 0x9aa3b2 };
const wireGroup = new THREE.Group(); scene.add(wireGroup);
let wires = [];
let faults = { servoOnUno: false, noCommonGround: false, motorOnLogic: false };

function railOf(w) {
  const [a, b, kind] = w; const s = a + ' ' + b;
  if (kind === 'gnd') return 'gnd';
  if (kind === 'p+') {
    if (/batA/.test(s)) return 'motor';
    if (/bec\.OUT|bus\.P|sv\d\.VCC/.test(s)) return 'servo';
    if (/batB|buck\.IN|bec\.IN/.test(s)) return 'batB';
    return 'logic';
  }
  if (kind === 'mot') return 'motor';
  return 'sig';
}

const HOUSING = (() => { const g = new THREE.BoxGeometry(2.45, 12, 2.45); g.translate(0, 6, 0); return g; })();
const HOUSING_MAT = new THREE.MeshPhysicalMaterial({ color: 0x141416, roughness: 0.45, clearcoat: 0.3 });
const TIP = new THREE.SphereGeometry(1.0, 12, 8);
const TIP_MAT = new THREE.MeshStandardMaterial({ color: 0xc77b45, metalness: 1, roughness: 0.35 });
// Wires are routed as harnesses: every wire between the same two parts runs side by side as a flat
// ribbon (signal) or a twisted pair (power, motor), fans out only at its ends, and sits in its own height layer.
const UP = new THREE.Vector3(0, 1, 0);
const partOf = ref => { const id = ref.split('.')[0]; return id === 'uno' ? 'shield' : id; };
function exitPts(ref, P) {
  if (P.dir) return [P, P.clone().addScaledVector(P.dir, 6).add(new THREE.Vector3(0, 1.2, 0))];   // screw terminal: out sideways
  if (/^(shield|uno|bus)\./.test(ref) || /^l[12]\.(ENA|IN\d|ENB)$/.test(ref)) return [P, P.clone().add(new THREE.Vector3(0, 13, 0))];   // dupont: straight up out of the housing
  return [P, P.clone().add(new THREE.Vector3(0, 4, 0))];
}
function buildWires() {
  for (const w of wires) { wireGroup.remove(w.mesh); w.mesh.geometry.dispose(); if (w.plug) w.plug.forEach(p => wireGroup.remove(p)); }
  wires = [];
  const list = wiresFor(faults);
  // group by the pair of parts (the four servo signals form one ribbon)
  const groups = new Map();
  list.forEach((w, i) => {
    const [a, b, kind, , tag] = w;
    let pa = partOf(a), pb = partOf(b);
    if (/^sv\d$/.test(pb) && kind === 'sig') pb = 'sv';
    const key = /^fault:/.test(tag || '') ? 'fault' + i : [pa, pb].sort().join('|');
    const A = pinWorld(a), B = pinWorld(b);
    const m = { w, i, A, B, ea: exitPts(a, A), eb: exitPts(b, B).reverse() };
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(m);
  });
  const geo = new Map();
  [...groups.values()].forEach((ms, gi) => {
    const n = ms.length;
    const cA = new THREE.Vector3(), cB = new THREE.Vector3();
    ms.forEach(m => { cA.add(m.ea[m.ea.length - 1]); cB.add(m.eb[0]); }); cA.divideScalar(n); cB.divideScalar(n);
    const dirH = cB.clone().sub(cA); dirH.y = 0; const L = Math.max(1, dirH.length()); dirH.normalize();
    const perp = new THREE.Vector3().crossVectors(UP, dirH).normalize();
    const spread = (pts, c) => Math.max(0, ...pts.map(p => Math.hypot(p.x - c.x, p.z - c.z)));
    const backA = Math.min(L * 0.3, Math.max(7, spread(ms.map(m => m.ea[m.ea.length - 1]), cA) * 0.9 + 5));
    const backB = Math.min(L * 0.3, Math.max(7, spread(ms.map(m => m.eb[0]), cB) * 0.9 + 5));
    const sA = cA.clone().addScaledVector(dirH, backA), sB = cB.clone().addScaledVector(dirH, -backB);
    const top = Math.max(cA.y, cB.y);
    sA.y = top + 3; sB.y = top + 3;
    const fanned = [...groups.keys()][gi].startsWith('bus|sv');   // the four servo power leads run as one flat layer
    const hump = fanned ? 3 + L * 0.06 : 6 + L * 0.11 + (gi % 4) * 2.2;
    const heavyGroup = ms.every(m => ['p+', 'gnd', 'mot'].includes(m.w[2]));
    const twisted = false;   // pairs run side by side like bonded two-core lead (twisting read as clutter)
    const r = heavyGroup ? 0.8 : 0.55;
    const pitch = twisted ? 0 : 2 * r + 0.12;
    // order across the ribbon by where each wire starts and ends, so ribbons do not cross themselves
    ms.sort((p, q) => (p.A.clone().add(p.B).dot(perp)) - (q.A.clone().add(q.B).dot(perp)));
    ms.forEach((m, k) => {
      const off = (k - (n - 1) / 2) * pitch;
      const pts = [...m.ea];
      const N = twisted ? Math.max(8, Math.round(L / 5)) : 6;
      for (let j = 0; j <= N; j++) {
        const t = j / N;
        const c = sA.clone().lerp(sB, t); c.y += hump * 4 * t * (1 - t);
        if (twisted) { const ph = t * L / 9 * Math.PI * 2 + k * Math.PI; c.addScaledVector(perp, Math.cos(ph) * r * 1.05).addScaledVector(UP, Math.sin(ph) * r * 1.05); }
        else c.addScaledVector(perp, off);
        pts.push(c);
      }
      pts.push(...m.eb);
      geo.set(m.i, { curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), r, L });
    });
  });
  list.forEach((w, i) => {
    const [a, b, kind, text, tag] = w;
    const A = pinWorld(a), B = pinWorld(b);
    const { curve, r, L } = geo.get(i);
    let color = KIND_COLOR[kind];
    if (kind === 'mot') color = /OUT[13]/.test(a) ? 0xd8302a : 0x1e1e20;
    if (/^fault:/.test(tag || '')) color = 0xff2bd6;
    if (kind === 'sig' && /sv\d/.test(b)) color = 0xf08a24;
    if (kind === 'sig' && /l2/.test(b)) color = 0x2fd18b;
    const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.35, emissive: color, emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(260, 90 + Math.round(L * 0.9)), r, 10, false), mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true; mesh.userData.wire = wires.length;
    wireGroup.add(mesh);
    // dupont housings on header pins
    const plug = [];
    for (const [ref, P] of [[a, A], [b, B]]) {
      if (/^(shield|uno|bus)\./.test(ref) || /^l[12]\.(ENA|IN\d|ENB)$/.test(ref)) {
        const hsg = new THREE.Mesh(HOUSING, HOUSING_MAT);
        hsg.position.set(P.x, P.y - 0.6, P.z); hsg.castShadow = true; wireGroup.add(hsg); plug.push(hsg);
      } else if (/^(l[12]\.(OUT\d|VS|GND|5V)|buck\.|batA|batB)/.test(ref)) {
        const tip = new THREE.Mesh(TIP, TIP_MAT); tip.position.copy(P); wireGroup.add(tip); plug.push(tip);
      }
    }
    wires.push({ w, a, b, kind, text, curve, mesh, mat, color, rail: railOf(w), plug, fault: /^fault:/.test(tag || '') });
  });
}
buildWires();

// ---------------------------------------------------------------- labels over parts
const labelsEl = document.getElementById('labels');
const LABEL_OFFSET = { shield: 32, hc05: 10, l1: 34, l2: 34, mWL: 30, mWR: 30, mRot: 30, mLift: 30, sv1: 36, sv2: 36, sv3: 36, sv4: 36, bus: 14, bec: 16, buck: 18, batA: 28, batB: 28 };
const PART_LIST = ['shield', 'hc05', 'l1', 'l2', 'mWL', 'mWR', 'mRot', 'mLift', 'sv1', 'sv2', 'sv3', 'sv4', 'bus', 'bec', 'buck', 'batA', 'batB'];
const partName = id => (id === 'shield' ? 'Uno + Sensor Shield V5' : COMPONENTS[id].name);
const labelEls = {};
for (const id of Object.keys(LABEL_OFFSET)) {
  const el = document.createElement('div'); el.className = 'lbl'; el.textContent = `${PART_LIST.indexOf(id) + 1} · ${partName(id)}`;
  el.onclick = () => select(id); labelsEl.appendChild(el); labelEls[id] = el;
}
let showLabels = false, hoverId = null;

// ---------------------------------------------------------------- firmware + clock
const fw = new Firmware();
let boardState = 'ok', resetUntil = 0, lastHw = null, jitterAt = 0;
const held = new Map();               // command -> next repeat time
let repeat = true;
const packets = [];

function send(c) {
  if (boardState === 'dead') { fw.print('(no response: board damaged)'); return; }
  if (simNow < resetUntil) { fw.print('(no response: Uno is restarting)'); return; }
  fw.handle(c, simNow, 'BT');
  const ser = wires.find(w => w.kind === 'ser'); if (ser) packets.push({ w: ser, t0: clockNow() });
  logDirty = true;
}

// ---------------------------------------------------------------- UI: keypad
const KEYS = [
  ['F', 'Walk forward'], ['B', 'Walk back'], ['L', 'Pivot left'], ['R', 'Pivot right'],
  ['U', 'Lift up'], ['D', 'Lift down'], ['E', 'Rotate CW'], ['Q', 'Rotate CCW'],
  ['A', 'Slide out'], ['Z', 'Slide in'], ['O', 'Claw open'], ['C', 'Claw close'],
  ['G', 'Gate open'], ['K', 'Gate close'], ['S', 'Stop all'], ['X', 'E-stop'],
];
const pad = document.getElementById('pad');
for (const [k, t] of KEYS) {
  const b = document.createElement('button'); b.className = 'key'; b.dataset.k = k;
  b.innerHTML = `<b>${k}</b><span>${t}</span>`;
  const down = e => { e.preventDefault(); stopTour(); press(k); };
  const up = () => release(k);
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up);
  pad.appendChild(b);
}
const trims = document.getElementById('trims');
for (const [k, t] of [['1', 'L −5'], ['2', 'L +5'], ['3', 'R −5'], ['4', 'R +5']]) {
  const b = document.createElement('button'); b.textContent = `${k} · ${t}`; b.onclick = () => { stopTour(); send(k); }; trims.appendChild(b);
}
function press(k) {
  if (held.has(k)) return;
  send(k);
  const once = 'SX0!12345MNPYVI?'.includes(k);
  if (!once) held.set(k, simNow + TUNING.bridgeRepeatMs);
  document.querySelector(`.key[data-k="${k}"]`)?.classList.add('down');
}
function release(k) { held.delete(k); document.querySelector(`.key[data-k="${k}"]`)?.classList.remove('down'); }
addEventListener('keydown', e => {
  if (e.repeat || e.target.tagName === 'INPUT') return;
  const k = e.key.toUpperCase();
  if (KEYS.some(x => x[0] === k) || '12345'.includes(k)) { stopTour(); if ('12345'.includes(k)) send(k); else press(k); }
});
addEventListener('keyup', e => release(e.key.toUpperCase()));
const repeatBox = document.getElementById('repeat');
repeatBox.onchange = () => { repeat = repeatBox.checked; };

// ---------------------------------------------------------------- UI: pin table
const PIN_ROWS = [
  ['D2', 'HC-05 TXD in', 'in'], ['D5', 'Left leg ENA', 'pwm'], ['D7', 'Left leg IN1'], ['D8', 'Left leg IN2'],
  ['D6', 'Right leg ENB', 'pwm'], ['D9', 'Right leg IN3'], ['D10', 'Right leg IN4'],
  ['D3', 'Rotation ENA', 'pwm'], ['D12', 'Rotation IN1'], ['D13', 'Rotation IN2'],
  ['D11', 'Lift ENB', 'pwm'], ['A0', 'Lift IN3'], ['A1', 'Lift IN4'],
  ['A2', 'Slide L servo', 'servo'], ['A3', 'Slide R servo', 'servo'], ['A4', 'Claw servo', 'servo'], ['A5', 'Gate servo', 'servo'],
];
const pinTable = document.getElementById('pins');
const pinCells = {};
for (const [p, t] of PIN_ROWS) {
  const tr = document.createElement('tr'); tr.innerHTML = `<td class="p">${p}</td><td class="n">${t}</td><td class="bar"><i></i></td><td class="v">–</td>`;
  tr.onclick = () => highlightPin(p);
  pinTable.appendChild(tr); pinCells[p] = { bar: tr.querySelector('i'), v: tr.querySelector('.v'), tr };
}
let rxFlashUntil = 0;
function updatePins() {
  for (const [p, , kind] of PIN_ROWS) {
    const c = pinCells[p];
    if (p === 'D2') { const on = clockNow() < rxFlashUntil; c.bar.style.width = on ? '100%' : '0%'; c.v.textContent = on ? 'RX' : 'idle'; continue; }
    const o = fw.out[p];
    if (boardState !== 'ok' || simNow < resetUntil) { c.bar.style.width = '0%'; c.v.textContent = 'off'; continue; }
    if (o.mode === 'd') { c.bar.style.width = o.v ? '100%' : '0%'; c.v.textContent = o.v ? 'HIGH' : 'LOW'; }
    else if (o.mode === 'pwm') { c.bar.style.width = (o.v / 2.55).toFixed(0) + '%'; c.v.textContent = 'PWM ' + o.v; }
    else { c.bar.style.width = Math.min(100, Math.abs(o.v - 90) / 30 * 100).toFixed(0) + '%'; c.v.textContent = 'write ' + o.v; }
  }
  document.getElementById('speeds').textContent = `L ${fw.walkL} · R ${fw.walkR}`;
}

// ---------------------------------------------------------------- UI: serial monitor
const logEl = document.getElementById('log');
let logDirty = true, logShown = 0;
function updateLog() {
  if (!logDirty && logShown === fw.log.length) return;
  logEl.textContent = fw.log.slice(-60).join('\n'); logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight; logDirty = false; logShown = fw.log.length;
}

// ---------------------------------------------------------------- selection & views
let pinFocus = null;
let selected = null, viewMode = 'all', step = -1, wireFocus = null;
const info = document.getElementById('info');
function select(id, quiet) {
  if (!quiet) stopTour();
  wireFocus = null; pinFocus = null;
  if (id === 'uno') id = 'shield';
  selected = selected === id ? null : id;
  partsEl.querySelectorAll('li').forEach(li => li.classList.toggle('on', li.dataset.id === selected));
  if (!selected) { info.innerHTML = '<span class="hint">Click a board, module or wire to see what it does and where it connects.</span>'; return; }
  const ids = selected === 'shield' ? ['uno', 'shield'] : [selected];
  const rows = wires.filter(w => ids.some(i => w.a.startsWith(i + '.') || w.b.startsWith(i + '.')));
  info.innerHTML = ids.map(i => `<b>${COMPONENTS[i].name}</b><p>${COMPONENTS[i].role}</p>`).join('') +
    `<table class="conn">${rows.map(w => `<tr><td>${w.a.replace(/^(\w+)\./, (m, p) => short(p))}</td><td>→</td><td>${w.b.replace(/^(\w+)\./, (m, p) => short(p))}</td></tr>`).join('')}</table>`;
}
// fly the camera to a part, keeping roughly the current viewing angle
let fly = null;
function flyTo(id) {
  const box = new THREE.Box3().setFromObject(parts[id].group);
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.55) { dir.y = 0.55; dir.normalize(); }
  fly = { t0: performance.now(), from: [camera.position.clone(), controls.target.clone()], to: [c.clone().addScaledVector(dir, Math.max(150, r * 5.5)), c] };
}
const partsEl = document.getElementById('parts');
PART_LIST.forEach((id, k) => {
  const li = document.createElement('li'); li.dataset.id = id; li.innerHTML = `<b>${k + 1}</b>${partName(id)}`;
  li.onclick = () => { stopTour(); if (selected !== id) select(id); flyTo(id); };
  li.onmouseenter = () => { hoverId = id; }; li.onmouseleave = () => { hoverId = null; };
  partsEl.appendChild(li);
});
function short(id) { return ({ shield: '', uno: 'Uno ', hc05: 'HC-05 ', l1: 'L298N#1 ', l2: 'L298N#2 ', bus: 'block ', bec: 'BEC ', buck: 'LM2596 ', batA: 'Batt A ', batB: 'Batt B ', mWL: 'L leg ', mWR: 'R leg ', mRot: 'Rot ', mLift: 'Lift ', sv1: 'Slide L ', sv2: 'Slide R ', sv3: 'Claw ', sv4: 'Gate ' })[id] ?? id + ' '; }
function highlightPin(p) { pinFocus = pinFocus === p ? null : p; selected = null; }

document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { stopTour(); setView(b.dataset.view); });
function setView(v) {
  viewMode = v; step = -1;
  document.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('on', x.dataset.view === v));
  document.getElementById('legend').style.display = v === 'power' ? 'block' : 'none';
  document.getElementById('stepbox').textContent = '';
}
document.getElementById('labelsBtn').onclick = e => { showLabels = !showLabels; e.target.classList.toggle('on', showLabels); };

// bring-up steps
const stepbox = document.getElementById('stepbox');
function setStep(i) {
  stopTour();
  step = Math.max(0, Math.min(BRINGUP.length - 1, i)); viewMode = 'step';
  document.querySelectorAll('[data-view]').forEach(x => x.classList.remove('on'));
  const s = BRINGUP[step];
  stepbox.innerHTML = `<b>${step + 1} / ${BRINGUP.length} · ${s.t}</b><p>${s.s}</p>${s.try ? `<p class="hint">Try <kbd>${s.try}</kbd>.</p>` : ''}`;
}
document.getElementById('stepPrev').onclick = () => setStep(step < 0 ? 0 : step - 1);
document.getElementById('stepNext').onclick = () => setStep(step + 1);

// faults
const faultBox = document.getElementById('faults');
for (const [k, f] of Object.entries(FAULTS)) {
  const l = document.createElement('label'); l.className = 'fault';
  l.innerHTML = `<input type="checkbox" data-f="${k}"> ${f.label}`; faultBox.appendChild(l);
}
faultBox.querySelectorAll('input').forEach(i => i.onchange = () => { stopTour(); setFault(i.dataset.f, i.checked); });
function setFault(k, on) {
  faults[k] = on;
  faultBox.querySelector(`[data-f="${k}"]`).checked = on;
  buildWires();
  if (k === 'motorOnLogic') {
    if (on) { boardState = 'dead'; fw.stopAll(); fw.print('*** 5 V rail now at battery voltage: ATmega328P and HC-05 damaged ***'); }
    else { boardState = 'ok'; fw.reset(simNow); fw.print('(board replaced)'); }
  }
  updateRail();
  logDirty = true;
}
function updateRail() {
  const r = railCheck(faults);
  const on = Object.entries(faults).filter(([, v]) => v).map(([k]) => FAULTS[k].effect);
  document.getElementById('rail').innerHTML = (r.problems.length
    ? `<span class="bad">Rail check: ${r.problems.length} problem${r.problems.length > 1 ? 's' : ''}</span><br>${r.problems.join('<br>')}`
    : `<span class="ok">Rail check passed</span>: ${r.wires} wires, motor / logic / servo rails kept apart, one common ground.`) +
    (on.length ? `<p>${on.join('<br>')}</p>` : '');
}
updateRail();

// ---------------------------------------------------------------- picking
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; stopTour(); fly = null; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(scene.children, true).find(h => h.object.userData.part || h.object.userData.wire !== undefined);
  if (!hit) { selected = null; select(null, true); return; }
  if (hit.object.userData.wire !== undefined && hit.object.userData.part === undefined) {
    const w = wires[hit.object.userData.wire]; selected = null; pinFocus = null;
    info.innerHTML = `<b>${w.text}</b><p>${w.a} → ${w.b}</p>`; wireFocus = w; return;
  }
  select(hit.object.userData.part);
});
const tip = document.getElementById('tip');
renderer.domElement.addEventListener('pointermove', e => {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(wireGroup.children, false).find(h => h.object.userData.wire !== undefined);
  if (hit) { const w = wires[hit.object.userData.wire]; tip.textContent = w.text; tip.style.display = 'block'; tip.style.left = e.clientX - r.left + 14 + 'px'; tip.style.top = e.clientY - r.top + 10 + 'px'; hoverId = null; }
  else {
    tip.style.display = 'none';
    const ph = ray.intersectObjects(scene.children, true).find(h => h.object.userData.part);
    hoverId = ph ? (ph.object.userData.part === 'uno' ? 'shield' : ph.object.userData.part) : null;
  }
  renderer.domElement.style.cursor = hit || hoverId ? 'pointer' : '';
});

// ---------------------------------------------------------------- tour
const tourEl = document.getElementById('tour');
const cap = document.getElementById('cap');
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TOUR = [
  { d: 4.5, t: 'The controller of an eight-legged pick-up robot', s: 'Every board here is generated in code; pins, wires and behaviour come from the robot\'s real wiring plan and firmware.', cam: [V(-70, 380, 430), V(-55, 0, 25)] },
  { d: 4.5, t: 'Uno + Sensor Shield V5', s: 'Each device plugs into a G / V / S row with one 3-pin lead. D0 and D1 stay free for USB upload.', cam: [V(30, 95, 115), V(5, 10, -2)] },
  { d: 4.5, t: 'Bluetooth in on D2, one wire', s: 'Only HC-05 TXD is wired, so no 5 V signal reaches its 3.3 V input.', cam: [V(60, 70, -10), V(18, 8, -52)], act: () => send('?') },
  { d: 5.5, t: 'F: both legs forward', s: 'D7 HIGH, D8 LOW, PWM 220 on D5 (and the same on D6, D9, D10). The PC bridge re-sends F every 250 ms while the stick is held.', cam: [V(-60, 120, 70), V(-120, 5, -40)], act: () => press('F') },
  { d: 4, t: 'Link lost: the robot stops itself', s: 'No command for 500 ms and the firmware stops that motion group.', cam: [V(-60, 140, 90), V(-120, 5, -40)], act: () => { held.clear(); release('F'); } },
  { d: 5, t: 'A: arm slide out', s: 'The two slide servos turn opposite ways (write 100 and 80) so the slide moves straight.', cam: [V(170, 110, 60), V(112, 15, -15)], act: () => press('A') },
  { d: 5, t: 'Three supplies, one ground', s: 'Battery A only feeds the motor bridges. Battery B goes through the LM2596 at 5.0 V for logic and through a BEC for the servos.', cam: [V(-30, 330, 330), V(-40, 0, 60)], act: () => { release('A'); setView('power'); } },
  { d: 6, t: 'Mistake: servos on the Uno 5V', s: 'Press a servo key and the 5 V rail sags: the Uno browns out and resets.', cam: [V(120, 170, 190), V(50, 5, 40)], act: () => { setView('all'); setFault('servoOnUno', true); later(1500, () => press('C')); } },
  { d: 4, t: 'Your turn', s: 'Hold a key, click any part, step through the bring-up order, or switch on a mistake.', cam: [V(-70, 380, 430), V(-55, 0, 25)], act: () => { release('C'); setFault('servoOnUno', false); } },
];
let tour = FILM || qs.has('tour') ? { i: -1, t0: 0, from: null } : null;
if (!tour && !CLEAN) tourEl.innerHTML = '<b>TOUR</b><u>Play the 45 s tour</u>';
function stopTour() {
  if (!FILM) finishIntro();
  if (!tour || FILM) return;
  tour = null; tourEl.innerHTML = '<b>TOUR</b><u>Replay the tour</u>'; held.clear();
  document.querySelectorAll('.key.down').forEach(k => k.classList.remove('down'));
  if (faults.servoOnUno) setFault('servoOnUno', false);
  controls.enabled = true;
}
tourEl.onclick = () => { if (!tour) { tour = { i: -1, t0: 0, from: null }; } };
function tourStep(now) {
  if (!tour) return;
  const cur = TOUR[tour.i];
  if (tour.i < 0 || (now - tour.t0) / 1000 > cur.d) {
    tour.i++;
    if (tour.i >= TOUR.length) { if (FILM) { window.__filmDone = true; tour = null; } else { tour = null; tourEl.innerHTML = '<b>TOUR</b><u>Replay the tour</u>'; } return; }
    tour.t0 = now; tour.from = [camera.position.clone(), controls.target.clone()];
    const s = TOUR[tour.i];
    tourEl.innerHTML = `<b>${tour.i + 1} / ${TOUR.length}</b><span>click anywhere to take over</span><u>${s.t}</u>`;
    cap.querySelector('.t').textContent = s.t; cap.querySelector('.s').textContent = s.s;
    s.act && s.act();
  }
  const s = TOUR[tour.i];
  const k = Math.min(1, (now - tour.t0) / 1600); const e = k * k * (3 - 2 * k);
  camera.position.lerpVectors(tour.from[0], s.cam[0], e);
  controls.target.lerpVectors(tour.from[1], s.cam[1], e);
}

// ---------------------------------------------------------------- opening: the bench assembles itself
const INTRO_ORDER = ['batA', 'batB', 'shield', 'buck', 'bec', 'bus', 'l1', 'l2', 'hc05', 'mWL', 'mWR', 'mRot', 'mLift', 'sv1', 'sv2', 'sv3', 'sv4'];
const INTRO_PART = 0.12, INTRO_DROP = 0.55, INTRO_WIRE = 0.035, INTRO_GROW = 0.6;
const introBase = Object.fromEntries(INTRO_ORDER.map(id => [id, parts[id].group.position.y]));
let intro = (CLEAN || qs.has('nointro')) ? null : { t0: null };
if (intro && tour) TOUR[0].d = 7;
function finishIntro() {
  if (!intro) return;
  intro = null;
  for (const id of INTRO_ORDER) { parts[id].group.visible = true; parts[id].group.position.y = introBase[id]; }
  for (const w of wires) w.mesh.geometry.setDrawRange(0, Infinity);
}
function introApply(dt) {
  if (!intro) return;
  if (intro.t0 == null) intro.t0 = clockNow();
  const t = (clockNow() - intro.t0) / 1000;   // same clock as the tour, so a slow frame cannot desync them
  INTRO_ORDER.forEach((id, k) => {
    const u = Math.min(1, Math.max(0, (t - k * INTRO_PART) / INTRO_DROP)), e = 1 - (1 - u) ** 3;
    const g = parts[id].group; g.visible = u > 0; g.position.y = introBase[id] + 70 * (1 - e);
  });
  const w0 = INTRO_ORDER.length * INTRO_PART + 0.45;
  wires.forEach((w, k) => {
    const u = Math.min(1, Math.max(0, (t - w0 - k * INTRO_WIRE) / INTRO_GROW)), e = 1 - (1 - u) ** 2;
    const n = w.mesh.geometry.index.count;
    w.mesh.geometry.setDrawRange(0, Math.floor(n * e / 3) * 3);
    if (u === 0) { w.mesh.visible = false; w.plug.forEach(p => p.visible = false); }
  });
  if (t > w0 + wires.length * INTRO_WIRE + INTRO_GROW) finishIntro();
}

// ---------------------------------------------------------------- frame loop
const clock = { last: performance.now() };
const dot = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff3a0 }));
scene.add(dot); dot.visible = false;
const tmp = new THREE.Vector3();

function wireLevel(w, hw) {
  const powered = boardState !== 'dead';
  if (w.kind === 'ser') return clockNow() < rxFlashUntil ? 1 : 0.05;
  if (w.kind === 'sig' || w.kind === 'pwm') {
    const m = w.a.match(/^shield\.(\w+)\.S$/);
    if (!m) return 0;
    if (boardState !== 'ok' || simNow < resetUntil) return 0;
    return pinLevel(fw, m[1]);
  }
  if (w.kind === 'mot') { const id = w.b.split('.')[0]; return Math.abs(hw.motors[id] || 0); }
  if (w.kind === 'p+') return powered ? 0.35 : 0;
  return 0;
}

function visibleFor(w) {
  if (viewMode !== 'step' || step < 0) return true;
  const s = BRINGUP[step];
  if (!s.show) return true;
  const ia = w.a.split('.')[0], ib = w.b.split('.')[0];
  const inc = id => s.show.includes(id) || (id === 'uno' && s.show.includes('shield'));
  return inc(ia) && inc(ib) && (!s.kinds || s.kinds.includes(w.kind)) && !(w.a.startsWith('hc05') || w.b.startsWith('hc05'));
}
function partVisible(id) {
  if (viewMode !== 'step' || step < 0) return 1;
  const s = BRINGUP[step]; if (!s.show) return 1;
  return s.show.includes(id === 'uno' ? 'shield' : id) ? 1 : 0.12;
}

function setPartOpacity(id, o) {
  const p = parts[id]; if (p._op === o) return; p._op = o;
  p.group.traverse(m => {
    if (!m.isMesh) return;
    if (o < 1) { if (!m.userData.origMat) m.userData.origMat = m.material; m.material = ghost; }
    else if (m.userData.origMat) { m.material = m.userData.origMat; delete m.userData.origMat; }
  });
}
const ghost = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });

function loop() {
  if (!FILM) requestAnimationFrame(loop);
  const dt = FILM ? 1000 / 30 : Math.min(50, performance.now() - clock.last); clock.last = performance.now();
  simNow += dt;
  const now = clockNow();
  for (let i = timers.length - 1; i >= 0; i--) if (simNow >= timers[i][0]) { const f = timers[i][1]; timers.splice(i, 1); f(); }
  tourStep(now);

  // repeating held keys like the Xbox bridge
  if (repeat) for (const [k, t] of held) if (simNow >= t) { send(k); held.set(k, t + TUNING.bridgeRepeatMs); }
  fw.tick(simNow);

  // hardware response
  let hw;
  if (boardState === 'dead' || simNow < resetUntil) hw = { motors: { mWL: 0, mWR: 0, mRot: 0, mLift: 0 }, servos: { sv1: 0, sv2: 0, sv3: 0, sv4: 0 } };
  else if (faults.noCommonGround) { if (simNow > jitterAt || !lastHw) { lastHw = hardware(fw, faults); jitterAt = simNow + 220; } hw = lastHw; }
  else hw = hardware(fw, faults);
  if (faults.servoOnUno && boardState === 'ok' && simNow >= resetUntil && Object.values(hw.servos).some(v => v !== 0)) {
    fw.print('*** 5 V rail sagged under servo current: brown-out reset ***');
    fw.reset(simNow); fw.print('(Uno restarting)'); resetUntil = simNow + 900; held.clear(); logDirty = true;
    document.querySelectorAll('.key.down').forEach(k => k.classList.remove('down'));
  }

  // spin actuators
  for (const id of ['mWL', 'mWR', 'mRot', 'mLift']) parts[id].spin.rotation.z += hw.motors[id] * dt * 0.012;
  for (const id of ['sv1', 'sv2', 'sv3', 'sv4']) parts[id].spin.rotation.y += hw.servos[id] * dt * 0.006;

  // LEDs
  const logicOn = boardState === 'ok' && !(simNow < resetUntil && Math.floor(simNow / 120) % 2);
  parts.shield.led.material.emissiveIntensity = logicOn ? 2.2 : 0;
  parts.l1.led.material.emissiveIntensity = boardState === 'dead' ? 0 : 2;
  parts.l2.led.material.emissiveIntensity = boardState === 'dead' ? 0 : 2;
  parts.buck.led.material.emissiveIntensity = 2;
  parts.hc05.led.material.emissiveIntensity = boardState === 'dead' ? 0 : (Math.floor(now / 1000) % 2 ? 2 : 0.2);

  // wire glow and focus
  const focusIds = selected ? (selected === 'shield' ? ['uno', 'shield'] : [selected]) : null;
  for (const w of wires) {
    let lvl = wireLevel(w, hw);
    let col = w.color;
    if (viewMode === 'power') col = RAIL_COLOR[w.rail];
    w.mat.color.setHex(col); w.mat.emissive.setHex(col);
    let vis = visibleFor(w);
    let dim = false;
    if (focusIds) dim = !focusIds.some(i => w.a.startsWith(i + '.') || w.b.startsWith(i + '.'));
    if (pinFocus) dim = !(w.a === `shield.${pinFocus}.S` || w.b === `shield.${pinFocus}.S`);
    if (wireFocus) dim = w !== wireFocus;
    if (viewMode === 'signal' && !['sig', 'pwm', 'ser'].includes(w.kind)) dim = true;
    if (viewMode === 'power' && ['sig', 'pwm', 'ser'].includes(w.kind)) dim = true;
    w.mesh.visible = vis; w.plug.forEach(p => p.visible = vis);
    w.mat.transparent = dim; w.mat.opacity = dim ? 0.12 : 1; w.mat.depthWrite = !dim;
    w.mat.emissiveIntensity = dim ? 0 : (viewMode === 'power' ? 0.35 : lvl * 1.8) + (w.fault ? 0.4 + 0.4 * Math.sin(now / 150) : 0);
  }
  for (const id of Object.keys(parts)) if (id !== 'uno') setPartOpacity(id, partVisible(id));
  introApply(dt);

  // serial packet dot
  dot.visible = false;
  for (let i = packets.length - 1; i >= 0; i--) {
    const p = packets[i]; const k = Math.max(0, (now - p.t0) / 260);
    if (k >= 1) { packets.splice(i, 1); rxFlashUntil = now + 120; continue; }
    p.w.curve.getPointAt(k, tmp); dot.position.copy(tmp); dot.visible = true;
  }

  if (fly && !tour) {
    const k = Math.min(1, (performance.now() - fly.t0) / 1100), e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(fly.from[0], fly.to[0], e); controls.target.lerpVectors(fly.from[1], fly.to[1], e);
    if (k === 1) fly = null;
  }
  if (!tour) controls.update(); else camera.lookAt(controls.target);
  renderer.render(scene, camera);

  // labels
  const r = renderer.domElement.getBoundingClientRect();
  for (const [id, el] of Object.entries(labelEls)) {
    if (!(showLabels || id === hoverId || id === selected) || partVisible(id) < 1) { el.style.display = 'none'; continue; }
    tmp.copy(parts[id].group.position); tmp.y += LABEL_OFFSET[id]; tmp.project(camera);
    if (tmp.z > 1) { el.style.display = 'none'; continue; }
    el.style.display = 'block';
    el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * r.width}px, ${(-tmp.y * 0.5 + 0.5) * r.height}px) translate(-50%, -100%)`;
    el.classList.toggle('sel', selected === id);
  }
  if ((frame++ & 3) === 0) { updatePins(); updateLog(); }
}
let frame = 0;
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h;
  const side = (FILM || CLEAN || w < 900) ? 0 : 372, low = (FILM || CLEAN || w < 900) ? 0 : 90;
  if (side) camera.setViewOffset(w + side, h + low, side, 0, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
select(null, true);
if (FILM) window.__frame = () => loop(); else loop();
window.__app = { send, press, release, setFault, setView, setStep, fw, camera, controls };
