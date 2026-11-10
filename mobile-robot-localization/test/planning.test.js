import test from 'node:test';
import assert from 'node:assert/strict';
import { astar, dijkstra, planOnGrid } from '../src/astar.js';
import { Grid, makeWarehouse } from '../src/grid.js';
import { makeRng } from '../src/rng.js';

function randomMap(rng, w, h, density) {
  const b = new Uint8Array(w * h);
  for (let k = 0; k < b.length; k++) b[k] = rng.next() < density ? 1 : 0;
  return b;
}
function freeCell(rng, b, w, h) {
  for (;;) { const i = Math.floor(rng.next() * w), j = Math.floor(rng.next() * h); if (!b[j * w + i]) return [i, j]; }
}
function checkPath(path, b, w) {
  for (let k = 1; k < path.length; k++) {
    const [i0, j0] = path[k - 1], [i1, j1] = path[k], di = i1 - i0, dj = j1 - j0;
    assert.ok(Math.abs(di) <= 1 && Math.abs(dj) <= 1 && (di || dj), 'steps are 8-neighbour moves');
    assert.equal(b[j1 * w + i1], 0, 'path cell is free');
    if (di && dj) assert.ok(!b[j0 * w + i1] && !b[j1 * w + i0], 'no corner cutting');
  }
}

test('A* returns the same optimal cost as Dijkstra on 300 random maps, expanding fewer cells', () => {
  const rng = makeRng(2026), W = 80, H = 50;
  let solved = 0, unreachable = 0, expA = 0, expD = 0, worst = 0;
  for (let n = 0; n < 300; n++) {
    const b = randomMap(rng, W, H, 0.18 + 0.14 * rng.next());
    const s = freeCell(rng, b, W, H), g = freeCell(rng, b, W, H);
    const a = astar(b, W, H, s, g), d = dijkstra(b, W, H, s, g);
    if (!d.path) { assert.equal(a.path, null, 'A* agrees the goal is unreachable'); unreachable++; continue; }
    assert.ok(a.path, 'A* finds a path whenever Dijkstra does');
    worst = Math.max(worst, Math.abs(a.cost - d.cost));
    assert.ok(Math.abs(a.cost - d.cost) < 1e-9, `cost ${a.cost} vs ${d.cost}`);
    assert.ok(a.expanded <= d.expanded);
    checkPath(a.path, b, W);
    solved++; expA += a.expanded; expD += d.expanded;
  }
  console.log(`  A* vs Dijkstra: ${solved} solved + ${unreachable} unreachable, max cost gap ${worst.toExponential(1)}, A* expands ${(100 * expA / expD).toFixed(1)}% of Dijkstra's cells`);
  assert.ok(solved > 150);
});

test('planning on the warehouse keeps the inflation clearance', () => {
  const g = makeWarehouse(), r = planOnGrid(g, [3, 1.5], [13.9, 9.5], 0.35);
  assert.ok(r.world && r.world.length > 10);
  const minClear = Math.min(...r.world.slice(3).map(([x, y]) => g.distAt(x, y)));
  assert.ok(minClear >= 0.35 - 1e-6, `clearance ${minClear}`);
  console.log(`  warehouse plan: ${r.lengthM.toFixed(2)} m, ${r.expanded} cells, ${r.ms.toFixed(1)} ms, min clearance ${minClear.toFixed(2)} m`);
});

test('raycast matches fine-step marching; distance field matches brute force', () => {
  const g = new Grid(6, 4, 0.1), rng = makeRng(5);
  g.setRect(0, 0, 6, 0.1); g.setRect(0, 3.9, 6, 4); g.setRect(0, 0, 0.1, 4); g.setRect(5.9, 0, 6, 4);
  g.setRect(2, 1, 2.5, 3); g.setRect(4, 0.5, 4.3, 1.2);
  for (let n = 0; n < 500; n++) {
    let x, y; do { x = rng.uniform(0.2, 5.8); y = rng.uniform(0.2, 3.8); } while (g.occAt(x, y));
    const th = rng.uniform(-Math.PI, Math.PI), r = g.raycast(x, y, th, 8);
    let s = 0; while (!g.occAt(x + s * Math.cos(th), y + s * Math.sin(th))) s += 0.0005;
    assert.ok(Math.abs(r - s) < 0.002, `ray ${r} vs ${s}`);
  }
  const d = g.distanceField();
  for (let n = 0; n < 300; n++) {
    const i = Math.floor(rng.next() * g.w), j = Math.floor(rng.next() * g.h);
    let best = Infinity;
    for (let jj = 0; jj < g.h; jj++) for (let ii = 0; ii < g.w; ii++) if (g.occ[g.idx(ii, jj)]) best = Math.min(best, Math.hypot(ii - i, jj - j));
    assert.ok(Math.abs(d[g.idx(i, j)] - best * g.res) < 1e-6);
  }
});
