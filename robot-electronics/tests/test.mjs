// node tests/test.mjs [path/to/control.ino]
// 1) pins and tuning match the firmware source (when its path is given)
// 2) every command sets the pins the firmware sets, and the H-bridges turn that into the right motor direction
// 3) the 500 ms timeout stops a motion that is not re-sent, and the bridge's 250 ms repeat keeps it alive
// 4) rail check: the real wiring has no shorted rails and one common ground; each of the three mistakes is caught
import { readFileSync } from 'node:fs';
import { PINS, TUNING, Firmware, hardware, railCheck, FAULTS, WIRES } from '../js/net.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

const src = process.argv[2];
if (src) {
  const ino = readFileSync(src, 'utf8');
  const num = name => { const m = ino.match(new RegExp(`${name}\\s*=\\s*([A-Z]?[+-]?\\d+)`)); return m && m[1]; };
  const pin = v => /^A/.test(v) ? v : 'D' + v;
  const map = {
    PIN_ESP32_RX: PINS.HC05_RX,
    PIN_WALK_LEFT_EN: PINS.WALK_LEFT.en, PIN_WALK_LEFT_IN1: PINS.WALK_LEFT.in1, PIN_WALK_LEFT_IN2: PINS.WALK_LEFT.in2,
    PIN_WALK_RIGHT_EN: PINS.WALK_RIGHT.en, PIN_WALK_RIGHT_IN1: PINS.WALK_RIGHT.in1, PIN_WALK_RIGHT_IN2: PINS.WALK_RIGHT.in2,
    PIN_ROTATE_EN: PINS.ROTATE.en, PIN_ROTATE_IN1: PINS.ROTATE.in1, PIN_ROTATE_IN2: PINS.ROTATE.in2,
    PIN_VERTICAL_EN: PINS.LIFT.en, PIN_VERTICAL_IN1: PINS.LIFT.in1, PIN_VERTICAL_IN2: PINS.LIFT.in2,
    PIN_HORIZONTAL_LEFT_SERVO: PINS.SERVO.hLeft, PIN_HORIZONTAL_RIGHT_SERVO: PINS.SERVO.hRight,
    PIN_CLAW_SERVO: PINS.SERVO.claw, PIN_GATE_SERVO: PINS.SERVO.gate,
  };
  for (const [k, v] of Object.entries(map)) ok(pin(num(k)) === v, `${k}: ino ${num(k)} vs ${v}`);
  const tun = {
    walkLeftSpeed: TUNING.walkStart, WALK_SPEED_STEP: TUNING.walkStep, WALK_SPEED_MIN: TUNING.walkMin, WALK_SPEED_MAX: TUNING.walkMax,
    LIFT_SPEED: TUNING.lift, ROTATE_SPEED: TUNING.rotate, H_LEFT_STOP: TUNING.stop, HORIZONTAL_SPEED: TUNING.horizontal,
    CLAW_OPEN_SPEED: TUNING.clawOpen, CLAW_CLOSE_SPEED: TUNING.clawClose, GATE_OPEN_SPEED: TUNING.gateOpen, GATE_CLOSE_SPEED: TUNING.gateClose,
    H_RIGHT_EXTEND_SIGN: TUNING.hRightSign, COMMAND_TIMEOUT_MS: TUNING.timeoutMs, ESP32_SERIAL_BAUD: TUNING.baud,
  };
  for (const [k, v] of Object.entries(tun)) ok(Number(num(k)) === v, `${k}: ino ${num(k)} vs ${v}`);
  // every command letter in the ino switch is handled here
  const cases = [...ino.matchAll(/case '(.)':/g)].map(m => m[1]);
  const fw = new Firmware();
  for (const c of cases) { fw.handle(c, 0); ok(!fw.log.at(-1).includes('Unknown'), `command ${c} handled`); }
  console.log(`checked ${Object.keys(map).length} pins, ${Object.keys(tun).length} constants, ${cases.length} commands against ${src}`);
}

// command truth table: [cmd, mWL, mWR, mRot, mLift, sv1..sv4 sign]
const table = [
  ['F', 220/255, 220/255, 0, 0, 0, 0, 0, 0],
  ['B', -220/255, -220/255, 0, 0, 0, 0, 0, 0],
  ['L', 0, 220/255, 0, 0, 0, 0, 0, 0],
  ['R', 220/255, 0, 0, 0, 0, 0, 0, 0],
  ['E', 0, 0, 180/255, 0, 0, 0, 0, 0],
  ['Q', 0, 0, -180/255, 0, 0, 0, 0, 0],
  ['U', 0, 0, 0, 1, 0, 0, 0, 0],
  ['D', 0, 0, 0, -1, 0, 0, 0, 0],
  ['A', 0, 0, 0, 0, +1, -1, 0, 0],
  ['Z', 0, 0, 0, 0, -1, +1, 0, 0],
  ['O', 0, 0, 0, 0, 0, 0, +1, 0],
  ['C', 0, 0, 0, 0, 0, 0, -1, 0],
  ['G', 0, 0, 0, 0, 0, 0, 0, +1],
  ['K', 0, 0, 0, 0, 0, 0, 0, -1],
];
for (const [c, ...exp] of table) {
  const fw = new Firmware(); fw.handle(c, 0);
  const h = hardware(fw);
  const got = [h.motors.mWL, h.motors.mWR, h.motors.mRot, h.motors.mLift, ...['sv1', 'sv2', 'sv3', 'sv4'].map(k => Math.sign(h.servos[k]))];
  ok(got.every((g, i) => Math.abs(g - exp[i]) < 1e-9), `${c}: got ${got.map(v => v.toFixed(2))}`);
}
// stop commands
for (const [go, stop] of [['F', 'P'], ['A', 'Y'], ['U', 'V'], ['E', 'I'], ['O', 'M'], ['G', 'N'], ['F', 'S'], ['U', 'X']]) {
  const fw = new Firmware(); fw.handle(go, 0); fw.handle(stop, 10);
  const h = hardware(fw);
  ok([...Object.values(h.motors), ...Object.values(h.servos)].every(v => v === 0), `${go} then ${stop} stops`);
}
// speed trim
{ const fw = new Firmware(); fw.handle('F', 0); for (let i = 0; i < 40; i++) fw.handle('1', 0);
  ok(fw.walkL === 80 && fw.out[PINS.WALK_LEFT.en].v === 80, 'left trim clamps at 80 and re-applies'); }

// timeout
{ const fw = new Firmware(); fw.handle('F', 0); fw.tick(499); ok(hardware(fw).motors.mWL > 0, 'still running at 499 ms');
  fw.tick(500); ok(hardware(fw).motors.mWL === 0 && fw.log.at(-1) === 'Command timeout stop.', 'stops at 500 ms'); }
{ const fw = new Firmware(); let alive = true;
  for (let t = 0; t <= 5000; t += 10) { if (t % TUNING.bridgeRepeatMs === 0) fw.handle('F', t); fw.tick(t); if (hardware(fw).motors.mWL === 0) alive = false; }
  ok(alive, 'bridge repeat at 250 ms keeps walking for 5 s'); }
{ const fw = new Firmware(); fw.handle('F', 0); fw.handle('U', 300); fw.tick(500);
  const h = hardware(fw); ok(h.motors.mWL === 0 && h.motors.mLift === 1, 'timeout is per group'); }

// rail check
const good = railCheck();
ok(good.problems.length === 0, 'real wiring: ' + good.problems.join('; '));
for (const k of Object.keys(FAULTS)) {
  const r = railCheck({ [k]: true });
  ok(r.problems.length > 0, `fault ${k} caught`);
  console.log(`fault ${k}: ${r.problems.join('; ')}`);
}
// no wire uses D0/D1 or HC-05 RXD
ok(!WIRES.some(w => /\.(D0|D1)\./.test(w[0] + w[1]) || /hc05\.RXD/.test(w[0] + w[1])), 'D0/D1 and HC-05 RXD unused');

console.log(`${pass} passed, ${fail} failed · ${good.wires} wires, rail check ${good.problems.length} problems`);
process.exit(fail ? 1 : 0);
