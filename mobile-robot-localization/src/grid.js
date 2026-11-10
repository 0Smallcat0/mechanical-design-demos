// Occupancy grid in world metres. Cell (i, j): i = column (x), j = row (y), origin at the lower-left corner.
export class Grid {
  constructor(widthM, heightM, res = 0.1) {
    this.res = res;
    this.w = Math.round(widthM / res);
    this.h = Math.round(heightM / res);
    this.widthM = this.w * res;
    this.heightM = this.h * res;
    this.occ = new Uint8Array(this.w * this.h);
    this._dist = null;
  }
  idx(i, j) { return j * this.w + i; }
  inside(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h; }
  cellOf(x, y) { return [Math.floor(x / this.res), Math.floor(y / this.res)]; }
  centerOf(i, j) { return [(i + 0.5) * this.res, (j + 0.5) * this.res]; }
  isOcc(i, j) { return !this.inside(i, j) || this.occ[this.idx(i, j)] === 1; }
  occAt(x, y) { const [i, j] = this.cellOf(x, y); return this.isOcc(i, j); }
  setRect(x0, y0, x1, y1, v = 1) {
    const [i0, j0] = this.cellOf(Math.min(x0, x1) + 1e-9, Math.min(y0, y1) + 1e-9);
    const [i1, j1] = this.cellOf(Math.max(x0, x1) - 1e-9, Math.max(y0, y1) - 1e-9);
    for (let j = Math.max(0, j0); j <= Math.min(this.h - 1, j1); j++)
      for (let i = Math.max(0, i0); i <= Math.min(this.w - 1, i1); i++) this.occ[this.idx(i, j)] = v;
    this._dist = null;
  }
  clone() { const g = new Grid(this.widthM, this.heightM, this.res); g.occ.set(this.occ); return g; }

  // Exact grid traversal (Amanatides & Woo). Returns range to the first occupied cell, capped at maxRange.
  raycast(x, y, th, maxRange) {
    const res = this.res, dx = Math.cos(th), dy = Math.sin(th);
    let i = Math.floor(x / res), j = Math.floor(y / res);
    if (this.isOcc(i, j)) return 0;
    const si = dx > 0 ? 1 : -1, sj = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(res / dx) : Infinity, tdy = dy !== 0 ? Math.abs(res / dy) : Infinity;
    let tx = dx !== 0 ? ((dx > 0 ? (i + 1) * res - x : x - i * res) / Math.abs(dx)) : Infinity;
    let ty = dy !== 0 ? ((dy > 0 ? (j + 1) * res - y : y - j * res) / Math.abs(dy)) : Infinity;
    let t = 0;
    while (t < maxRange) {
      if (tx < ty) { t = tx; tx += tdx; i += si; } else { t = ty; ty += tdy; j += sj; }
      if (this.isOcc(i, j)) return Math.min(t, maxRange);
    }
    return maxRange;
  }

  // Euclidean distance (metres) from every cell centre to the nearest occupied cell (Felzenszwalb & Huttenlocher EDT).
  distanceField() {
    if (this._dist) return this._dist;
    const { w, h } = this, INF = 1e20, f = new Float64Array(w * h);
    for (let k = 0; k < w * h; k++) f[k] = this.occ[k] ? 0 : INF;
    const n = Math.max(w, h), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), col = new Float64Array(n);
    const edt1 = (len) => {
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      const sep = (p, q) => ((col[q] + q * q) - (col[p] + p * p)) / (2 * q - 2 * p);
      for (let q = 1; q < len; q++) {
        let s = sep(v[k], q);
        while (s <= z[k]) { k--; s = sep(v[k], q); }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + col[p]; }
    };
    for (let i = 0; i < w; i++) { for (let j = 0; j < h; j++) col[j] = f[j * w + i]; edt1(h); for (let j = 0; j < h; j++) f[j * w + i] = d[j]; }
    for (let j = 0; j < h; j++) { for (let i = 0; i < w; i++) col[i] = f[j * w + i]; edt1(w); for (let i = 0; i < w; i++) f[j * w + i] = d[i]; }
    const out = new Float32Array(w * h);
    for (let k = 0; k < w * h; k++) out[k] = Math.sqrt(f[k]) * this.res;
    this._dist = out;
    return out;
  }
  distAt(x, y) {
    const [i, j] = this.cellOf(x, y);
    if (!this.inside(i, j)) return 0;
    return this.distanceField()[this.idx(i, j)];
  }
  // Configuration-space grid for planning: blocked if closer than `radius` to any obstacle.
  inflate(radius) {
    const d = this.distanceField(), out = new Uint8Array(this.w * this.h);
    for (let k = 0; k < out.length; k++) out[k] = d[k] < radius ? 1 : 0;
    return out;
  }
}

// A 24 m × 14 m warehouse: racks of different lengths, a pallet zone, pillars and an office block,
// laid out asymmetrically so a 360° lidar can tell one aisle from another.
export function makeWarehouse(res = 0.1) {
  const g = new Grid(24, 14, res);
  const t = 0.2;
  g.setRect(0, 0, 24, t); g.setRect(0, 14 - t, 24, 14); g.setRect(0, 0, t, 14); g.setRect(24 - t, 0, 24, 14);
  // office block, top-left, with a door gap
  g.setRect(0, 10, 4.5, 10.2); g.setRect(4.3, 11.4, 4.5, 14);
  // rack rows (x0, y0, x1, y1)
  const racks = [
    [6, 2, 6.8, 9], [9, 2, 9.8, 11.5], [12, 4, 12.8, 11.5], [15, 2, 15.8, 8.5],
    [18, 6, 18.8, 12], [6, 11, 7.6, 11.8],
  ];
  for (const r of racks) g.setRect(...r);
  // pillars
  for (const [x, y] of [[2.5, 3], [2.5, 6.5], [21.5, 3.5], [12.4, 1.5]]) g.setRect(x - 0.2, y - 0.2, x + 0.2, y + 0.2);
  // pallet zone, right side
  for (const [x, y] of [[20.5, 9], [22, 9], [20.5, 10.6], [22.4, 12]]) g.setRect(x, y, x + 1.0, y + 1.0);
  // dock bumper bottom-right
  g.setRect(19, 0, 23, 0.6);
  return g;
}

export const STATIONS = {
  dock: [21.0, 1.6, Math.PI / 2],
  pickA: [7.9, 5.0, 0],
  pickB: [13.9, 9.5, 0],
  pickC: [17.0, 3.0, 0],
  office: [2.2, 8.6, 0],
};
