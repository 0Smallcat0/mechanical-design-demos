import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/sim.js';

// Run until the robot reaches the goal (or the time limit) and return the error trace.
function run(world, seconds, goal) {
  for (let k = 0; k < seconds * 30; k++) {
    world.tick();
    if (goal && world.mode === 'idle' && !world.goal) world.setGoal(goal);
  }
  return world.history;
}

test('tracking: from a 0.5 m / 17° wrong initial guess, error < 10 cm within 30 filter steps and stays < 15 cm while driving 40 s', () => {
  const w = new World({ seed: 11, global: false, start: [3.0, 1.5, 0.3] });
  w.pf.initAt([3.5, 1.5, 0.6], 0.3, 0.2);            // filter starts 0.5 m and 0.3 rad off
  w.mode = 'idle'; w.setGoal([13.9, 9.5]);
  const h = run(w, 40);
  const first = h.findIndex(s => s.err < 0.1);
  assert.ok(first >= 0 && first < 30, `first < 10 cm at filter step ${first}`);
  const after = h.slice(first + 10), worst = Math.max(...after.map(s => s.err)), mean = after.reduce((a, s) => a + s.err, 0) / after.length;
  const drEnd = h.at(-1).dr;
  console.log(`  tracking: < 10 cm at step ${first} (${(first / 10).toFixed(1)} s); then mean ${(mean * 100).toFixed(1)} cm, worst ${(worst * 100).toFixed(1)} cm; dead reckoning ends ${(drEnd * 100).toFixed(0)} cm off`);
  assert.ok(worst < 0.15, `worst ${worst}`);
  assert.ok(w.events.some(e => e.msg === 'Goal reached'), 'goal reached');
});

test('global localization on a fixed seed: < 10 cm within 600 filter steps (60 s) with no initial guess', () => {
  const w = new World({ seed: 7 });
  const h = run(w, 60, [13.9, 9.5]);
  const first = h.findIndex(s => s.err < 0.1);
  console.log(`  global (seed 7): < 10 cm at filter step ${first} (${(first / 10).toFixed(1)} s), final ${(h.at(-1).err * 100).toFixed(1)} cm`);
  assert.ok(first >= 0 && first < 600);
  assert.ok(h.at(-1).err < 0.1);
});

test('kidnapped robot: the filter notices and recovers to < 10 cm', () => {
  const w = new World({ seed: 7 });
  run(w, 60, [13.9, 9.5]);
  assert.ok(w.history.at(-1).err < 0.1, 'localized before the kidnap');
  w.kidnap([20.2, 4.6, 2.6]);
  const k0 = w.history.length;
  run(w, 60);
  const h = w.history.slice(k0), first = h.findIndex(s => s.err < 0.1);
  const noticed = w.events.find(e => e.msg.startsWith('Scan no longer fits'));
  console.log(`  kidnap: noticed after ${noticed ? (noticed.t - h[0].t + 0.1).toFixed(1) : '-'} s, < 10 cm again after ${(first / 10).toFixed(1)} s`);
  assert.ok(noticed, 'lost state detected');
  assert.ok(first >= 0 && h.at(-1).err < 0.1);
});
