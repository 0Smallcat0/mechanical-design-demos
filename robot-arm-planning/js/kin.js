// Kinematics for a generic 6-DOF arm with a spherical wrist.
// Pure JS, no dependencies: used by the browser app and by the node tests.
// Frames are z-up, metres, radians. A pose is { R: 3x3 row-major [9], p: [3] }.

export const DEG = Math.PI / 180;

// Joint chain in the zero configuration (arm pointing straight up).
// offset: translation from the previous joint frame; axis: rotation axis in the local frame.
export const ARM = {
  joints: [
    { name: 'J1 base yaw',      offset: [0, 0, 0.10], axis: [0, 0, 1], min: -170 * DEG, max: 170 * DEG, vmax: 2.0, amax: 6 },
    { name: 'J2 shoulder',      offset: [0, 0, 0.20], axis: [0, 1, 0], min: -120 * DEG, max: 120 * DEG, vmax: 1.6, amax: 5 },
    { name: 'J3 elbow',         offset: [0, 0, 0.35], axis: [0, 1, 0], min: -150 * DEG, max: 150 * DEG, vmax: 2.0, amax: 6 },
    { name: 'J4 forearm roll',  offset: [0, 0, 0.15], axis: [0, 0, 1], min: -180 * DEG, max: 180 * DEG, vmax: 3.0, amax: 10 },
    { name: 'J5 wrist pitch',   offset: [0, 0, 0.17], axis: [0, 1, 0], min: -120 * DEG, max: 120 * DEG, vmax: 3.0, amax: 10 },
    { name: 'J6 wrist roll',    offset: [0, 0, 0.00], axis: [0, 0, 1], min: -180 * DEG, max: 180 * DEG, vmax: 4.0, amax: 12 },
  ],
  tool: [0, 0, 0.10],
  // Collision capsules: segment between two chain points (indices into fkPoints) and a radius.
  links: [
    { a: 0, b: 2, r: 0.075, name: 'column' },
    { a: 2, b: 3, r: 0.055, name: 'upper arm' },
    { a: 3, b: 5, r: 0.045, name: 'forearm' },
    { a: 5, b: 7, r: 0.040, name: 'wrist + tool' },
  ],
};

export const HOME = [0, -20 * DEG, 70 * DEG, 0, 40 * DEG, 0];

// ---------- small linear algebra ----------
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: (a) => Math.hypot(a[0], a[1], a[2]),
};
export function matMul3(A, B) {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return C;
}
export function matVec3(A, v) {
  return [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
}
export function transpose3(A) { return [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]]; }
export function rotAxis(k, t) { // Rodrigues
  const c = Math.cos(t), s = Math.sin(t), C = 1 - c, [x, y, z] = k;
  return [c + x * x * C, x * y * C - z * s, x * z * C + y * s,
          y * x * C + z * s, c + y * y * C, y * z * C - x * s,
          z * x * C - y * s, z * y * C + x * s, c + z * z * C];
}
export const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// Rotation matrix -> rotation vector (axis * angle), robust near 0 and pi.
export function logR(R) {
  const tr = R[0] + R[4] + R[8];
  const c = Math.min(1, Math.max(-1, (tr - 1) / 2));
  const th = Math.acos(c);
  if (th < 1e-9) return [(R[7] - R[5]) / 2, (R[2] - R[6]) / 2, (R[3] - R[1]) / 2];
  if (Math.PI - th < 1e-6) {
    // axis from the largest diagonal term of (R + I)/2
    const xx = (R[0] + 1) / 2, yy = (R[4] + 1) / 2, zz = (R[8] + 1) / 2;
    let ax;
    if (xx >= yy && xx >= zz) { const x = Math.sqrt(xx); ax = [x, (R[1] + R[3]) / (4 * x), (R[2] + R[6]) / (4 * x)]; }
    else if (yy >= zz) { const y = Math.sqrt(yy); ax = [(R[1] + R[3]) / (4 * y), y, (R[5] + R[7]) / (4 * y)]; }
    else { const z = Math.sqrt(zz); ax = [(R[2] + R[6]) / (4 * z), (R[5] + R[7]) / (4 * z), z]; }
    return v3.scale(ax, th / v3.norm(ax));
  }
  const k = th / (2 * Math.sin(th));
  return [(R[7] - R[5]) * k, (R[2] - R[6]) * k, (R[3] - R[1]) * k];
}

// Solve A x = b (n x n, row-major) by Gaussian elimination with partial pivoting.
export function solve(A, b, n) {
  const M = A.slice(), x = b.slice();
  for (let c = 0; c < n; c++) {
    let piv = c, best = Math.abs(M[c * n + c]);
    for (let r = c + 1; r < n; r++) { const v = Math.abs(M[r * n + c]); if (v > best) { best = v; piv = r; } }
    if (piv !== c) {
      for (let k = 0; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[piv * n + k]; M[piv * n + k] = t; }
      const t = x[c]; x[c] = x[piv]; x[piv] = t;
    }
    const d = M[c * n + c] || 1e-300;
    for (let r = c + 1; r < n; r++) {
      const f = M[r * n + c] / d;
      if (f === 0) continue;
      for (let k = c; k < n; k++) M[r * n + k] -= f * M[c * n + k];
      x[r] -= f * x[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r];
    for (let k = r + 1; k < n; k++) s -= M[r * n + k] * x[k];
    x[r] = s / (M[r * n + r] || 1e-300);
  }
  return x;
}
export function det(A, n) {
  const M = A.slice(); let d = 1;
  for (let c = 0; c < n; c++) {
    let piv = c, best = Math.abs(M[c * n + c]);
    for (let r = c + 1; r < n; r++) { const v = Math.abs(M[r * n + c]); if (v > best) { best = v; piv = r; } }
    if (best < 1e-300) return 0;
    if (piv !== c) { for (let k = 0; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[piv * n + k]; M[piv * n + k] = t; } d = -d; }
    d *= M[c * n + c];
    for (let r = c + 1; r < n; r++) { const f = M[r * n + c] / M[c * n + c]; for (let k = c; k < n; k++) M[r * n + k] -= f * M[c * n + k]; }
  }
  return d;
}

// ---------- forward kinematics ----------
// Returns world frames of every joint (after its rotation), plus the tool pose.
// points: [base, j1, j2(shoulder), j3(elbow), j4, j5(wrist centre), j6, tool tip]
export function fk(q, arm = ARM) {
  let R = I3, p = [0, 0, 0];
  const frames = [], points = [[0, 0, 0]], axes = [];
  for (let i = 0; i < arm.joints.length; i++) {
    const J = arm.joints[i];
    p = v3.add(p, matVec3(R, J.offset));
    axes.push(matVec3(R, J.axis));
    R = matMul3(R, rotAxis(J.axis, q[i]));
    frames.push({ R, p });
    points.push(p);
  }
  const tip = v3.add(p, matVec3(R, arm.tool));
  points.push(tip);
  return { frames, points, axes, tool: { R, p: tip } };
}

// Geometric Jacobian (6 x n, rows: vx vy vz wx wy wz), row-major.
export function jacobian(q, arm = ARM, F = fk(q, arm)) {
  const n = arm.joints.length, J = new Array(6 * n), pe = F.tool.p;
  for (let i = 0; i < n; i++) {
    const w = F.axes[i], o = F.points[i + 1];
    const v = v3.cross(w, v3.sub(pe, o));
    J[i] = v[0]; J[n + i] = v[1]; J[2 * n + i] = v[2];
    J[3 * n + i] = w[0]; J[4 * n + i] = w[1]; J[5 * n + i] = w[2];
  }
  return J;
}

// J J^T restricted to the rows in use (6 for full pose, 3 for position only).
function JJt(J, n, m, wRot) {
  const A = new Array(m * m).fill(0);
  for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += J[a * n + k] * J[b * n + k];
    A[a * m + b] = s;
  }
  return A;
}
// Weighted Jacobian: orientation rows scaled by a characteristic length so mm and rad are comparable.
const LCHAR = 0.3;
function weighted(J, n, m) {
  const W = J.slice(0, m * n);
  if (m === 6) for (let r = 3; r < 6; r++) for (let k = 0; k < n; k++) W[r * n + k] *= LCHAR;
  return W;
}

// Yoshikawa manipulability w = sqrt(det(J J^T)) on the position+weighted-orientation Jacobian.
export function manipulability(q, arm = ARM) {
  const n = arm.joints.length, J = weighted(jacobian(q, arm), n, 6);
  return Math.sqrt(Math.max(0, det(JJt(J, n, 6), 6)));
}

export function poseError(cur, target, mode6) {
  const ep = v3.sub(target.p, cur.p);
  if (!mode6) return ep;
  const eo = logR(matMul3(target.R, transpose3(cur.R)));
  return [ep[0], ep[1], ep[2], eo[0] * LCHAR, eo[1] * LCHAR, eo[2] * LCHAR];
}

export function clampLimits(q, arm = ARM) {
  return q.map((v, i) => Math.min(arm.joints[i].max, Math.max(arm.joints[i].min, v)));
}

// ---------- inverse kinematics ----------
// method: 'dls' (damped least squares with Nakamura-Hanafusa adaptive damping) or 'jt' (Jacobian transpose, Buss step).
// Returns { q, ok, iters, errPos (m), errRot (rad) }.
export function ik(target, seed, opt = {}) {
  const arm = opt.arm || ARM, n = arm.joints.length;
  const method = opt.method || 'dls', mode6 = opt.mode6 !== false, m = mode6 ? 6 : 3;
  const maxIter = opt.maxIter || (method === 'jt' ? 2000 : 100);
  const tolP = opt.tolP ?? 1e-5, tolR = opt.tolR ?? 1e-4;
  let q = clampLimits(seed.slice(), arm);
  let F = fk(q, arm), e = poseError(F.tool, target, mode6), iters = 0;
  const errs = () => {
    const ep = v3.norm([e[0], e[1], e[2]]);
    const er = mode6 ? v3.norm([e[3], e[4], e[5]]) / LCHAR : 0;
    return [ep, er];
  };
  let [ep, er] = errs();
  while (iters < maxIter && (ep > tolP || er > tolR)) {
    iters++;
    const J = weighted(jacobian(q, arm, F), n, m);
    let dq;
    if (method === 'jt') {
      // dq = alpha J^T e,  alpha = <e, JJ^T e> / <JJ^T e, JJ^T e>
      const Jte = new Array(n).fill(0);
      for (let k = 0; k < n; k++) for (let r = 0; r < m; r++) Jte[k] += J[r * n + k] * e[r];
      const JJte = new Array(m).fill(0);
      for (let r = 0; r < m; r++) for (let k = 0; k < n; k++) JJte[r] += J[r * n + k] * Jte[k];
      let num = 0, den = 0;
      for (let r = 0; r < m; r++) { num += e[r] * JJte[r]; den += JJte[r] * JJte[r]; }
      const alpha = den > 0 ? num / den : 0;
      dq = Jte.map((v) => v * alpha);
    } else {
      // Levenberg-Marquardt form of damped least squares (Sugihara 2011):
      // dq = (J^T J + lambda^2 I)^-1 J^T e,  lambda^2 = 1/2 e^T e + bias.
      // Damping grows with the error (robust far from the goal, at singularities)
      // and vanishes at the solution (quadratic convergence at the end).
      const E = 0.5 * e.reduce((s, v) => s + v * v, 0);
      const l2 = (opt.damping ?? 1) * E + (opt.bias ?? 1e-6);
      const H = new Array(n * n).fill(0), g = new Array(n).fill(0);
      for (let a = 0; a < n; a++) {
        for (let r = 0; r < m; r++) g[a] += J[r * n + a] * e[r];
        for (let b = a; b < n; b++) { let s = 0; for (let r = 0; r < m; r++) s += J[r * n + a] * J[r * n + b]; H[a * n + b] = H[b * n + a] = s; }
        H[a * n + a] += l2;
      }
      dq = solve(H, g, n);
    }
    // limit the step so a far target is approached smoothly
    const big = Math.max(...dq.map(Math.abs));
    const cap = opt.maxStep || 0.25;
    if (big > cap) dq = dq.map((v) => (v * cap) / big);
    q = clampLimits(q.map((v, i) => v + dq[i]), arm);
    F = fk(q, arm); e = poseError(F.tool, target, mode6); [ep, er] = errs();
  }
  return { q, ok: ep <= tolP && er <= tolR, iters, errPos: ep, errRot: er };
}

// IK with random restarts when the seed lands in a joint-limit trap or a local minimum.
export function ikRestarts(target, seed, opt = {}) {
  const arm = opt.arm || ARM, rng = opt.rng || Math.random, tries = opt.restarts ?? 30;
  let best = ik(target, seed, opt), total = best.iters, attempt = 0;
  while (!best.ok && attempt < tries) {
    attempt++;
    const s = arm.joints.map((J) => J.min + (J.max - J.min) * rng());
    const r = ik(target, s, opt);
    total += r.iters;
    if (r.ok || r.errPos < best.errPos) best = r;
  }
  return { ...best, totalIters: total, restarts: attempt };
}

// Seeded PRNG so plans and tests are reproducible.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
