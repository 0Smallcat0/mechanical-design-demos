import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { TransformControls } from '../vendor/TransformControls.js';
import { ARM, HOME, DEG, fk, ik, ikRestarts, manipulability, mulberry32, v3 } from './kin.js';
import { makeWorld, collides, rrtConnect, shortcut, timeScale, timeScaleBlend, sample, pathLength } from './plan.js';
import { SCENE } from './scene.js';

const FILM = new URLSearchParams(location.search).has('film');
if (FILM) document.body.classList.add('film');
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

// ---------- renderer / scene ----------
const host = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: FILM });
renderer.setPixelRatio(FILM ? 1 : Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1115);
scene.fog = new THREE.Fog(0x0f1115, 3.5, 8);
const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
camera.position.set(1.35, -1.25, 0.95);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0.25, 0, 0.3); orbit.enableDamping = true; orbit.update();

scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x20242c, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.5, -1.2, 2.5); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 1.2, bottom: -1.2, near: 0.5, far: 6 });
scene.add(key);
const rim = new THREE.DirectionalLight(0x88aaff, 0.8); rim.position.set(-2, 1.5, 1.2); scene.add(rim);

const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.95 }));
floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(4, 40, 0x2c3240, 0x22262f); grid.rotation.x = Math.PI / 2; grid.position.z = 0.001; scene.add(grid);

// ---------- materials ----------
const M = {
  link: new THREE.MeshStandardMaterial({ color: 0xd9dde5, roughness: 0.38, metalness: 0.15 }),
  joint: new THREE.MeshStandardMaterial({ color: 0x2b303b, roughness: 0.5, metalness: 0.4 }),
  accent: new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4, metalness: 0.2 }),
  obst: new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.85 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x5a6a88, roughness: 0.6, transparent: true, opacity: 0.55 }),
  cube: new THREE.MeshStandardMaterial({ color: 0x3ecf8e, roughness: 0.45 }),
  ghost: new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.35, depthWrite: false }),
};
const shadow = (o) => { o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; };

// ---------- obstacles ----------
for (const o of SCENE.obstacles) {
  const s = v3.sub(o.hi, o.lo), c = v3.scale(v3.add(o.hi, o.lo), 0.5);
  const m = new THREE.Mesh(new THREE.BoxGeometry(...s), o.name === 'wall' ? M.wall : M.obst);
  m.position.set(...c); scene.add(shadow(m));
}
const cube = shadow(new THREE.Mesh(new THREE.BoxGeometry(SCENE.cube.size, SCENE.cube.size, SCENE.cube.size), M.cube));
cube.position.set(...SCENE.cube.pick); scene.add(cube);
const placeMark = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.042, 48), new THREE.MeshBasicMaterial({ color: 0x3ecf8e, transparent: true, opacity: 0.6 }));
placeMark.position.set(SCENE.cube.place[0], SCENE.cube.place[1], 0.151); scene.add(placeMark);

// ---------- arm ----------
// Link capsules follow the same chain points the collision checker uses.
function capsuleMesh(r, mat) {
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 32), mat); cyl.rotation.x = Math.PI / 2; // along local z
  const a = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat), b = a.clone();
  g.add(cyl, a, b); g.userData = { cyl, a, b }; return shadow(g);
}
function placeCapsule(g, pa, pb) {
  const A = new THREE.Vector3(...pa), B = new THREE.Vector3(...pb), d = B.clone().sub(A), L = Math.max(d.length(), 1e-6);
  g.position.copy(A).add(B).multiplyScalar(0.5);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
  g.userData.cyl.scale.set(1, L, 1);
  g.userData.a.position.set(0, 0, -L / 2); g.userData.b.position.set(0, 0, L / 2);
}
const arm = new THREE.Group(); scene.add(arm);
const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.06, 48), M.joint)); base.rotation.x = Math.PI / 2; base.position.z = 0.03; scene.add(base);
const linkMeshes = ARM.links.map((L, i) => { const g = capsuleMesh(L.r * 0.92, i === 3 ? M.joint : M.link); arm.add(g); return g; });
const jointMeshes = ARM.joints.map((J, i) => {
  const r = [0.08, 0.062, 0.052, 0.046, 0.042, 0.036][i], h = [0.04, 0.135, 0.115, 0.02, 0.095, 0.02][i];
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), i % 2 ? M.joint : M.accent);
  const g = new THREE.Group(); g.add(m);
  // cylinder default axis is y; align to the joint axis in the local frame
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...J.axis));
  arm.add(shadow(g)); return g;
});
// two-finger gripper on the tool frame
const tool = new THREE.Group(); arm.add(tool);
const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.025), M.joint); palm.position.z = -0.045; tool.add(palm);
const fingers = [-1, 1].map((s) => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.022, 0.06), M.accent); f.position.set(s * 0.04, 0, -0.005); tool.add(f); return f; });
shadow(tool);
let grip = 0.04;

const m4 = new THREE.Matrix4();
function setFrame(obj, R, p) {
  m4.set(R[0], R[1], R[2], p[0], R[3], R[4], R[5], p[1], R[6], R[7], R[8], p[2], 0, 0, 0, 1);
  obj.matrixAutoUpdate = false; obj.matrix.copy(m4);
}
let q = HOME.slice(), carrying = false;
function drawArm() {
  const F = fk(q);
  ARM.links.forEach((L, i) => placeCapsule(linkMeshes[i], F.points[L.a], i === 3 ? F.points[6] : F.points[L.b]));
  F.frames.forEach((fr, i) => setFrame(jointMeshes[i], fr.R, fr.p));
  setFrame(tool, F.tool.R, F.tool.p);
  fingers.forEach((f, i) => (f.position.x = (i ? 1 : -1) * grip));
  if (carrying) cube.position.set(...F.tool.p);
  return F;
}

// ---------- target gizmo ----------
const target = new THREE.Group(); scene.add(target);
const ghost = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 24), M.ghost); ghost.rotation.x = -Math.PI / 2; ghost.position.z = 0.035; target.add(ghost);
target.add(new THREE.AxesHelper(0.08));
function setTarget(pose) {
  setFrame(target, pose.R, pose.p); target.matrixAutoUpdate = true;
  target.position.set(...pose.p);
  target.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(pose.R[0], pose.R[1], pose.R[2], 0, pose.R[3], pose.R[4], pose.R[5], 0, pose.R[6], pose.R[7], pose.R[8], 0, 0, 0, 0, 1));
}
function getTarget() {
  target.updateMatrix(); const e = target.matrix.elements;
  return { R: [e[0], e[4], e[8], e[1], e[5], e[9], e[2], e[6], e[10]], p: [e[12], e[13], e[14]] };
}
setTarget(fk(HOME).tool);
let gizmo = null;
if (!FILM) {
  gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.attach(target); gizmo.setSize(0.8);
  scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);
  gizmo.addEventListener('dragging-changed', (e) => (orbit.enabled = !e.value));
}

// ---------- tree / path drawing ----------
const treeGroup = new THREE.Group(); scene.add(treeGroup);
function drawTrees(trees, path, upto = Infinity) {
  treeGroup.clear();
  const cols = [0x4ea1ff, 0xff7a1a];
  trees.forEach((T, k) => {
    const pts = [], n = Math.min(T.length, upto);
    const tip = T.map((nd) => fk(nd.q).tool.p);
    for (let i = 1; i < n; i++) { pts.push(...tip[T[i].parent], ...tip[i]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    treeGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: cols[k], transparent: true, opacity: 0.55 })));
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(tip.slice(0, n).flat(), 3));
    treeGroup.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: cols[k], size: 0.012 })));
  });
  if (path) {
    // dense tool-tip trace of the shortcut path
    const tr = timeScale(path), pts = [];
    for (let t = 0; t <= tr.duration; t += tr.duration / 200) pts.push(...fk(sample(tr, t).q).tool.p);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    treeGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x3ecf8e })));
  }
}

// ---------- planning ----------
const $ = (id) => document.getElementById(id);
const world = () => makeWorld(SCENE.obstacles, { attached: carrying ? { offset: 0, r: 0.035 } : null });
let plan = null; // { traj, t, steps: [...], stepIdx }
let planSeed = 1;

function goalConfig(pose, seed, w, rngSeed) {
  const rng = mulberry32(rngSeed);
  for (let k = 0; k < 20; k++) {
    const r = ikRestarts(pose, k ? ARM.joints.map((J) => J.min + (J.max - J.min) * rng()) : seed, { rng, restarts: 6 });
    if (r.ok && !collides(r.q, w)) return r;
  }
  return null;
}
function planTo(q0, pose, w, seed) {
  const g = goalConfig(pose, q0, w, seed);
  if (!g) return { ok: false, reason: 'no collision-free IK solution at the target' };
  const r = rrtConnect(q0, g.q, w, { seed });
  if (!r.ok) return { ok: false, reason: r.reason };
  const sc = shortcut(r.path, w, { seed });
  return { ok: true, raw: r, path: sc, ik: g };
}
// Straight-line Cartesian move (approach / retreat), solved by IK at 12 points.
function cartesian(q0, pose) {
  const p0 = fk(q0).tool.p, path = [q0]; let qc = q0;
  for (let k = 1; k <= 12; k++) {
    const p = v3.add(p0, v3.scale(v3.sub(pose.p, p0), k / 12));
    qc = ik({ R: pose.R, p }, qc).q; path.push(qc);
  }
  return path;
}

function runSteps(steps) { plan = { steps, i: -1, t: 0, traj: null }; nextStep(); }
function nextStep() {
  plan.i++;
  const s = plan.steps[plan.i];
  if (!s) { plan = null; return; }
  if (s.action) { s.action(); return nextStep(); }
  plan.traj = s.cart ? timeScaleBlend(s.path) : timeScale(s.path, { profile: $('profile')?.value || 'quintic' }); plan.t = 0;
  plotData = plan.traj;
}

function showPlanStats(res) {
  $('kMs').textContent = `${res.raw.ms.toFixed(1)} ms`;
  $('kNodes').textContent = res.raw.nodes;
  $('kLen').textContent = `${pathLength(res.raw.path).toFixed(2)} → ${pathLength(res.path).toFixed(2)} rad`;
  $('kDur').textContent = `${res.path.length} · ${timeScale(res.path, { profile: $('profile').value }).duration.toFixed(2)} s`;
}

function doPlan() {
  const res = planTo(q, getTarget(), world(), planSeed++);
  if (!res.ok) { $('status').textContent = `Plan failed: ${res.reason}`; return; }
  $('status').textContent = `Path found: ${res.raw.iters} iterations.`;
  showPlanStats(res);
  if ($('tree').checked) drawTrees(res.raw.trees, res.path); else treeGroup.clear();
  runSteps([{ path: res.path }]);
}

// Pick & place: plan to pre-grasp, descend, grip, lift, plan over the wall, descend, release, retreat, home.
function pickPlaceSteps(seedBase = 11) {
  carrying = false; cube.position.set(...SCENE.cube.pick);
  const D = SCENE.DOWN, a = SCENE.approach, P = SCENE.cube.pick, Q = SCENE.cube.place;
  const preA = { R: D, p: [P[0], P[1], P[2] + a] }, grA = { R: D, p: P };
  const preB = { R: D, p: [Q[0], Q[1], Q[2] + a] }, grB = { R: D, p: Q };
  const w0 = makeWorld(SCENE.obstacles), w1 = makeWorld(SCENE.obstacles, { attached: { offset: 0, r: 0.035 } });
  const s1 = planTo(q, preA, w0, seedBase); if (!s1.ok) return null;
  const qA = s1.path.at(-1), down1 = cartesian(qA, grA), up1 = down1.slice().reverse();
  const s2 = planTo(qA, preB, w1, seedBase + 1); if (!s2.ok) return null;
  const qB = s2.path.at(-1), down2 = cartesian(qB, grB), up2 = down2.slice().reverse();
  const s3 = planTo(qB, fk(HOME).tool, w0, seedBase + 2);
  const homePath = s3.ok ? s3.path : [qB, HOME];
  return { s1, s2, steps: [
    { path: s1.path, label: 'Plan to pre-grasp' }, { path: down1, label: 'Approach (straight-line Cartesian)', cart: true },
    { action: () => { grip = 0.03; carrying = true; } },
    { path: up1, label: 'Lift', cart: true }, { path: s2.path, label: 'Plan over the wall (payload in collision model)' }, { path: down2, label: 'Place', cart: true },
    { action: () => { carrying = false; grip = 0.04; cube.position.set(...SCENE.cube.place); } },
    { path: up2, label: 'Retreat', cart: true }, { path: homePath, label: 'Home' },
  ] };
}

// ---------- plots ----------
let plotData = null;
function drawPlots(cv, traj, tNow, opts = {}) {
  const ctx = cv.getContext('2d'), dpr = opts.dpr || Math.min(2, devicePixelRatio);
  const W = cv.clientWidth * dpr, H = cv.clientHeight * dpr;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  ctx.clearRect(0, 0, W, H);
  const cols = ['#ff7a1a', '#4ea1ff', '#3ecf8e', '#ffb020', '#c77dff', '#ff4d6d'];
  const rows = [['q', 'rad'], ['q̇', 'rad/s'], ['q̈', 'rad/s²']], pad = 10 * dpr, lw = 56 * dpr, rh = (H - pad * 2) / 3;
  ctx.font = `${11 * dpr}px system-ui`; ctx.textBaseline = 'middle';
  if (!traj) { ctx.fillStyle = '#8a91a1'; ctx.fillText('Joint position, velocity and acceleration appear here when a trajectory runs.', pad, H / 2); return; }
  const N = 240, S = [];
  for (let k = 0; k <= N; k++) S.push(sample(traj, (traj.duration * k) / N));
  const keys = ['q', 'qd', 'qdd'];
  rows.forEach(([name, unit], r) => {
    const y0 = pad + r * rh, vals = S.flatMap((s) => s[keys[r]]), mx = Math.max(1e-6, ...vals.map(Math.abs));
    ctx.fillStyle = '#8a91a1'; ctx.fillText(`${name}  ±${mx.toFixed(2)}`, pad, y0 + rh / 2 - 7 * dpr); ctx.fillText(unit, pad, y0 + rh / 2 + 7 * dpr);
    ctx.strokeStyle = '#2a2f3a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lw, y0 + rh / 2); ctx.lineTo(W - pad, y0 + rh / 2); ctx.stroke();
    for (let j = 0; j < 6; j++) {
      ctx.strokeStyle = cols[j]; ctx.lineWidth = 1.5 * dpr; ctx.beginPath();
      S.forEach((s, k) => { const x = lw + ((W - pad - lw) * k) / N, y = y0 + rh / 2 - (s[keys[r]][j] / mx) * (rh / 2 - 4 * dpr); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
  });
  const x = lw + ((W - pad - lw) * Math.min(1, tNow / traj.duration));
  ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1 * dpr; ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke();
}

// ---------- panel ----------
const wHome = (() => { const r = mulberry32(5), w = [];
  for (let k = 0; k < 1500; k++) w.push(manipulability(ARM.joints.map((J) => J.min + (J.max - J.min) * r())));
  return w.sort((a, b) => a - b)[Math.floor(w.length * 0.95)]; })(); // w_ref: 95th percentile over random configs
const jt = $('joints');
if (!FILM) {
  ARM.joints.forEach((J, i) => { jt.insertAdjacentHTML('beforeend', `<tr><td class="n">${J.name}</td><td><div class="bar"><b></b><i id="jb${i}"></i></div></td><td class="v" id="jv${i}"></td></tr>`); });
}
function updatePanel(ikRes) {
  ARM.joints.forEach((J, i) => {
    const f = (q[i] - J.min) / (J.max - J.min), el = $('jb' + i);
    el.style.left = `calc(${(f * 100).toFixed(1)}% - 1px)`;
    el.style.background = f < 0.04 || f > 0.96 ? 'var(--bad)' : 'var(--accent)';
    $('jv' + i).textContent = `${(q[i] / DEG).toFixed(1)}°`;
  });
  const wr = manipulability(q) / wHome;
  $('kW').textContent = wr.toFixed(3);
  $('wbar').firstElementChild.style.width = `${Math.min(100, wr * 100)}%`;
  $('wbar').firstElementChild.style.background = wr < 0.1 ? 'var(--bad)' : wr < 0.3 ? 'var(--warn)' : 'var(--ok)';
  $('warn').textContent = wr < 0.1 ? 'Near a singularity: damping is limiting joint speed.' : '';
  if (ikRes) {
    $('kIt').textContent = ikRes.iters;
    $('kErr').textContent = `${(ikRes.errPos * 1000).toFixed(3)} mm · ${(ikRes.errRot / DEG).toFixed(3)}°`;
  }
}

if (!FILM) {
  const setMode = (m) => { gizmo.setMode(m); $('mT').classList.toggle('on', m === 'translate'); $('mR').classList.toggle('on', m === 'rotate'); };
  $('mT').onclick = () => setMode('translate'); $('mR').onclick = () => setMode('rotate');
  addEventListener('keydown', (e) => { if (e.key === 't') setMode('translate'); if (e.key === 'r') setMode('rotate'); });
  $('tHome').onclick = () => setTarget(fk(HOME).tool);
  $('plan').onclick = doPlan;
  $('home').onclick = () => { setTarget(fk(HOME).tool); doPlan(); };
  $('pick').onclick = () => {
    const pp = pickPlaceSteps(10 + planSeed++);
    if (!pp) { $('status').textContent = 'Pick & place: planning failed'; return; }
    showPlanStats(pp.s2);
    if ($('tree').checked) drawTrees(pp.s2.raw.trees, pp.s2.path); else treeGroup.clear();
    $('status').textContent = 'Pick & place running. Tree shown for the move over the wall.';
    runSteps(pp.steps);
  };
  $('tree').onchange = () => { if (!$('tree').checked) treeGroup.clear(); };
}

// ---------- resize / loop ----------
function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

let last = performance.now(), lastTarget = '';
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  let ikRes = null;
  if (plan && plan.traj) {
    plan.t += dt; const s = sample(plan.traj, Math.min(plan.t, plan.traj.duration)); q = s.q;
    if (plan.t >= plan.traj.duration) nextStep();
    if (plan) { const tp = fk(q).tool; if (!gizmo.dragging) setTarget(tp); lastTarget = JSON.stringify(getTarget()); }
  } else if ($('follow').checked) {
    const T = getTarget(), sig = JSON.stringify(T);
    if (sig !== lastTarget) {
      ikRes = ik(T, q, { method: $('solver').value, mode6: $('pose6').checked, maxIter: $('solver').value === 'jt' ? 300 : 40, maxStep: 0.12 });
      const c = collides(ikRes.q, world());
      if (!c) q = ikRes.q;
      $('status').textContent = c ? `Blocked: ${c}` : ikRes.ok ? '' : 'Target out of reach — closest pose shown.';
      if (ikRes.ok || c) lastTarget = sig;
    }
  }
  drawArm(); updatePanel(ikRes);
  drawPlots($('plots'), plotData, plan ? plan.t : plotData ? plotData.duration : 0);
  orbit.update(); renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ---------- film mode: deterministic timeline, frames captured in order via window.__seek(t) ----------
if (FILM) {
  const cap = (t, s) => { document.querySelector('#cap .t').textContent = t; document.querySelector('#cap .s').textContent = s; };
  const fplot = $('filmplot'), fw = $('filmw');
  const pp = pickPlaceSteps(11);
  const steps = pp.steps.filter((s) => s.path).map((s) => ({ ...s, traj: s.cart ? timeScaleBlend(s.path) : timeScale(s.path) }));
  let acc = 0; steps.forEach((s) => { s.t0 = acc; acc += s.traj.duration; });
  const ppDur = acc;
  const T1 = 6, T2 = 10.5, T3 = 15, T4 = T3 + ppDur;
  const D = SCENE.DOWN, c8 = [0.45, 0, 0.62];
  let qf = HOME.slice();
  const camAt = (pos, look) => { camera.position.set(...pos); camera.lookAt(...look); };
  const lerp = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
  const ease = (u) => u * u * (3 - 2 * u);
  window.__film = { duration: T4 + 3.5 };
  window.__seek = (t) => {
    fplot.style.display = 'none'; fw.style.display = 'none'; target.visible = false;
    if (t < T1) {
      // figure-8 target, live DLS tracking
      const u = (t / T1) * Math.PI * 2;
      const pose = { R: [-1, 0, 0, 0, 1, 0, 0, 0, -1], p: [c8[0] + 0.05 * Math.sin(2 * u), c8[1] + 0.22 * Math.sin(u), c8[2] - 0.08 + 0.06 * Math.cos(u)] };
      const r = ik(pose, qf, { maxIter: 60 }); qf = r.q; target.visible = true; setTarget(pose);
      const a = -0.9 + 0.35 * (t / T1);
      camAt([0.3 + 1.9 * Math.cos(a), 1.9 * Math.sin(a), 1.0], [0.3, 0, 0.42]);
      cap('Damped least-squares IK', `tracking a moving target · ${r.iters} iterations · error ${(r.errPos * 1000).toFixed(3)} mm`);
      cube.visible = true; treeGroup.clear();
    } else if (t < T2) {
      // stretch toward the reach limit: manipulability collapses, damping keeps the motion bounded
      const u = ease(Math.min(1, (t - T1) / (T2 - T1 - 1)));
      const pose = { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], p: [0.0 + 0.62 * u, 0, 0.62 + 0.25 * u] };
      const r = ik(pose, qf, { maxIter: 60, mode6: false }); qf = r.q; target.visible = true; setTarget({ R: D, p: pose.p });
      const wr = manipulability(qf) / wHome;
      fw.style.display = 'block'; $('filmwt').textContent = `Manipulability  ${wr.toFixed(3)} × w_ref`;
      fw.querySelector('i').style.width = `${Math.min(100, wr * 100)}%`; fw.querySelector('i').style.background = wr < 0.1 ? '#ff4d4f' : wr < 0.3 ? '#ffb020' : '#3ecf8e';
      camAt([0.45, -2.1, 0.75], [0.35, 0, 0.55]);
      cap('Approaching a singularity', wr < 0.1 ? 'w → 0 · error-scaled damping keeps joint steps bounded' : 'Yoshikawa w = √det(JJᵀ) falls as the arm straightens');
    } else if (t < T3) {
      // RRT-Connect tree grows for the move over the wall
      qf = steps[0].path.at(-1); // pre-grasp config is where the over-the-wall search starts after picking
      const raw = pp.s2.raw, n = Math.max(...raw.trees.map((x) => x.length));
      const u = Math.min(1, (t - T2) / (T3 - T2 - 1.2));
      qf = pp.s2.path[0]; carrying = true;
      drawTrees(raw.trees, u >= 1 ? pp.s2.path : null, Math.ceil(2 + u * n));
      const a = -0.35 + 0.5 * ((t - T2) / (T3 - T2));
      camAt([0.45 + 1.7 * Math.cos(a), 1.7 * Math.sin(a), 1.55], [0.42, 0, 0.3]);
      cap('RRT-Connect in joint space', u < 1 ? `two trees, collision-checked capsules · ${raw.nodes} nodes · ${raw.ms.toFixed(1)} ms` : `shortcut: ${pathLength(raw.path).toFixed(2)} → ${pathLength(pp.s2.path).toFixed(2)} rad, ${pp.s2.path.length} waypoints`);
    } else if (t < T4) {
      // execute the whole pick & place
      const tt = t - T3; let k = steps.findIndex((s) => tt < s.t0 + s.traj.duration); if (k < 0) k = steps.length - 1;
      const s = steps[k], sm = sample(s.traj, tt - s.t0); qf = sm.q;
      const grabbedAt = steps[1].t0 + steps[1].traj.duration, placedAt = steps[4].t0 + steps[4].traj.duration;
      carrying = tt >= grabbedAt && tt < placedAt; grip = carrying ? 0.03 : 0.04;
      if (tt < grabbedAt) cube.position.set(...SCENE.cube.pick); else if (tt >= placedAt) cube.position.set(...SCENE.cube.place);
      if (k < 2) treeGroup.clear(); else if (k === 4 && treeGroup.children.length === 0) drawTrees([], pp.s2.path);
      if (k > 4) treeGroup.clear();
      fplot.style.display = 'block'; drawPlots(fplot, s.traj, tt - s.t0, { dpr: 1 });
      const a = -1.25 + 0.8 * (tt / ppDur);
      camAt([0.42 + 1.75 * Math.cos(a), 1.75 * Math.sin(a), 0.95], [0.42, 0, 0.3]);
      cap(s.label, `${s.cart ? 'one quintic along the IK-solved line' : 'quintic time scaling'} · ${s.traj.duration.toFixed(2)} s segment · within joint velocity and acceleration limits`);
    } else {
      qf = HOME.slice(); carrying = false; cube.position.set(...SCENE.cube.place); treeGroup.clear();
      const u = ease(Math.min(1, (t - T4) / 3));
      camAt(lerp([1.6, -1.4, 1.0], [1.9, -1.0, 1.25], u), [0.3, 0, 0.35]);
      cap('6-DOF arm · IK and motion planning', 'damped least squares · RRT-Connect · shortcutting · quintic time scaling');
    }
    q = qf; drawArm(); renderer.render(scene, camera);
  };
  window.__ready = true;
} else {
  requestAnimationFrame(tick);
}
