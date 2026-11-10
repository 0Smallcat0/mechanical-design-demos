// Differential-drive robot, wheel-encoder odometry, 2D lidar and a pure-pursuit path follower.
import { wrap } from './rng.js';

export const ROBOT = {
  radius: 0.25,         // m, footprint
  wheelBase: 0.42,      // m
  vMax: 0.8,            // m/s
  wMax: 1.6,            // rad/s
  encNoise: 0.02,       // relative std per wheel step
  encBias: [1.0, 1.015],// left/right effective-radius error seen by the encoders (systematic drift)
};

export const LIDAR = { beams: 72, maxRange: 15, sigma: 0.02, dropout: 0.02 };

// Advance the true pose; return the encoder-measured wheel travel (with noise and bias).
export function driveStep(pose, v, w, dt, rng, cfg = ROBOT) {
  v = Math.max(-cfg.vMax, Math.min(cfg.vMax, v)); w = Math.max(-cfg.wMax, Math.min(cfg.wMax, w));
  const b = cfg.wheelBase, dl = (v - w * b / 2) * dt, dr = (v + w * b / 2) * dt;
  const ds = (dl + dr) / 2, dth = (dr - dl) / b, mid = pose[2] + dth / 2;
  const next = [pose[0] + ds * Math.cos(mid), pose[1] + ds * Math.sin(mid), wrap(pose[2] + dth)];
  const encL = dl * cfg.encBias[0] * (1 + rng.gauss(cfg.encNoise));
  const encR = dr * cfg.encBias[1] * (1 + rng.gauss(cfg.encNoise));
  return { next, encL, encR };
}

export function integrateOdom(odom, encL, encR, cfg = ROBOT) {
  const ds = (encL + encR) / 2, dth = (encR - encL) / cfg.wheelBase, mid = odom[2] + dth / 2;
  return [odom[0] + ds * Math.cos(mid), odom[1] + ds * Math.sin(mid), wrap(odom[2] + dth)];
}

export function scanLidar(grid, pose, rng, cfg = LIDAR) {
  const out = [];
  for (let k = 0; k < cfg.beams; k++) {
    const a = -Math.PI + (2 * Math.PI * k) / cfg.beams;
    let r = grid.raycast(pose[0], pose[1], pose[2] + a, cfg.maxRange);
    if (rng.next() < cfg.dropout) r = cfg.maxRange;
    else if (r < cfg.maxRange) r = Math.max(0.05, r + rng.gauss(cfg.sigma));
    out.push({ a, r });
  }
  return out;
}

// Pure pursuit (Coulter 1992): steer along the arc through a look-ahead point on the path.
export class PurePursuit {
  constructor(opts = {}) {
    this.L = opts.lookahead ?? 0.7; this.vMax = opts.vMax ?? 0.7; this.goalTol = opts.goalTol ?? 0.12;
    this.path = null; this.i = 0; this.target = null;
  }
  setPath(path) { this.path = path; this.i = 0; this.target = null; }
  remaining() { return this.path ? this.path.slice(this.i) : []; }
  control(pose) {
    const p = this.path; if (!p || !p.length) return { v: 0, w: 0, done: true };
    const [x, y, th] = pose, goal = p[p.length - 1], dGoal = Math.hypot(goal[0] - x, goal[1] - y);
    if (dGoal < this.goalTol) return { v: 0, w: 0, done: true };
    // advance the progress index to the closest point (only forward, within a window)
    let best = this.i, bd = Infinity;
    for (let k = this.i; k < Math.min(p.length, this.i + 40); k++) { const d = Math.hypot(p[k][0] - x, p[k][1] - y); if (d < bd) { bd = d; best = k; } }
    this.i = best;
    let t = p.length - 1;
    for (let k = this.i; k < p.length; k++) if (Math.hypot(p[k][0] - x, p[k][1] - y) >= this.L) { t = k; break; }
    const tx = p[t][0], ty = p[t][1]; this.target = [tx, ty];
    const alpha = wrap(Math.atan2(ty - y, tx - x) - th);
    if (Math.abs(alpha) > 1.0) return { v: 0, w: Math.sign(alpha) * 1.2, done: false };
    const Ld = Math.max(0.2, Math.hypot(tx - x, ty - y)), kappa = (2 * Math.sin(alpha)) / Ld;
    let v = this.vMax / (1 + 1.5 * Math.abs(kappa));
    v = Math.min(v, 0.15 + 0.8 * dGoal);
    return { v, w: v * kappa, done: false };
  }
}
