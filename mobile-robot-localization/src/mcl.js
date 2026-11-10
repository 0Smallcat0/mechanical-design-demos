// Monte Carlo localization (Thrun, Burgard & Fox, Probabilistic Robotics, ch. 5, 6, 8):
//  - odometry motion model with four noise parameters (sample_motion_model_odometry)
//  - likelihood-field beam model on a precomputed distance field
//  - low-variance (systematic) resampling, triggered when the effective sample size drops below N/2
//  - augmented MCL: injects uniform random particles when the short-term fit falls behind the long-term fit
//    (that is what recovers a kidnapped robot)
import { wrap } from './rng.js';

export class ParticleFilter {
  constructor(grid, rng, opts = {}) {
    this.grid = grid; this.rng = rng;
    this.Nglobal = opts.Nglobal ?? 5000; this.Ntrack = opts.Ntrack ?? 1000;
    this.N = this.Ntrack;
    this.alpha = opts.alpha ?? [0.05, 0.01, 0.05, 0.01];   // rot<-rot, rot<-trans, trans<-trans, trans<-rot
    this.sigmaHit = opts.sigmaHit ?? 0.15;                 // m, likelihood-field std
    this.zHit = opts.zHit ?? 0.9; this.zRand = opts.zRand ?? 0.1;
    this.maxRange = opts.maxRange ?? 15;
    this.beamStride = opts.beamStride ?? 1;
    this.temper = opts.temper ?? 0.5;                      // flattens the joint likelihood of correlated beams
    this.aSlow = opts.aSlow ?? 0.02; this.aFast = opts.aFast ?? 0.3;
    this.inject = opts.inject ?? true;
    this.x = new Float64Array(this.N); this.y = new Float64Array(this.N); this.th = new Float64Array(this.N);
    this.w = new Float64Array(this.N).fill(1 / this.N);
    this.wSlow = 0; this.wFast = 0;
    this.neff = this.N; this.lastInjected = 0; this.resampled = false;
    this._free = null;
  }
  freeCells() {
    if (this._free) return this._free;
    const d = this.grid.distanceField(), out = [];
    for (let k = 0; k < d.length; k++) if (d[k] > 0.25) out.push(k);
    return (this._free = out);
  }
  randomPose() {
    const g = this.grid, f = this.freeCells(), k = f[Math.floor(this.rng.next() * f.length)];
    const i = k % g.w, j = (k / g.w) | 0;
    return [(i + this.rng.next()) * g.res, (j + this.rng.next()) * g.res, this.rng.uniform(-Math.PI, Math.PI)];
  }
  // global search needs many particles; tracking needs few (a fixed-size stand-in for KLD sampling)
  initGlobal(n = this.Nglobal ?? 5000) {
    this.resize(n);
    for (let n = 0; n < this.N; n++) { const p = this.randomPose(); this.x[n] = p[0]; this.y[n] = p[1]; this.th[n] = p[2]; }
    this.w.fill(1 / this.N); this.wSlow = this.wFast = 0;
  }
  resize(n) {
    if (n === this.N) return;
    this.N = n; this.x = new Float64Array(n); this.y = new Float64Array(n); this.th = new Float64Array(n); this.w = new Float64Array(n).fill(1 / n);
  }
  initAt(pose, sxy = 0.3, sth = 0.2) {
    this.resize(this.Ntrack ?? 1000);
    for (let n = 0; n < this.N; n++) {
      this.x[n] = pose[0] + this.rng.gauss(sxy); this.y[n] = pose[1] + this.rng.gauss(sxy); this.th[n] = wrap(pose[2] + this.rng.gauss(sth));
    }
    this.w.fill(1 / this.N);
  }
  // odometry reading: previous and current odometry poses
  predict(o0, o1) {
    const dx = o1[0] - o0[0], dy = o1[1] - o0[1], trans = Math.hypot(dx, dy);
    const rot1 = trans < 1e-4 ? 0 : wrap(Math.atan2(dy, dx) - o0[2]);
    const rot2 = wrap(o1[2] - o0[2] - rot1);
    const [a1, a2, a3, a4] = this.alpha, g = this.rng.gauss;
    const sr1 = Math.sqrt(a1 * rot1 * rot1 + a2 * trans * trans), st = Math.sqrt(a3 * trans * trans + a4 * (rot1 * rot1 + rot2 * rot2));
    const sr2 = Math.sqrt(a1 * rot2 * rot2 + a2 * trans * trans);
    for (let n = 0; n < this.N; n++) {
      const r1 = rot1 - g(sr1 + 1e-3), tr = trans - g(st + 1e-3), r2 = rot2 - g(sr2 + 1e-3);
      const h = this.th[n] + r1;
      this.x[n] += tr * Math.cos(h); this.y[n] += tr * Math.sin(h); this.th[n] = wrap(h + r2);
    }
  }
  // scan: array of { a: beam angle in robot frame, r: measured range }
  update(scan) {
    const g = this.grid, d = g.distanceField(), N = this.N, inv2s2 = 1 / (2 * this.sigmaHit * this.sigmaHit);
    const zr = this.zRand / this.maxRange, logw = new Float64Array(N);
    const beams = scan.filter((b, k) => k % this.beamStride === 0 && b.r < this.maxRange - 1e-6);
    let avgLik = 0;
    for (let n = 0; n < N; n++) {
      const px = this.x[n], py = this.y[n], pth = this.th[n];
      const ci = Math.floor(px / g.res), cj = Math.floor(py / g.res);
      if (ci < 0 || cj < 0 || ci >= g.w || cj >= g.h || g.occ[cj * g.w + ci]) { logw[n] = -1e9; continue; }
      let s = 0;
      for (const b of beams) {
        const ex = px + b.r * Math.cos(pth + b.a), ey = py + b.r * Math.sin(pth + b.a);
        const i = Math.floor(ex / g.res), j = Math.floor(ey / g.res);
        const dist = (i < 0 || j < 0 || i >= g.w || j >= g.h) ? 2 : d[j * g.w + i];
        s += Math.log(this.zHit * Math.exp(-dist * dist * inv2s2) + zr);
      }
      const per = beams.length ? s / beams.length : 0;
      avgLik += Math.exp(per);
      logw[n] = this.temper * s;
    }
    avgLik /= N;
    let mx = -Infinity;
    for (let n = 0; n < N; n++) { logw[n] += Math.log(this.w[n] + 1e-300); if (logw[n] > mx) mx = logw[n]; }
    let sum = 0;
    for (let n = 0; n < N; n++) { this.w[n] = Math.exp(logw[n] - mx); sum += this.w[n]; }
    let s2 = 0;
    for (let n = 0; n < N; n++) { this.w[n] /= sum; s2 += this.w[n] * this.w[n]; }
    this.neff = 1 / s2;
    this.wSlow = this.wSlow ? this.wSlow + this.aSlow * (avgLik - this.wSlow) : avgLik;
    this.wFast = this.wFast ? this.wFast + this.aFast * (avgLik - this.wFast) : avgLik;
    this.fit = avgLik;
    this.resampled = false; this.lastInjected = 0;
    this.est = this.estimate();        // from the weights, before resampling (after it, injected particles count fully)
    if (this.neff < N / 2) { this.resample(); this.resampled = true; }
  }
  // systematic / low-variance resampling, plus augmented-MCL random injection
  resample(newN = this.N) {
    const N = this.N, M = newN, nx = new Float64Array(M), ny = new Float64Array(M), nt = new Float64Array(M);
    // inject only when the short-term fit falls clearly (>10 %) below the long-term fit
    const pInject = this.inject && this.wSlow > 0 ? Math.max(0, 0.9 - this.wFast / this.wSlow) : 0;
    const step = 1 / M; let r = this.rng.next() * step, c = this.w[0], i = 0, injected = 0;
    for (let m = 0; m < M; m++) {
      const u = r + m * step;
      while (u > c && i < N - 1) { i++; c += this.w[i]; }
      if (pInject > 0 && this.rng.next() < pInject) { const p = this.randomPose(); nx[m] = p[0]; ny[m] = p[1]; nt[m] = p[2]; injected++; }
      else { nx[m] = this.x[i]; ny[m] = this.y[i]; nt[m] = this.th[i]; }
    }
    this.x = nx; this.y = ny; this.th = nt; this.N = M; this.w = new Float64Array(M).fill(1 / M);
    this.lastInjected = injected;
  }
  // mean per-beam likelihood of the scan at one pose: the robot's own "does the map agree?" score (0..1)
  scanScore(pose, scan, sigma = 0.15) {
    const g = this.grid, d = g.distanceField(), inv2s2 = 1 / (2 * sigma * sigma);
    let s = 0, n = 0;
    for (const b of scan) {
      if (b.r >= this.maxRange - 1e-6) continue;
      const ex = pose[0] + b.r * Math.cos(pose[2] + b.a), ey = pose[1] + b.r * Math.sin(pose[2] + b.a);
      const i = Math.floor(ex / g.res), j = Math.floor(ey / g.res);
      const dist = (i < 0 || j < 0 || i >= g.w || j >= g.h) ? 2 : d[j * g.w + i];
      s += Math.exp(-dist * dist * inv2s2); n++;
    }
    return n ? s / n : 0;
  }
  // weighted mean (circular mean for heading) and position spread
  estimate() {
    let mx = 0, my = 0, c = 0, s = 0;
    for (let n = 0; n < this.N; n++) { const w = this.w[n]; mx += w * this.x[n]; my += w * this.y[n]; c += w * Math.cos(this.th[n]); s += w * Math.sin(this.th[n]); }
    let v = 0;
    for (let n = 0; n < this.N; n++) { const dx = this.x[n] - mx, dy = this.y[n] - my; v += this.w[n] * (dx * dx + dy * dy); }
    return { x: mx, y: my, th: Math.atan2(s, c), spread: Math.sqrt(v) };
  }
}
