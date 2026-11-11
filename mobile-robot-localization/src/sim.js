// The whole loop in one place, used by the live page, the tests and the film:
// true robot + lidar  ->  odometry + scan  ->  particle filter  ->  costmap  ->  A*  ->  pure pursuit  ->  wheels
import { makeRng, wrap } from './rng.js';
import { makeWarehouse } from './grid.js';
import { ParticleFilter } from './mcl.js';
import { planOnGrid } from './astar.js';
import { ROBOT, LIDAR, driveStep, integrateOdom, scanLidar, PurePursuit } from './robot.js';

export const DT = 1 / 30;           // s, physics step
export const PF_EVERY = 3;          // filter at 10 Hz
export const INFLATION = 0.35;      // m, planning clearance (robot radius 0.25 + 0.10 margin)
const LOCK_SPREAD = 0.25;           // m, particle spread that counts as "localized"

export class World {
  constructor(opts = {}) {
    this.seed = opts.seed ?? 7;
    this.rng = makeRng(this.seed);
    this.map = makeWarehouse();             // prior map the robot was given
    this.truth = this.map.clone();          // the real building (map + objects the user drops)
    this.cost = this.map.clone();           // planning map: prior + what the lidar has seen
    this.seen = new Uint8Array(this.map.w * this.map.h);
    this.pf = new ParticleFilter(this.map, this.rng, { Nglobal: opts.Nglobal ?? 5000, Ntrack: opts.Ntrack ?? 1000, beamStride: 2 });
    this.pp = new PurePursuit();
    this.t = 0; this.step = 0;
    this.history = [];                      // { t, err, dr, neff, spread }
    this.events = [];
    this.goal = null; this.plan = null; this.planStats = null;
    this.reset(opts.start ?? [3.0, 1.5, 0.3], opts.global ?? true);
  }
  log(msg) { this.events.push({ t: this.t, msg }); if (this.events.length > 50) this.events.shift(); }
  reset(start, global = true) {
    this.pose = start.slice();
    this.odom = start.slice();                 // dead reckoning, given the true start (best case for it)
    this.odomAtPf = this.odom.slice();
    if (global) this.pf.initGlobal(); else this.pf.initAt(start);
    this.est = this.pf.estimate();
    this.mode = global ? 'localizing' : 'idle';
    this.lostSince = this.t; this.convergedAt = null; this.lastConvergence = null; this.goodSince = null;
    this.scan = scanLidar(this.truth, this.pose, this.rng);
    this.log(global ? 'Global localization: particles spread over the whole map' : 'Tracking from a known start');
  }
  kidnap(to) {
    this.pose = to ? to.slice() : this.pf.randomPose();
    while (this.truth.distAt(this.pose[0], this.pose[1]) < 0.4) this.pose = this.pf.randomPose();
    this.odom = this.pose.slice(); this.odomAtPf = this.odom.slice();
    this.lostSince = this.t; this.convergedAt = null; this.goodSince = null;
    this.log('Kidnapped: robot carried to a new spot, the filter is not told');
  }
  setGoal(g) {
    this.goal = g.slice(); this.log(`Goal set (${g[0].toFixed(1)}, ${g[1].toFixed(1)}) m`);
    if (this.mode !== 'localizing') this.replan('new goal');
  }
  toggleObstacle(x, y, size = 0.6, on) {
    const [i, j] = this.truth.cellOf(x, y);
    if (this.map.isOcc(i, j)) return false;             // walls and racks are not editable
    const val = on ?? (this.truth.isOcc(i, j) ? 0 : 1);
    const h = size / 2;
    // never drop a box on the robot
    if (val && Math.hypot(x - this.pose[0], y - this.pose[1]) < h + ROBOT.radius + 0.1) return false;
    for (let yy = y - h + 0.05; yy < y + h; yy += this.map.res) for (let xx = x - h + 0.05; xx < x + h; xx += this.map.res) {
      const [a, b] = this.truth.cellOf(xx, yy);
      if (!this.truth.inside(a, b) || this.map.isOcc(a, b)) continue;
      this.truth.occ[this.truth.idx(a, b)] = val;
    }
    this.truth._dist = null;
    this.log(val ? 'Box dropped (unknown to the map until the lidar sees it)' : 'Box removed');
    return true;
  }
  // what the lidar marked may have been drawn from a wrong pose: forget it when localization is lost
  clearCostmap() { this.cost.occ.set(this.map.occ); this.cost._dist = null; this.seen.fill(0); }
  replan(reason) {
    if (!this.goal) return;
    const r = planOnGrid(this.cost, [this.est.x, this.est.y], this.goal, INFLATION);
    this.planStats = { ms: r.ms, expanded: r.expanded, lengthM: r.lengthM, reason, t: this.t };
    if (!r.world) { this.plan = null; this.pp.setPath(null); this.mode = 'blocked'; this.log('No path to goal'); return; }
    this.plan = r.world; this.pp.setPath(r.world); this.mode = 'driving';
    this.log(`A* ${reason}: ${r.lengthM.toFixed(1)} m, ${r.expanded} cells, ${r.ms.toFixed(1)} ms`);
  }
  // lidar hits that are free on the prior map become obstacles on the costmap; beams passing through clear them
  updateCostmap() {
    if (this.est.spread > LOCK_SPREAD) return false;
    const g = this.cost, m = this.map, e = this.est; let changed = false;
    for (const b of this.scan) {
      const ang = e.th + b.a, ca = Math.cos(ang), sa = Math.sin(ang);
      const hit = b.r < LIDAR.maxRange - 1e-6;
      for (let s = 0.3; s < b.r - 0.15; s += g.res) {
        const [i, j] = g.cellOf(e.x + s * ca, e.y + s * sa); if (!g.inside(i, j)) break;
        const k = g.idx(i, j);
        if (this.seen[k] && !m.occ[k]) { this.seen[k] = 0; if (g.occ[k]) { g.occ[k] = 0; changed = true; } }
      }
      if (!hit) continue;
      const [i, j] = g.cellOf(e.x + (b.r + 0.05) * ca, e.y + (b.r + 0.05) * sa);
      if (!g.inside(i, j)) continue;
      const k = g.idx(i, j);
      if (m.occ[k] || m.distanceField()[k] < 0.15) continue;   // a mapped wall, not news
      if (this.seen[k] < 3) this.seen[k]++;
      if (this.seen[k] >= 2 && !g.occ[k]) { g.occ[k] = 1; changed = true; }
    }
    if (changed) g._dist = null;
    return changed;
  }
  pathBlocked() {
    if (!this.plan) return false;
    const rest = this.pp.remaining(), d = this.cost.distanceField();
    for (const [x, y] of rest) { const [i, j] = this.cost.cellOf(x, y); if (d[this.cost.idx(i, j)] < INFLATION - 0.08) return true; }
    return false;
  }
  wander() {
    // reactive exploration while lost: head for open space, slow
    let best = 0, bestA = 0;
    for (const b of this.scan) if (Math.abs(b.a) < 1.2 && b.r > best) { best = b.r; bestA = b.a; }
    const front = Math.min(...this.scan.filter(b => Math.abs(b.a) < 0.4).map(b => b.r));
    if (front < 0.6) return { v: 0, w: 1.0 };
    return { v: 0.35, w: 1.2 * bestA };
  }
  tick() {
    let cmd = { v: 0, w: 0 };
    if (this.mode === 'localizing') cmd = this.wander();
    else if (this.mode === 'driving') {
      cmd = this.pp.control([this.est.x, this.est.y, this.est.th]);
      if (cmd.done) { this.mode = 'idle'; this.log('Goal reached'); this.onGoalReached?.(); cmd = { v: 0, w: 0 }; }
    }
    // bumper: a step that would touch something is not taken and the wheels do not turn; after 0.4 s stuck, back up for 0.7 s and replan
    if (this.backUp > 0) { cmd = { v: -0.2, w: 0 }; this.backUp--; if (this.backUp === 0 && this.goal && this.mode === 'driving') this.replan('after backing up'); }
    let { next, encL, encR } = driveStep(this.pose, cmd.v, cmd.w, DT, this.rng);
    if (this.truth.distAt(next[0], next[1]) > ROBOT.radius - 0.05) { this.pose = next; this.stuck = 0; }
    else { encL = encR = 0; if (cmd.v > 0.05 && ++this.stuck >= 12 && !this.backUp) { this.backUp = 21; this.stuck = 0; this.log('Bumper: stuck, backing up'); } }
    this.odom = integrateOdom(this.odom, encL, encR);
    this.cmd = cmd;
    this.step++; this.t = this.step * DT;
    if (this.step % PF_EVERY === 0) this.filterStep();
  }
  filterStep() {
    this.scan = scanLidar(this.truth, this.pose, this.rng);
    this.pf.predict(this.odomAtPf, this.odom); this.odomAtPf = this.odom.slice();
    // annealing: a wide likelihood while the particles are spread over the map, the sensor's own width once they agree
    const sp = this.est.spread;
    this.pf.sigmaHit = this.mode === 'localizing' ? Math.min(this.sigmaWide ?? 0.6, Math.max(0.15, (this.anneal ?? 0.15) * sp)) : 0.15;
    // global search: temper the likelihood (Neff floor) and roughen the resampled cloud so it explores before it commits
    const searching = this.mode === 'localizing';
    this.pf.neffTarget = searching ? (this.neffFloor ?? 0.55) : 0;
    this.pf.jitter = searching ? [0.08, 0.04] : [0, 0];
    this.pf.update(this.scan);
    this.est = this.pf.est;
    const err = Math.hypot(this.est.x - this.pose[0], this.est.y - this.pose[1]);
    const dr = Math.hypot(this.odom[0] - this.pose[0], this.odom[1] - this.pose[1]);
    const herr = Math.abs(wrap(this.est.th - this.pose[2]));
    this.history.push({ t: this.t, err, dr, herr, neff: this.pf.neff, spread: this.est.spread });
    if (this.history.length > 3000) this.history.shift();
    // convergence time against ground truth: error < 10 cm held for 1 s
    if (this.convergedAt === null) {
      if (err < 0.1) { if (this.goodSince === null) this.goodSince = this.t; if (this.t - this.goodSince >= 1) { this.convergedAt = this.goodSince; this.lastConvergence = this.goodSince - this.lostSince; this.log(`Converged in ${this.lastConvergence.toFixed(1)} s`); } }
      else this.goodSince = null;
    }
    // the robot's own view of whether it is localized (it does not know the ground truth)
    this.score = this.pf.scanScore([this.est.x, this.est.y, this.est.th], this.scan);
    if (this.mode === 'localizing') {
      if (this.est.spread < LOCK_SPREAD && this.score > (this.lockFit ?? 0.85)) {
        this.lockCount = (this.lockCount || 0) + 1;
        if (this.lockCount >= 20) {
          this.lockCount = 0; this.badCount = 0;
          this.pf.resample(this.pf.Ntrack);
          this.log(`Localized (spread ${(this.est.spread * 100).toFixed(0)} cm, scan fit ${this.score.toFixed(2)}); ${this.pf.N} particles to track`);
          this.mode = 'idle'; if (this.goal) this.replan('after localization');
        }
      } else this.lockCount = 0;
    } else {
      this.badCount = this.score < 0.35 ? (this.badCount || 0) + 1 : 0;
      if (this.badCount >= 5 || this.est.spread > 0.8) {
        this.badCount = 0; this.mode = 'localizing'; this.pp.setPath(null); this.plan = null;
        this.pf.initGlobal(); this.est = this.pf.estimate(); this.clearCostmap();
        this.log('Scan no longer fits the map: relocalizing with ' + this.pf.N + ' particles');
      } else if (this.updateCostmap() && this.pathBlocked()) this.replan('replan, path blocked');
    }
  }
}
