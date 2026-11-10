// A* on an 8-connected grid with an octile heuristic (admissible and consistent, so the path is optimal).
// No corner cutting: a diagonal move needs both side cells free. heuristicWeight = 0 gives Dijkstra.
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let n = k.length; k.push(key); v.push(val);
    while (n > 0) { const p = (n - 1) >> 1; if (k[p] <= key) break; k[n] = k[p]; v[n] = v[p]; n = p; }
    k[n] = key; v[n] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), len = k.length;
    if (len) {
      let n = 0;
      while (true) {
        let c = 2 * n + 1; if (c >= len) break;
        if (c + 1 < len && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[n] = k[c]; v[n] = v[c]; n = c;
      }
      k[n] = lk; v[n] = lv;
    }
    return top;
  }
}

const SQ2 = Math.SQRT2;
const MOVES = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

export function astar(blocked, w, h, start, goal, heuristicWeight = 1) {
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const [si, sj] = start, [gi, gj] = goal;
  const N = w * h, g = new Float64Array(N).fill(Infinity), parent = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const free = (i, j) => i >= 0 && j >= 0 && i < w && j < h && !blocked[j * w + i];
  if (!free(gi, gj)) return null;
  const hfun = (i, j) => { const dx = Math.abs(i - gi), dy = Math.abs(j - gj); return heuristicWeight * (Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy)); };
  const s = sj * w + si, goalIdx = gj * w + gi, open = new Heap();
  g[s] = 0; open.push(hfun(si, sj), s);
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1; expanded++;
    if (cur === goalIdx) break;
    const ci = cur % w, cj = (cur / w) | 0, gc = g[cur];
    for (const [di, dj, c] of MOVES) {
      const ni = ci + di, nj = cj + dj;
      if (!free(ni, nj)) continue;
      if (di && dj && (!free(ci + di, cj) || !free(ci, cj + dj))) continue;
      const n = nj * w + ni, ng = gc + c;
      if (ng < g[n]) { g[n] = ng; parent[n] = cur; open.push(ng + hfun(ni, nj), n); }
    }
  }
  const ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
  if (!isFinite(g[goalIdx])) return { path: null, cost: Infinity, expanded, ms };
  const path = [];
  for (let n = goalIdx; n !== -1; n = parent[n]) path.push([n % w, (n / w) | 0]);
  path.reverse();
  return { path, cost: g[goalIdx], expanded, ms };
}

export const dijkstra = (blocked, w, h, start, goal) => astar(blocked, w, h, start, goal, 0);

// Plan in world metres on a Grid with an inflation radius. The start cell may sit inside the inflated band
// (e.g. right after the robot is moved), so the start is cleared before searching.
export function planOnGrid(grid, from, to, inflation) {
  const blocked = grid.inflate(inflation);
  const s = grid.cellOf(from[0], from[1]), gl = grid.cellOf(to[0], to[1]);
  const clearR = Math.ceil(inflation / grid.res);
  for (let dj = -clearR; dj <= clearR; dj++) for (let di = -clearR; di <= clearR; di++) {
    const i = s[0] + di, j = s[1] + dj;
    if (grid.inside(i, j) && !grid.isOcc(i, j) && di * di + dj * dj <= clearR * clearR) blocked[j * grid.w + i] = 0;
  }
  const r = astar(blocked, grid.w, grid.h, s, gl);
  if (!r || !r.path) return r ? { ...r, world: null, lengthM: Infinity } : { path: null, world: null, lengthM: Infinity, expanded: 0, ms: 0 };
  const world = r.path.map(([i, j]) => grid.centerOf(i, j));
  return { ...r, world, lengthM: r.cost * grid.res, blocked };
}
