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
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeceae6);
scene.fog = new THREE.Fog(0xeceae6, 700, 1400);

// studio environment for reflections: gradient dome + soft boxes
{
  const env = new THREE.Scene();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: {},
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 p; void main(){ float h = normalize(p).y; vec3 c = mix(vec3(.36,.35,.34), vec3(1.0,.99,.97), smoothstep(-.3,.8,h)); gl_FragColor = vec4(c,1.); }',
  }));
  env.add(dome);
  for (const [x, y, z, s] of [[20, 30, 10, 18], [-25, 20, -10, 12], [0, 10, -40, 20]]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    b.position.set(x, y, z); b.lookAt(0, 0, 0); env.add(b);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.02).texture;
}
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b4aa, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-120, 320, 200); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
Object.assign(sun.shadow.camera, { left: -300, right: 220, top: 220, bottom: -200, near: 10, far: 900 });
sun.target.position.set(-60, 0, 30); scene.add(sun, sun.target);

// work mat with a 10 mm grid
{
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#d9dcd6'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(40,60,50,.18)'; g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 51.2) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(52, 36); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(520, 360), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(-65, -0.01, 30); mat.receiveShadow = true; scene.add(mat);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.12 }));
  under.rotation.x = -Math.PI / 2; under.position.y = -0.05; under.receiveShadow = true; scene.add(under);
}

const camera = new THREE.PerspectiveCamera(32, 1, 1, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 40; controls.maxDistance = 1100;
const HOME = { pos: new THREE.Vector3(-70, 380, 430), tgt: new THREE.Vector3(-55, 0, 25) };
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
place('bec', bec(), 128, 112);
place('buck', lm2596(), -18, 82);
place('batA', battery('BATTERY A · MOTORS', MAT.cellBlue()), -100, 140);
place('batB', battery('BATTERY B · LOGIC', MAT.cellGreen()), 40, 150);

function pinWorld(ref) {
  const [id, ...rest] = ref.split('.');
  const p = parts[id]; const key = rest.join('.');
  const local = p.pins[key];
  if (!local) throw new Error('no pin ' + ref);
  return p.group.localToWorld(local.clone());
}

// ---------------------------------------------------------------- wires
const KIND_COLOR = { ser: 0xf5c518, pwm: 0xff8a1f, sig: 0x3d9bff, mot: 0xe8e8e8, 'p+': 0xd8302a, gnd: 0x1e1e20 };
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

function buildWires() {
  for (const w of wires) { wireGroup.remove(w.mesh); w.mesh.geometry.dispose(); if (w.plug) w.plug.forEach(p => wireGroup.remove(p)); }
  wires = [];
  const list = wiresFor(faults);
  list.forEach((w, i) => {
    const [a, b, kind, text, tag] = w;
    const A = pinWorld(a), B = pinWorld(b);
    const d = A.distanceTo(B);
    const h = 8 + d * 0.16 + (i % 5) * 1.6;
    const lift = (P, other) => { const v = P.clone(); v.y += h * 0.55; v.lerp(other, 0.06); return v; };
    const mid = A.clone().lerp(B, 0.5); mid.y = Math.max(A.y, B.y) + h;
    const curve = new THREE.CatmullRomCurve3([A, lift(A, B), mid, lift(B, A), B], false, 'centripetal');
    let color = KIND_COLOR[kind];
    if (kind === 'mot') color = /OUT[13]/.test(a) ? 0xd8302a : 0x1e1e20;
    if (/^fault:/.test(tag || '')) color = 0xff2bd6;
    if (kind === 'sig' && /sv\d/.test(b)) color = 0xf08a24;
    if (kind === 'sig' && /l2/.test(b)) color = 0x2fd18b;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0, emissive: color, emissiveIntensity: 0 });
    const r = kind === 'p+' || kind === 'gnd' || kind === 'mot' ? 0.85 : 0.6;
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, r, 8, false), mat);
    mesh.castShadow = true; mesh.userData.wire = wires.length;
    wireGroup.add(mesh);
    // dupont housings on header pins
    const plug = [];
    for (const [ref, P] of [[a, A], [b, B]]) {
      if (/^(shield|uno|bus)\./.test(ref) || /^l[12]\.(ENA|IN\d|ENB)$/.test(ref)) {
        const hsg = new THREE.Mesh(new THREE.BoxGeometry(2.45, 8, 2.45), MAT.black());
        hsg.position.set(P.x, P.y - 1, P.z); hsg.castShadow = true; wireGroup.add(hsg); plug.push(hsg);
      }
    }
    wires.push({ w, a, b, kind, text, curve, mesh, mat, color, rail: railOf(w), plug, fault: /^fault:/.test(tag || '') });
  });
}
buildWires();

// ---------------------------------------------------------------- labels over parts
const labelsEl = document.getElementById('labels');
const LABEL_OFFSET = { shield: 32, hc05: 10, l1: 34, l2: 34, mWL: 30, mWR: 30, mRot: 30, mLift: 30, sv1: 36, sv2: 36, sv3: 36, sv4: 36, bus: 14, bec: 16, buck: 18, batA: 28, batB: 28 };
const labelEls = {};
for (const id of Object.keys(LABEL_OFFSET)) {
  const el = document.createElement('div'); el.className = 'lbl'; el.textContent = id === 'shield' ? 'Uno + Sensor Shield V5' : COMPONENTS[id].name;
  el.onclick = () => select(id); labelsEl.appendChild(el); labelEls[id] = el;
}
let showLabels = !FILM && !CLEAN;

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
  if (!selected) { info.innerHTML = '<span class="hint">Click a board, module or wire to see what it does and where it connects.</span>'; return; }
  const ids = selected === 'shield' ? ['uno', 'shield'] : [selected];
  const rows = wires.filter(w => ids.some(i => w.a.startsWith(i + '.') || w.b.startsWith(i + '.')));
  info.innerHTML = ids.map(i => `<b>${COMPONENTS[i].name}</b><p>${COMPONENTS[i].role}</p>`).join('') +
    `<table class="conn">${rows.map(w => `<tr><td>${w.a.replace(/^(\w+)\./, (m, p) => short(p))}</td><td>→</td><td>${w.b.replace(/^(\w+)\./, (m, p) => short(p))}</td></tr>`).join('')}</table>`;
}
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
renderer.domElement.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; stopTour(); });
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
  if (hit) { const w = wires[hit.object.userData.wire]; tip.textContent = w.text; tip.style.display = 'block'; tip.style.left = e.clientX - r.left + 14 + 'px'; tip.style.top = e.clientY - r.top + 10 + 'px'; }
  else tip.style.display = 'none';
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
let tour = FILM || !(qs.has('notour') || CLEAN) ? { i: -1, t0: 0, from: null } : null;
function stopTour() {
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

  // serial packet dot
  dot.visible = false;
  for (let i = packets.length - 1; i >= 0; i--) {
    const p = packets[i]; const k = Math.max(0, (now - p.t0) / 260);
    if (k >= 1) { packets.splice(i, 1); rxFlashUntil = now + 120; continue; }
    p.w.curve.getPointAt(k, tmp); dot.position.copy(tmp); dot.visible = true;
  }

  if (!tour) controls.update(); else camera.lookAt(controls.target);
  renderer.render(scene, camera);

  // labels
  const r = renderer.domElement.getBoundingClientRect();
  for (const [id, el] of Object.entries(labelEls)) {
    if (!showLabels || partVisible(id) < 1) { el.style.display = 'none'; continue; }
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
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
select(null, true);
if (FILM) window.__frame = () => loop(); else loop();
window.__app = { send, press, release, setFault, setView, setStep, fw, camera, controls };
