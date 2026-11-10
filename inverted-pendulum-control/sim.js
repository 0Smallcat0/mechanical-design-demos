// Cart-pole simulator, a line-for-line port of core.py (cad-demo/pendulum). th = 0 upright.
(function () {
  const D = window.PEND;
  const DT = D.DT, SUB = D.SUB, TH_CATCH = D.TH_CATCH, TH_FALL = D.TH_FALL;
  const TAU = 2 * Math.PI;
  const wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

  function deriv(s, F, Fd, p) {
    const [x, xd, th, thd] = s;
    const M = p.M, m = p.m, l = p.l, g = p.g;
    const J = m * (2 * l) * (2 * l) / 12.0;
    const st = Math.sin(th), ct = Math.cos(th);
    const a11 = M + m, a12 = m * l * ct, a22 = J + m * l * l;
    const r1 = F - p.b * xd + Fd + m * l * st * thd * thd;
    const r2 = -p.c * thd + 2 * l * ct * Fd + m * g * l * st;
    const det = a11 * a22 - a12 * a12;
    return [xd, (r1 * a22 - a12 * r2) / det, thd, (a11 * r2 - a12 * r1) / det];
  }
  function rk4(s, F, Fd, p, h) {
    const k1 = deriv(s, F, Fd, p);
    const k2 = deriv(s.map((v, i) => v + 0.5 * h * k1[i]), F, Fd, p);
    const k3 = deriv(s.map((v, i) => v + 0.5 * h * k2[i]), F, Fd, p);
    const k4 = deriv(s.map((v, i) => v + h * k3[i]), F, Fd, p);
    return s.map((v, i) => v + h / 6.0 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  class Rng {
    constructor(seed) { this.a = seed >>> 0; }
    uni() {
      this.a = (this.a + 0x6D2B79F5) >>> 0;
      let t = this.a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    gauss() { const u1 = 1.0 - this.uni(), u2 = this.uni(); return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(TAU * u2); }
  }
  const ctrls = {
    pid(y, mem, g) {
      mem.I = Math.max(-0.5, Math.min(0.5, mem.I + y[2] * DT));
      return g.Kp * y[2] + g.Ki * mem.I + g.Kd * y[3] + g.Kx * y[0] + g.Kv * y[1];
    },
    lqr(y, mem, K) { return -(K[0] * y[0] + K[1] * y[1] + K[2] * y[2] + K[3] * y[3]); },
    rl(y, mem, W) {
      const o = [y[0] / 1.2, y[1] / 2.0, y[2] / 0.5, y[3] / 3.0];
      let z = W.b2;
      for (let j = 0; j < W.b1.length; j++) {
        let a = W.b1[j];
        for (let i = 0; i < 4; i++) a += W.W1[j][i] * o[i];
        z += W.W2[j] * Math.tanh(a);
      }
      return 15.0 * Math.tanh(z);
    },
  };
  function swingup(y, p) {
    const [x, xd, th, thd] = y;
    const m = p.m, l = p.l, g = p.g;
    const Jp = m * (2 * l) * (2 * l) / 12.0 + m * l * l;
    const En = (0.5 * Jp * thd * thd + m * g * l * (Math.cos(th) - 1.0)) / (m * g * l);
    const q = thd * Math.cos(th);
    const sg = q > 0 ? 1.0 : (q < 0 ? -1.0 : 0.0);
    let a = Math.max(-6.0, Math.min(6.0, 100.0 * En * sg)) - 1.0 * x - 1.0 * xd;
    if (Math.abs(thd) < 0.05 && En < -1.9) a = 2.0;
    return (p.M + p.m) * a;
  }

  // One closed loop that can be stepped (live page) or run to the end (checks, sweep).
  class Loop {
    constructor(kind, gains, p, s0, opt = {}) {
      this.kind = kind; this.gains = gains; this.p = p; this.s = s0.slice();
      this.noise = opt.noise || 0; this.rng = new Rng(opt.seed == null ? 1 : opt.seed);
      this.sat = opt.sat !== false; this.rails = opt.rails || 'fail'; this.design = opt.design || D.P;
      this.pushes = opt.pushes || []; this.mem = { I: 0 }; this.k = 0;
      this.mxp = this.s[0]; this.mthp = this.s[2]; this.vx = this.s[1]; this.vth = this.s[3];
      this.mode = Math.abs(wrap(this.s[2])) < TH_CATCH ? 'bal' : 'swing';
      this.failed = false; this.F = 0; this.sumth2 = 0; this.effort = 0; this.hitRail = false;
    }
    step() {
      if (this.failed) return false;
      const s = this.s, t = this.k * DT;
      const mx = s[0] + 0.5 * this.noise * this.rng.gauss();
      const mth = wrap(s[2]) + this.noise * this.rng.gauss();
      if (this.k > 0) {
        this.vx = 0.5 * this.vx + 0.5 * (mx - this.mxp) / DT;
        this.vth = 0.5 * this.vth + 0.5 * wrap(mth - this.mthp) / DT;
      }
      this.mxp = mx; this.mthp = mth;
      const y = [mx, this.vx, mth, this.vth];
      if (this.mode === 'bal' && Math.abs(mth) > TH_FALL) {
        this.mode = 'swing';
        if (this.rails === 'fail') { this.failed = true; return false; }
      }
      if (this.mode === 'swing' && Math.abs(mth) < TH_CATCH) { this.mode = 'bal'; this.mem.I = 0; }
      let F = this.mode === 'bal' ? ctrls[this.kind](y, this.mem, this.gains) : swingup(y, this.design);
      if (this.sat) F = Math.max(-this.p.Fmax, Math.min(this.p.Fmax, F));
      let Fd = 0;
      for (const [t0, d, f] of this.pushes) if (t0 <= t && t < t0 + d - 1e-9) Fd += f;
      this.F = F; this.Fd = Fd;
      const th = wrap(s[2]);
      this.sumth2 += th * th; this.effort += F * F * DT;
      const h = DT / SUB;
      let ns = s;
      for (let i = 0; i < SUB; i++) ns = rk4(ns, F, Fd, this.p, h);
      this.s = ns; this.k++;
      if (Math.abs(ns[0]) > this.p.xlim) {
        if (this.rails === 'fail') { this.failed = true; return false; }
        ns[0] = Math.sign(ns[0]) * this.p.xlim; ns[1] = 0; this.hitRail = true;
      }
      return true;
    }
    get rmsDeg() { return Math.sqrt(this.sumth2 / Math.max(1, this.k)) * 180 / Math.PI; }
  }

  // Discrete LQR by iterating the Riccati recursion on the exported (Ad, Bd): checks scipy's gain in the browser.
  function dlqr(Ad, Bd, Qd, R) {
    const n = 4;
    const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
    const T = (A) => A[0].map((_, j) => A.map((r) => r[j]));
    const B = Bd.map((v) => [v]);
    let X = Qd.map((q, i) => Array.from({ length: n }, (_, j) => (i === j ? q : 0)));
    let K = [[0, 0, 0, 0]];
    for (let it = 0; it < 5000; it++) {
      const BtX = mul(T(B), X);
      const s = R + mul(BtX, B)[0][0];
      K = mul(BtX, Ad).map((r) => r.map((v) => v / s));
      const AmBK = Ad.map((r, i) => r.map((v, j) => v - B[i][0] * K[0][j]));
      const Xn = mul(mul(T(Ad), X), AmBK).map((r, i) => r.map((v, j) => v + (i === j ? Qd[i] : 0)));
      let d = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d = Math.max(d, Math.abs(Xn[i][j] - X[i][j]));
      X = Xn;
      if (d < 1e-10) break;
    }
    return K[0];
  }

  window.SIM = { deriv, rk4, Rng, wrap, swingup, ctrls, Loop, dlqr, DT };
})();
