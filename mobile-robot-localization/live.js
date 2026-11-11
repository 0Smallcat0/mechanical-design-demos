import { World, DT, INFLATION } from './src/sim.js';
import { STATIONS } from './src/grid.js';
import { ROBOT, LIDAR } from './src/robot.js';

const $ = id => document.getElementById(id);
const cv = $('map'), ctx = cv.getContext('2d'), plot = $('plot'), pctx = plot.getContext('2d');
const S = cv.width / 24;                       // px per metre
const X = x => x * S, Y = y => cv.height - y * S;
const FILM = new URLSearchParams(location.search).has('film');
if (FILM) document.body.classList.add('film');
// AUTO TOUR: the idle demo. It replays the film script (global search, goals, a box, a kidnap) in a loop until someone interacts.
const TOUR_SEEDS = [4, 6, 3, 8, 1];   // sim seeds the tour cycles through
const tour = { on: !FILM && new URLSearchParams(location.search).get('tour') !== '0', lastInput: performance.now(), n: 0 };

let world, staticLayer, trail = [], drTrail = [];
let tool = 'goal', paused = false, speed = 1;
const view = { part: true, beam: true, infl: false, dr: true };

function buildStatic() {
  const m = world.map, c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  const g = c.getContext('2d');
  g.fillStyle = '#121418'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 1;
  for (let x = 0; x <= 24; x++) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), c.height); g.stroke(); }
  for (let y = 0; y <= 14; y++) { g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(c.width, Y(y)); g.stroke(); }
  g.fillStyle = '#3b414b';
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (m.occ[m.idx(i, j)]) g.fillRect(X(i * m.res), Y((j + 1) * m.res), S * m.res + 0.5, S * m.res + 0.5);
  g.font = '600 15px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.32)';
  const names = { dock: 'DOCK', pickA: 'PICK A', pickB: 'PICK B', pickC: 'PICK C', office: 'OFFICE' };
  for (const [k, [x, y]] of Object.entries(STATIONS)) { g.fillText(names[k], X(x) - 22, Y(y) + 30); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.strokeRect(X(x) - 14, Y(y) - 14, 28, 28); }
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.font = '13px system-ui, sans-serif'; g.fillText('1 m grid · 24 × 14 m', 14, c.height - 12);
  staticLayer = c;
}

function robotShape(p, stroke, fill, dash) {
  const [x, y, th] = p;
  ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(-th);
  ctx.setLineDash(dash || []); ctx.lineWidth = 2.5; ctx.strokeStyle = stroke;
  ctx.beginPath(); ctx.arc(0, 0, ROBOT.radius * S, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ROBOT.radius * S * 1.25, 0); ctx.stroke();
  ctx.restore();
}

function draw() {
  const w = world, m = w.map;
  ctx.drawImage(staticLayer, 0, 0);
  if (view.infl) {
    const d = w.cost.distanceField(); ctx.fillStyle = 'rgba(77,171,247,0.10)';
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) { const k = m.idx(i, j); if (!w.cost.occ[k] && d[k] < INFLATION) ctx.fillRect(X(i * m.res), Y((j + 1) * m.res), S * m.res, S * m.res); }
  }
  // dropped boxes (truth, not on the prior map)
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
    const k = m.idx(i, j);
    if (w.truth.occ[k] && !m.occ[k]) { ctx.fillStyle = '#c27a3a'; ctx.fillRect(X(i * m.res), Y((j + 1) * m.res), S * m.res + 0.5, S * m.res + 0.5); }
  }
  // costmap: obstacles the lidar has seen that the map does not have
  ctx.fillStyle = 'rgba(255,107,107,0.95)';
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) { const k = m.idx(i, j); if (w.cost.occ[k] && !m.occ[k]) ctx.fillRect(X((i + 0.25) * m.res), Y((j + 0.75) * m.res), S * m.res * 0.5, S * m.res * 0.5); }
  // trails
  const line = (pts, style, wd, dash) => { if (pts.length < 2) return; ctx.setLineDash(dash || []); ctx.strokeStyle = style; ctx.lineWidth = wd; ctx.beginPath(); pts.forEach(([x, y], n) => n ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.stroke(); ctx.setLineDash([]); };
  line(trail, 'rgba(255,255,255,0.22)', 2);
  if (view.dr) line(drTrail, 'rgba(123,130,140,0.6)', 2, [6, 6]);
  // path + look-ahead
  if (w.plan) {
    const rest = w.pp.remaining();
    line(w.plan, 'rgba(77,171,247,0.28)', 3);
    line(rest, '#4dabf7', 3.5);
    if (w.pp.target) { ctx.fillStyle = '#4dabf7'; ctx.beginPath(); ctx.arc(X(w.pp.target[0]), Y(w.pp.target[1]), 6, 0, 7); ctx.fill(); }
  }
  if (w.goal) {
    const [gx, gy] = w.goal; ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 3;
    for (const r of [10, 20]) { ctx.beginPath(); ctx.arc(X(gx), Y(gy), r, 0, 7); ctx.stroke(); }
  }
  // lidar
  if (view.beam && w.scan) {
    const [x, y, th] = w.pose;
    ctx.strokeStyle = 'rgba(99,230,190,0.10)'; ctx.lineWidth = 1; ctx.beginPath();
    for (const b of w.scan) { ctx.moveTo(X(x), Y(y)); ctx.lineTo(X(x + b.r * Math.cos(th + b.a)), Y(y + b.r * Math.sin(th + b.a))); }
    ctx.stroke(); ctx.fillStyle = '#63e6be';
    for (const b of w.scan) if (b.r < LIDAR.maxRange - 0.01) ctx.fillRect(X(x + b.r * Math.cos(th + b.a)) - 2.5, Y(y + b.r * Math.sin(th + b.a)) - 2.5, 5, 5);
  }
  // particles
  if (view.part) {
    const pf = w.pf; ctx.fillStyle = 'rgba(255,212,59,0.55)';
    const sz = pf.N > 2000 ? 2.5 : 3.5;
    for (let n = 0; n < pf.N; n++) ctx.fillRect(X(pf.x[n]) - sz / 2, Y(pf.y[n]) - sz / 2, sz, sz);
  }
  if (view.dr) robotShape(w.odom, '#7b828c', null, [5, 4]);
  robotShape(w.pose, '#ffffff', 'rgba(255,255,255,0.10)');
  if (w.est.spread < 1.0) {
    const { x, y, th } = w.est; ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(-th);
    ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-12, 13); ctx.lineTo(-6, 0); ctx.lineTo(-12, -13); ctx.closePath(); ctx.fill(); ctx.restore();
  }
}

function drawPlot() {
  const W = plot.width, H = plot.height, g = pctx, h = world.history, span = 60, t1 = world.t, t0 = Math.max(0, t1 - span);
  g.fillStyle = '#101215'; g.fillRect(0, 0, W, H);
  const lo = Math.log10(0.01), hi = Math.log10(20), py = v => H - 24 - (Math.log10(Math.max(0.01, Math.min(20, v))) - lo) / (hi - lo) * (H - 44);
  const px = t => 44 + (t - t0) / span * (W - 56);
  g.font = '18px system-ui, sans-serif'; g.fillStyle = '#6c737d'; g.strokeStyle = '#242830'; g.lineWidth = 1;
  for (const [v, lab] of [[0.01, '1 cm'], [0.1, '10 cm'], [1, '1 m'], [10, '10 m']]) { g.beginPath(); g.moveTo(44, py(v)); g.lineTo(W - 8, py(v)); g.stroke(); g.fillText(lab, 2, py(v) + 6); }
  const series = (key, col, wd) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); let first = true; for (const s of h) { if (s.t < t0) continue; const a = px(s.t), b = py(s[key]); if (first) { g.moveTo(a, b); first = false; } else g.lineTo(a, b); } g.stroke(); };
  series('dr', '#7b828c', 2.5); series('err', '#ff8a3d', 3);
  g.fillStyle = '#ff8a3d'; g.fillText('filter error', 54, 22); g.fillStyle = '#7b828c'; g.fillText('dead reckoning', 160, 22);
  g.fillStyle = '#6c737d'; g.fillText('last 60 s, log scale', W - 170, H - 4);
}

const fmt = (v, d = 0) => (v == null || !isFinite(v)) ? '–' : v.toFixed(d);
function panel() {
  const w = world, last = w.history.at(-1);
  $('mode').textContent = w.mode; $('mode').className = 'chip m-' + w.mode;
  $('clock').textContent = `t = ${w.t.toFixed(1)} s` + (speed !== 1 ? ` · ${speed}×` : '');
  if (last) {
    $('m-err').textContent = last.err < 1 ? `${fmt(last.err * 100, 1)} cm` : `${fmt(last.err, 2)} m`;
    $('m-herr').textContent = `${fmt(last.herr * 180 / Math.PI, 1)}°`;
    $('m-dr').textContent = last.dr < 1 ? `${fmt(last.dr * 100, 1)} cm` : `${fmt(last.dr, 2)} m`;
    $('m-n').textContent = `${w.pf.N} / ${fmt(w.pf.neff)}`;
  }
  $('m-fit').textContent = fmt(w.score, 2);
  $('m-conv').textContent = w.lastConvergence != null ? `${fmt(w.lastConvergence, 1)} s` : '–';
  const ps = w.planStats;
  $('m-plan').textContent = ps ? `${fmt(ps.ms, 1)} ms / ${ps.expanded}` : '–';
  $('m-len').textContent = ps && isFinite(ps.lengthM) ? `${fmt(ps.lengthM, 1)} m` : '–';
  $('m-cmd').textContent = w.cmd ? `${fmt(w.cmd.v, 2)} m/s · ${fmt(w.cmd.w, 2)} rad/s` : '–';
  $('log').innerHTML = w.events.slice(-6).reverse().map(e => `<div><b>${e.t.toFixed(1)} s</b> ${e.msg}</div>`).join('');
}

function stepSim(n) {
  for (let k = 0; k < n; k++) {
    world.tick();
    if (world.step % 3 === 0) {
      trail.push([world.pose[0], world.pose[1]]); drTrail.push([world.odom[0], world.odom[1]]);
      if (trail.length > 900) trail.shift(); if (drTrail.length > 900) drTrail.shift();
    }
  }
}
function render() { draw(); drawPlot(); panel(); }

function start(seed = 7) {
  world = new World({ seed }); trail = []; drTrail = [];
  buildStatic();
  if (!FILM && !tour.on) world.setGoal(STATIONS.pickB.slice(0, 2));
}

// ---------- auto tour chip / take over ----------
const chip = $('tourchip');
function setSpeed(v) { speed = v; $('b-speed').textContent = `Speed ${speed}×`; }
function drawChip() {
  chip.classList.toggle('on', tour.on); chip.hidden = FILM;
  chip.innerHTML = tour.on ? '<i></i>AUTO TOUR · CLICK ANYWHERE TO TAKE OVER · 自動導覽' : '▶ RESUME TOUR · 繼續導覽';
  document.body.classList.toggle('tour', tour.on);
}
function restartTour() { tour.on = true; tour.lastInput = performance.now(); start(TOUR_SEEDS[++tour.n % TOUR_SEEDS.length]); film.phase = 0; film.done = false; setSpeed(2); drawChip(); render(); }
function takeOver() {
  tour.lastInput = performance.now();
  if (!tour.on) return;
  tour.on = false; setSpeed(1); drawChip();
  if (!world.goal) world.setGoal(STATIONS.pickB.slice(0, 2));
}
chip.addEventListener('pointerdown', ev => { ev.stopPropagation(); tour.lastInput = performance.now(); if (!tour.on) restartTour(); else takeOver(); });
addEventListener('pointerdown', () => takeOver()); addEventListener('keydown', () => takeOver());
setInterval(() => { if (!tour.on && !FILM && performance.now() - tour.lastInput > 60000) restartTour(); }, 2000);   // idle for a minute: the tour comes back

// ---------- interactive ----------
function toWorld(ev) {
  const r = cv.getBoundingClientRect();
  return [(ev.clientX - r.left) / r.width * 24, (1 - (ev.clientY - r.top) / r.height) * 14];
}
cv.addEventListener('click', ev => {
  const [x, y] = toWorld(ev);
  if (tool === 'goal') { if (!world.map.occAt(x, y)) world.setGoal([x, y]); }
  else world.toggleObstacle(x, y);
  render();
});
const setTool = t => { tool = t; $('t-goal').classList.toggle('on', t === 'goal'); $('t-box').classList.toggle('on', t === 'box'); };
$('t-goal').onclick = () => setTool('goal'); $('t-box').onclick = () => setTool('box');
$('b-kidnap').onclick = () => { world.kidnap(); trail = []; drTrail = []; };
$('b-reloc').onclick = () => { world.pf.initGlobal(); world.est = world.pf.estimate(); world.mode = 'localizing'; world.plan = null; world.pp.setPath(null); world.lostSince = world.t; world.convergedAt = null; world.goodSince = null; world.clearCostmap(); world.log('Global relocalization requested'); };
$('b-pause').onclick = () => { paused = !paused; $('b-pause').textContent = paused ? 'Resume' : 'Pause'; $('b-pause').classList.toggle('on', paused); };
$('b-speed').onclick = () => setSpeed(speed === 1 ? 2 : speed === 2 ? 4 : 1);
for (const [id, k] of [['v-part', 'part'], ['v-beam', 'beam'], ['v-infl', 'infl'], ['v-dr', 'dr']]) $(id).onchange = e => { view[k] = e.target.checked; };

// ---------- scripted film (?film): deterministic, one call = one video frame ----------
const film = { phase: 0, frame: 0, done: false, spf: 2 };
function caption(n, t, s) { $('cap-n').textContent = n; $('cap-t').textContent = t; $('cap-s').textContent = tour.on ? '' : s; }
function filmDirector() {
  const w = world, f = film;
  if (FILM) { f.spf = f.phase <= 1 ? f.slow : f.phase >= 4 && f.phase <= 4.5 ? 2 : f.base; speed = f.spf; }   // slow while the cloud converges so the viewer can watch it
  if (f.phase === 0) { caption(1, 'Where am I? 5,000 guesses', 'Global localization from lidar + wheel odometry'); f.phase = 1; }
  else if (f.phase === 1 && w.mode !== 'localizing') { w.setGoal(STATIONS.pickB.slice(0, 2)); caption(2, 'Localized. A* plans, pure pursuit drives', 'Planning on the map inflated by the robot radius'); f.phase = 2; f.t2 = w.t; }
  else if (f.phase === 2 && w.plan && w.t - f.t2 > 2.5) {
    const rest = w.pp.remaining(), k = Math.min(rest.length - 1, 30);
    if (k > 12) { const [bx, by] = rest[k]; w.toggleObstacle(bx, by, 0.9, 1); caption(3, 'A box nobody mapped', 'The lidar sees it (red), A* replans around it'); f.phase = 3; f.t3 = w.t; }
  }
  else if (f.phase === 3 && (w.mode === 'idle' || w.t - f.t3 > 14)) { w.kidnap([20.2, 4.6, 2.6]); trail = []; drTrail = []; caption(4, 'Kidnapped', 'The scan stops fitting the map, so it searches again'); f.phase = 4; f.t4 = w.t; }
  else if (f.phase === 4 && w.mode === 'localizing') { f.phase = 4.5; }
  else if (f.phase === 4.5 && w.mode !== 'localizing') { w.setGoal(STATIONS.dock.slice(0, 2)); caption(5, 'Recovered, back to the dock', `Relocalized in ${(w.t - f.t4).toFixed(1)} s`); f.phase = 5; f.t5 = w.t; }
  else if (f.phase === 5 && (w.mode === 'idle' || w.t - f.t5 > 45)) { f.phase = 6; f.t6 = w.t; }
  else if (f.phase === 6 && tour.on) { w.setGoal(STATIONS.pickC.slice(0, 2)); caption(6, 'Next pick: station C', ''); f.phase = 7; f.t7 = w.t; }
  else if (f.phase === 7 && (w.mode === 'idle' || w.t - f.t7 > 25)) { w.setGoal(STATIONS.office.slice(0, 2)); caption(7, 'Then the office', ''); f.phase = 8; f.t8 = w.t; }
  else if (f.phase === 8 && (w.mode === 'idle' || w.t - f.t8 > 25)) { f.phase = 9; f.t9 = w.t; }
  else if (f.phase === 9 && w.t - f.t9 > 1.5) { tour.n++; start(TOUR_SEEDS[tour.n % TOUR_SEEDS.length]); film.phase = 0; film.frame = 0; }   // loop: a fresh start, global search again
  else if (f.phase === 6 && w.t - f.t6 > 1.5) f.done = true;
}
window.filmStep = (dry) => { filmDirector(); stepSim(film.spf); if (!dry) render(); film.frame++; const e = world.history.at(-1); return { done: film.done, t: +world.t.toFixed(1), phase: film.phase, mode: world.mode, err: e ? +e.err.toFixed(2) : null }; };
window.filmReady = false;

start(+(new URLSearchParams(location.search).get('seed') || (tour.on ? TOUR_SEEDS[0] : 7)));
if (tour.on) setSpeed(2);
drawChip();
render();
if (FILM) { film.base = +(new URLSearchParams(location.search).get('spf') || 3); film.slow = +(new URLSearchParams(location.search).get('slow') || 2); film.spf = film.slow; speed = film.spf; window.filmReady = true; }
else {
  let acc = 0, lastT = performance.now();
  const loop = now => {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (tour.on) filmDirector();
    if (!paused) { acc += dt * speed; let n = 0; while (acc >= DT && n < 12) { stepSim(1); acc -= DT; n++; } if (n === 12) acc = 0; }
    render(); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
