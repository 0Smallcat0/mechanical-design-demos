// Collision checking, RRT-Connect in joint space, path shortcutting and time scaling.
import { ARM, fk, v3, mulberry32 } from './kin.js';

// ---------- geometry ----------
function closestOnSeg(p, a, b) {
  const ab = v3.sub(b, a), t = Math.max(0, Math.min(1, v3.dot(v3.sub(p, a), ab) / (v3.dot(ab, ab) || 1e-12)));
  return v3.add(a, v3.scale(ab, t));
}
export function segPointDist(a, b, p) { return v3.norm(v3.sub(p, closestOnSeg(p, a, b))); }

// Segment-segment distance (Ericson, Real-Time Collision Detection 5.1.9).
export function segSegDist(p1, q1, p2, q2) {
  const d1 = v3.sub(q1, p1), d2 = v3.sub(q2, p2), r = v3.sub(p1, p2);
  const a = v3.dot(d1, d1), e = v3.dot(d2, d2), f = v3.dot(d2, r);
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) return v3.norm(r);
  if (a <= 1e-12) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = v3.dot(d1, r);
    if (e <= 1e-12) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = v3.dot(d1, d2), den = a * e - b * b;
      s = den !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  return v3.norm(v3.sub(v3.add(p1, v3.scale(d1, s)), v3.add(p2, v3.scale(d2, t))));
}

// Distance from a segment to an axis-aligned box: exact for the segment's closest point,
// found by ternary search on the convex function t -> dist(point(t), box).
function pointBoxDist(p, lo, hi) {
  const dx = Math.max(lo[0] - p[0], 0, p[0] - hi[0]);
  const dy = Math.max(lo[1] - p[1], 0, p[1] - hi[1]);
  const dz = Math.max(lo[2] - p[2], 0, p[2] - hi[2]);
  return Math.hypot(dx, dy, dz);
}
export function segBoxDist(a, b, lo, hi) {
  const ab = v3.sub(b, a), at = (t) => v3.add(a, v3.scale(ab, t));
  let l = 0, r = 1;
  for (let i = 0; i < 40; i++) {
    const m1 = l + (r - l) / 3, m2 = r - (r - l) / 3;
    if (pointBoxDist(at(m1), lo, hi) < pointBoxDist(at(m2), lo, hi)) r = m2; else l = m1;
  }
  return pointBoxDist(at((l + r) / 2), lo, hi);
}

// ---------- world ----------
// obstacles: { type:'sphere', c:[3], r } | { type:'box', lo:[3], hi:[3] }
// attached: optional sphere carried by the tool, { offset (m along tool z), r }
export function makeWorld(obstacles, opt = {}) {
  return { obstacles, floor: opt.floor ?? 0, margin: opt.margin ?? 0.01, attached: opt.attached || null };
}

export function linkCapsules(q, world, arm = ARM) {
  const F = fk(q, arm), P = F.points;
  const caps = arm.links.map((L) => ({ a: P[L.a], b: P[L.b], r: L.r, name: L.name }));
  if (world && world.attached) {
    const c = v3.add(F.tool.p, [F.tool.R[2] * world.attached.offset, F.tool.R[5] * world.attached.offset, F.tool.R[8] * world.attached.offset]);
    caps.push({ a: c, b: c, r: world.attached.r, name: 'payload' });
  }
  return { caps, F };
}

// Returns null if free, otherwise a short reason string.
export function collides(q, world, arm = ARM) {
  const { caps } = linkCapsules(q, world, arm), m = world.margin;
  for (let i = 1; i < caps.length; i++) { // column (0) is fixed to the base and never moves into anything
    const c = caps[i];
    if (Math.min(c.a[2], c.b[2]) - c.r < world.floor + m) return `${c.name} hits floor`;
    for (const o of world.obstacles) {
      const d = o.type === 'sphere' ? segPointDist(c.a, c.b, o.c) - o.r : segBoxDist(c.a, c.b, o.lo, o.hi);
      if (d < c.r + m) return `${c.name} hits ${o.name || o.type}`;
    }
  }
  // self collision: wrist/tool and payload against column and upper arm
  for (let i = 3; i < caps.length; i++) for (const j of [0, 1]) {
    if (segSegDist(caps[i].a, caps[i].b, caps[j].a, caps[j].b) < caps[i].r + caps[j].r) return `${caps[i].name} hits ${caps[j].name}`;
  }
  return null;
}

// Edge check: interpolate with a max joint step (rad).
export function edgeFree(qa, qb, world, res = 0.02, arm = ARM) {
  const d = Math.max(...qa.map((v, i) => Math.abs(qb[i] - v)));
  const steps = Math.max(1, Math.ceil(d / res));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    if (collides(qa.map((v, i) => v + (qb[i] - v) * t), world, arm)) return false;
  }
  return true;
}

// ---------- RRT-Connect (Kuffner & LaValle 2000) ----------
const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
function nearest(tree, q) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < tree.length; i++) { const d = dist(tree[i].q, q); if (d < bd) { bd = d; bi = i; } }
  return bi;
}
function steer(from, to, step) {
  const d = dist(from, to);
  if (d <= step) return to.slice();
  return from.map((v, i) => v + ((to[i] - v) * step) / d);
}
// Returns 'reached' | 'advanced' | 'trapped'
function extend(tree, q, world, step, arm) {
  const ni = nearest(tree, q), qn = tree[ni].q, qs = steer(qn, q, step);
  if (collides(qs, world, arm) || !edgeFree(qn, qs, world, 0.02, arm)) return ['trapped', -1];
  tree.push({ q: qs, parent: ni });
  return [dist(qs, q) < 1e-9 ? 'reached' : 'advanced', tree.length - 1];
}
function connect(tree, q, world, step, arm) {
  let s, idx;
  do { [s, idx] = extend(tree, q, world, step, arm); } while (s === 'advanced');
  return [s, idx];
}
function trace(tree, i) { const out = []; while (i >= 0) { out.push(tree[i].q); i = tree[i].parent; } return out; }

export function rrtConnect(qStart, qGoal, world, opt = {}) {
  const arm = opt.arm || ARM, rng = opt.rng || mulberry32(opt.seed ?? 1);
  const step = opt.step ?? 0.15, maxIter = opt.maxIter ?? 6000;
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const res = { ok: false, path: null, iters: 0, nodes: 0, trees: null, ms: 0 };
  if (collides(qStart, world, arm)) return { ...res, reason: 'start in collision' };
  if (collides(qGoal, world, arm)) return { ...res, reason: 'goal in collision' };
  let A = [{ q: qStart.slice(), parent: -1 }], B = [{ q: qGoal.slice(), parent: -1 }], swapped = false;
  for (let k = 0; k < maxIter; k++) {
    const qr = arm.joints.map((J) => J.min + (J.max - J.min) * rng());
    const [s, ia] = extend(A, qr, world, step, arm);
    if (s !== 'trapped') {
      const [s2, ib] = connect(B, A[ia].q, world, step, arm);
      if (s2 === 'reached') {
        let pa = trace(A, ia).reverse(), pb = trace(B, ib);
        let path = pa.concat(pb.slice(1));
        if (swapped) path = path.reverse();
        const ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
        const trees = swapped ? [B, A] : [A, B];
        return { ok: true, path, iters: k + 1, nodes: A.length + B.length, trees, ms };
      }
    }
    [A, B] = [B, A]; swapped = !swapped;
  }
  return { ...res, iters: maxIter, nodes: A.length + B.length, trees: swapped ? [B, A] : [A, B], reason: 'iteration limit',
    ms: (typeof performance !== 'undefined' ? performance : Date).now() - t0 };
}

export function pathLength(path) { let L = 0; for (let i = 1; i < path.length; i++) L += dist(path[i - 1], path[i]); return L; }

// Random shortcutting: try to join two random waypoints with a straight collision-free edge.
export function shortcut(path, world, opt = {}) {
  const arm = opt.arm || ARM, rng = opt.rng || mulberry32(opt.seed ?? 7), tries = opt.tries ?? 200;
  let P = path.map((q) => q.slice());
  for (let k = 0; k < tries && P.length > 2; k++) {
    const i = Math.floor(rng() * (P.length - 2)), j = i + 2 + Math.floor(rng() * (P.length - i - 2));
    if (j >= P.length) continue;
    if (edgeFree(P[i], P[j], world, 0.02, arm)) P = P.slice(0, i + 1).concat(P.slice(j));
  }
  // final greedy pass from the start
  const out = [P[0]];
  let i = 0;
  while (i < P.length - 1) {
    let j = P.length - 1;
    while (j > i + 1 && !edgeFree(P[i], P[j], world, 0.02, arm)) j--;
    out.push(P[j]); i = j;
  }
  return out;
}

// ---------- time scaling ----------
// Each segment is rest-to-rest along a straight joint-space line, synchronised so all joints
// start and stop together. 'quintic': s = 10t^3 - 15t^4 + 6t^5 (zero vel and acc at both ends).
// 'trapezoid': constant accel / cruise / constant decel at the slowest joint's limits.
export function timeScale(path, opt = {}) {
  const arm = opt.arm || ARM, profile = opt.profile || 'quintic', vs = opt.speed ?? 1;
  const segs = [];
  let T0 = 0;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k], d = a.map((v, i) => b[i] - v);
    let T = 0, ta = 0;
    if (profile === 'quintic') {
      for (let i = 0; i < d.length; i++) {
        const D = Math.abs(d[i]), J = arm.joints[i];
        T = Math.max(T, (1.875 * D) / (J.vmax * vs), Math.sqrt((5.7735 * D) / (J.amax * vs)));
      }
    } else {
      // per-joint minimum time trapezoid, then use the slowest and scale the others
      for (let i = 0; i < d.length; i++) {
        const D = Math.abs(d[i]), J = arm.joints[i], v = J.vmax * vs, A = J.amax * vs;
        const Ti = D * A < v * v ? 2 * Math.sqrt(D / A) : D / v + v / A;
        if (Ti > T) { T = Ti; ta = D * A < v * v ? Ti / 2 : v / A; }
      }
    }
    T = Math.max(T, 0.05);
    if (profile !== 'quintic') ta = Math.min(Math.max(ta, 0.02), T / 2);
    segs.push({ a, b, d, T, ta, t0: T0 });
    T0 += T;
  }
  return { segs, duration: T0, profile };
}

// Normalised s(t), s', s'' for one segment.
function sProfile(seg, t, profile) {
  const T = seg.T, u = Math.min(1, Math.max(0, t / T));
  if (profile === 'quintic') {
    return [10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5,
            (30 * u ** 2 - 60 * u ** 3 + 30 * u ** 4) / T,
            (60 * u - 180 * u ** 2 + 120 * u ** 3) / (T * T)];
  }
  const ta = seg.ta, vp = 1 / (T - ta), ap = vp / ta; // area under velocity = 1
  const tc = Math.min(Math.max(t, 0), T);
  if (tc < ta) return [0.5 * ap * tc * tc, ap * tc, ap];
  if (tc < T - ta) return [0.5 * ap * ta * ta + vp * (tc - ta), vp, 0];
  const r = T - tc;
  return [1 - 0.5 * ap * r * r, ap * r, -ap];
}

// One quintic along the whole polyline (for dense Cartesian paths): no stop at each waypoint.
export function timeScaleBlend(path, opt = {}) {
  const arm = opt.arm || ARM, n = path[0].length, cum = [0], tot = new Array(n).fill(0);
  for (let k = 1; k < path.length; k++) {
    cum.push(cum[k - 1] + dist(path[k - 1], path[k]));
    for (let i = 0; i < n; i++) tot[i] += Math.abs(path[k][i] - path[k - 1][i]);
  }
  const L = cum.at(-1) || 1e-9; let T = 0.3;
  // per-joint peak rate is bounded by the steepest segment slope times the path speed
  for (let i = 0; i < n; i++) {
    let slope = 0;
    for (let k = 1; k < path.length; k++) slope = Math.max(slope, Math.abs(path[k][i] - path[k - 1][i]) / Math.max(1e-9, cum[k] - cum[k - 1]));
    const J = arm.joints[i];
    T = Math.max(T, (1.875 * L * slope) / J.vmax, Math.sqrt((5.7735 * L * slope) / J.amax));
  }
  return { blend: true, path, cum, L, duration: T, segs: [{ T, t0: 0 }], profile: 'quintic' };
}

export function sample(traj, t) {
  if (traj.blend) {
    const T = traj.duration, u = Math.min(1, Math.max(0, t / T));
    const s = traj.L * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5), sd = traj.L * (30 * u ** 2 - 60 * u ** 3 + 30 * u ** 4) / T,
      sdd = traj.L * (60 * u - 180 * u ** 2 + 120 * u ** 3) / (T * T);
    let k = 1; while (k < traj.cum.length - 1 && traj.cum[k] < s) k++;
    const a = traj.path[k - 1], b = traj.path[k], len = Math.max(1e-9, traj.cum[k] - traj.cum[k - 1]), f = (s - traj.cum[k - 1]) / len;
    const dir = b.map((v, i) => (v - a[i]) / len);
    return { q: a.map((v, i) => v + (b[i] - v) * f), qd: dir.map((d) => d * sd), qdd: dir.map((d) => d * sdd), seg: k - 1 };
  }
  const { segs } = traj;
  if (!segs.length) return null;
  let k = segs.findIndex((s) => t < s.t0 + s.T);
  if (k < 0) k = segs.length - 1;
  const s = segs[k], [p, v, a] = sProfile(s, t - s.t0, traj.profile);
  return { q: s.a.map((x, i) => x + s.d[i] * p), qd: s.d.map((x) => x * v), qdd: s.d.map((x) => x * a), seg: k };
}
