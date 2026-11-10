// node test/bench.js  ->  results.json (the numbers quoted on the project page)
import fs from 'node:fs';
import { World } from '../src/sim.js';
import { astar, dijkstra, planOnGrid } from '../src/astar.js';
import { makeWarehouse, STATIONS } from '../src/grid.js';
import { makeRng } from '../src/rng.js';

const SEEDS = +(process.argv[2] || 20);
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const r2 = v => Math.round(v * 100) / 100;

// 1. global localization from no initial guess, then a delivery run
const glob = [], track = [], drEnd = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const w = new World({ seed });
  for (let k = 0; k < 90 * 30; k++) { w.tick(); if (w.mode === 'idle' && !w.goal) w.setGoal(STATIONS.pickB.slice(0, 2)); }
  const h = w.history, ok = h.at(-1).err < 0.1 && w.lastConvergence != null;
  glob.push({ seed, ok, conv: w.lastConvergence });
  if (ok) { const after = h.filter(s => s.t > w.convergedAt + 1); track.push(...after.map(s => s.err)); }
}
// 2. tracking from a rough guess while delivering dock -> pick B -> dock, dead reckoning alongside
for (let seed = 1; seed <= SEEDS; seed++) {
  const w = new World({ seed: 100 + seed, global: false, start: [3.0, 1.5, 0.3] });
  w.pf.initAt([3.4, 1.7, 0.5], 0.3, 0.2); w.mode = 'idle';
  const goals = [STATIONS.pickB, STATIONS.pickC, STATIONS.dock].map(g => g.slice(0, 2)); let gi = 0;
  w.setGoal(goals[gi]);
  for (let k = 0; k < 120 * 30; k++) { w.tick(); if (w.mode === 'idle' && gi < goals.length - 1) w.setGoal(goals[++gi]); }
  drEnd.push(w.history.at(-1).dr);
}
// 3. kidnapped robot
const kid = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const w = new World({ seed: 200 + seed, global: false, start: [3.0, 1.5, 0.3] }); w.mode = 'idle'; w.setGoal(STATIONS.pickB.slice(0, 2));
  for (let k = 0; k < 15 * 30; k++) w.tick();
  w.kidnap(); const t0 = w.t, k0 = w.history.length;
  for (let k = 0; k < 90 * 30; k++) w.tick();
  const h = w.history.slice(k0), noticed = w.events.find(e => e.t >= t0 && e.msg.startsWith('Scan no longer fits'));
  const ok = h.at(-1).err < 0.1 && w.convergedAt != null;
  kid.push({ seed, ok, noticed: noticed ? noticed.t - t0 : null, recovered: ok ? w.convergedAt - t0 : null });
}
// 4. A* vs Dijkstra on the warehouse, all station pairs
const g = makeWarehouse(), names = Object.keys(STATIONS), plans = [];
const blocked = g.inflate(0.35);
for (const a of names) for (const b of names) if (a < b) {
  const s = g.cellOf(...STATIONS[a]), e = g.cellOf(...STATIONS[b]);
  const A = astar(blocked, g.w, g.h, s, e), D = dijkstra(blocked, g.w, g.h, s, e);
  plans.push({ from: a, to: b, lengthM: r2(A.cost * g.res), sameCost: Math.abs(A.cost - D.cost) < 1e-9, aExpanded: A.expanded, dExpanded: D.expanded, aMs: r2(A.ms), dMs: r2(D.ms) });
}
const okG = glob.filter(x => x.ok), okK = kid.filter(x => x.ok);
const out = {
  generated: new Date().toISOString(), seeds: SEEDS,
  globalLocalization: { success: `${okG.length}/${SEEDS}`, medianSeconds: r2(pct(okG.map(x => x.conv), 0.5)), p90Seconds: r2(pct(okG.map(x => x.conv), 0.9)), criterion: 'error < 10 cm held for 1 s, still < 10 cm after 90 s', runs: glob },
  tracking: { meanErrorCm: r2(100 * track.reduce((a, b) => a + b, 0) / track.length), p95ErrorCm: r2(100 * pct(track, 0.95)), samples: track.length },
  deadReckoning: { medianEndErrorM: r2(pct(drEnd, 0.5)), note: 'same runs, wheel odometry only, given the true start pose; 3 deliveries, 120 s' },
  kidnapped: { recovered: `${okK.length}/${SEEDS}`, medianNoticeSeconds: r2(pct(kid.filter(x => x.noticed != null).map(x => x.noticed), 0.5)), medianRecoverSeconds: r2(pct(okK.map(x => x.recovered), 0.5)), runs: kid },
  planning: { pairs: plans.length, allOptimal: plans.every(p => p.sameCost), medianExpandedRatio: r2(pct(plans.map(p => p.aExpanded / p.dExpanded), 0.5)), medianAStarMs: r2(pct(plans.map(p => p.aMs), 0.5)), plans },
};
fs.writeFileSync(new URL('../results.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ global: out.globalLocalization.success, gMed: out.globalLocalization.medianSeconds, gP90: out.globalLocalization.p90Seconds, track: out.tracking.meanErrorCm, p95: out.tracking.p95ErrorCm, dr: out.deadReckoning.medianEndErrorM, kid: out.kidnapped.recovered, kNotice: out.kidnapped.medianNoticeSeconds, kRec: out.kidnapped.medianRecoverSeconds, plan: out.planning.allOptimal, ratio: out.planning.medianExpandedRatio, ms: out.planning.medianAStarMs }));
