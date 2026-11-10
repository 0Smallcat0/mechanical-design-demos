// node tests/test.mjs  — kinematics round trip, Jacobian check, planner collision-freeness.
import { ARM, HOME, fk, ik, ikRestarts, jacobian, manipulability, mulberry32, v3 } from '../js/kin.js';
import { makeWorld, collides, edgeFree, rrtConnect, shortcut, timeScale, sample, pathLength } from '../js/plan.js';
import { SCENE } from '../js/scene.js';

let fails = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!ok) fails++; };
const rng = mulberry32(2026);
const randQ = () => ARM.joints.map((J) => J.min + (J.max - J.min) * rng());

// 1. Jacobian vs finite differences
{
  let worst = 0;
  for (let k = 0; k < 200; k++) {
    const q = randQ(), J = jacobian(q), p0 = fk(q).tool.p, h = 1e-6;
    for (let i = 0; i < 6; i++) {
      const q2 = q.slice(); q2[i] += h;
      const dp = v3.scale(v3.sub(fk(q2).tool.p, p0), 1 / h);
      for (let r = 0; r < 3; r++) worst = Math.max(worst, Math.abs(dp[r] - J[r * 6 + i]));
    }
  }
  check('Jacobian matches finite differences (200 configs)', worst < 1e-4, `max |error| ${worst.toExponential(2)}`);
}

// 2. FK -> IK round trip on 1000 random reachable poses (pose produced by FK of a random config)
{
  const N = 1000; let ok = 0, worstP = 0, worstR = 0, iters = [], restarts = 0, fromHome = 0;
  for (let k = 0; k < N; k++) {
    const target = fk(randQ()).tool;
    const r = ikRestarts(target, HOME, { method: 'dls', rng });
    if (r.restarts === 0 && r.ok) fromHome++;
    if (r.ok) ok++;
    worstP = Math.max(worstP, r.errPos); worstR = Math.max(worstR, r.errRot);
    iters.push(r.totalIters); restarts += r.restarts;
    // re-verify independently with FK
    const back = fk(r.q).tool.p;
    worstP = Math.max(worstP, v3.norm(v3.sub(back, target.p)));
  }
  iters.sort((a, b) => a - b);
  check(`DLS IK round trip error < 0.1 mm on ${N} random poses`, ok === N && worstP < 1e-4,
    `${ok}/${N} solved, worst pos ${(worstP * 1000).toFixed(4)} mm, worst rot ${(worstR * 180 / Math.PI).toFixed(4)}°, ` +
    `median ${iters[N >> 1]} iters, p95 ${iters[Math.floor(N * 0.95)]}, solved from HOME without restart ${fromHome}/${N}, restarts total ${restarts}`);
}

// 3. Local tracking: DLS vs Jacobian transpose from a nearby seed (what the live drag does)
{
  const N = 300; const st = { dls: [0, 0], jt: [0, 0] };
  for (let k = 0; k < N; k++) {
    const q = randQ(), target = fk(q).tool, seed = q.map((v) => v + (rng() - 0.5) * 0.3);
    for (const m of ['dls', 'jt']) { const r = ik(target, seed, { method: m }); if (r.ok) { st[m][0]++; st[m][1] += r.iters; } }
  }
  const avg = (m) => (st[m][1] / Math.max(1, st[m][0])).toFixed(1);
  check('DLS converges locally more often than Jacobian transpose', st.dls[0] >= st.jt[0],
    `DLS ${st.dls[0]}/${N} (avg ${avg('dls')} iters) vs JT ${st.jt[0]}/${N} (avg ${avg('jt')} iters), seed ±0.15 rad`);
}

// 4. Singularity: fully stretched arm has ~zero manipulability, home does not
{
  const wS = manipulability([0, 0, 0, 0, 0, 0]), wH = manipulability(HOME);
  check('manipulability ~0 at the stretched singularity, >0 at home', wS < 1e-9 && wH > 1e-5, `w(stretched)=${wS.toExponential(2)}, w(home)=${wH.toExponential(3)}`);
}

// 5. Planner: RRT-Connect + shortcut through the demo scene, then densely re-check the timed trajectory
{
  const world = makeWorld(SCENE.obstacles);
  const startR = ikRestarts(SCENE.poseA, HOME, { rng: mulberry32(3) });
  const goalR = ikRestarts(SCENE.poseB, startR.q, { rng: mulberry32(4) });
  check('IK finds start and goal configurations', startR.ok && goalR.ok && !collides(startR.q, world) && !collides(goalR.q, world));
  let allOk = true, stats = [];
  for (let seed = 1; seed <= 20; seed++) {
    const r = rrtConnect(startR.q, goalR.q, world, { seed });
    if (!r.ok) { allOk = false; stats.push(`seed ${seed}: ${r.reason}`); continue; }
    const sc = shortcut(r.path, world, { seed });
    let free = sc.every((q, i) => !collides(q, world) && (i === 0 || edgeFree(sc[i - 1], q, world, 0.005)));
    const tr = timeScale(sc);
    for (let t = 0; t <= tr.duration; t += 0.005) if (collides(sample(tr, t).q, world)) { free = false; break; }
    if (!free) allOk = false;
    stats.push({ ms: r.ms, nodes: r.nodes, raw: pathLength(r.path), short: pathLength(sc), wp: sc.length, T: tr.duration });
  }
  const good = stats.filter((s) => typeof s === 'object');
  const mean = (f) => (good.reduce((a, s) => a + f(s), 0) / good.length);
  check('RRT-Connect + shortcut paths are collision-free (20 seeds, edges at 0.005 rad, trajectory every 5 ms)', allOk && good.length === 20,
    `mean ${mean((s) => s.ms).toFixed(1)} ms, ${mean((s) => s.nodes).toFixed(0)} nodes, path ${mean((s) => s.raw).toFixed(2)} → ${mean((s) => s.short).toFixed(2)} rad after shortcut, ${mean((s) => s.wp).toFixed(1)} waypoints, ${mean((s) => s.T).toFixed(2)} s`);
  // the straight joint-space line must actually be blocked, otherwise the test proves nothing
  check('the direct joint-space line between start and goal is blocked by the wall', !edgeFree(startR.q, goalR.q, world));
}

// 6. Time scaling respects velocity and acceleration limits, and ends at rest
{
  const path = [HOME, [1, -0.3, 1.2, 0.5, 0.4, -1], [-1.2, 0.2, 0.6, -0.4, 1.0, 1.5]];
  for (const profile of ['quintic', 'trapezoid']) {
    const tr = timeScale(path, { profile }); let vr = 0, ar = 0;
    for (let t = 0; t <= tr.duration; t += 0.001) {
      const s = sample(tr, t);
      s.qd.forEach((v, i) => (vr = Math.max(vr, Math.abs(v) / ARM.joints[i].vmax)));
      s.qdd.forEach((a, i) => (ar = Math.max(ar, Math.abs(a) / ARM.joints[i].amax)));
    }
    const end = sample(tr, tr.duration);
    check(`${profile}: |qd| <= vmax and |qdd| <= amax, rest at the end`, vr <= 1.001 && ar <= 1.001 && Math.max(...end.qd.map(Math.abs)) < 1e-6,
      `peak ${(vr * 100).toFixed(1)}% of vmax, ${(ar * 100).toFixed(1)}% of amax, ${tr.duration.toFixed(2)} s`);
  }
}

// 7. Known-answer check for the collision test itself
{
  const w = makeWorld([{ type: 'sphere', c: fk(HOME).points[3], r: 0.05, name: 'probe' }]);
  check('collision checker flags a sphere placed on the elbow, and clears it when moved away', !!collides(HOME, w) && !collides(HOME, makeWorld([{ type: 'sphere', c: [2, 2, 2], r: 0.05 }])));
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
