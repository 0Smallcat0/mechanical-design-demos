// Wiring, power rails and firmware behaviour of the pick-up robot's controller.
// Pin numbers, commands, speeds and the 500 ms timeout follow the robot's control.ino;
// wires follow its wiring plan (Uno + Sensor Shield V5 + 2x L298N + 4 continuous servos + HC-05).
// Pure module: no three.js, so the tests can run it in Node.

export const PINS = {
  HC05_RX: 'D2',
  WALK_LEFT: { en: 'D5', in1: 'D7', in2: 'D8' },
  WALK_RIGHT: { en: 'D6', in1: 'D9', in2: 'D10' },
  ROTATE: { en: 'D3', in1: 'D12', in2: 'D13' },
  LIFT: { en: 'D11', in1: 'A0', in2: 'A1' },
  SERVO: { hLeft: 'A2', hRight: 'A3', claw: 'A4', gate: 'A5' },
};

export const TUNING = {
  walkStart: 220, walkStep: 5, walkMin: 80, walkMax: 255,
  lift: 255, rotate: 180,
  stop: 90, horizontal: 10, clawOpen: 12, clawClose: 30, gateOpen: 10, gateClose: 10,
  hLeftSign: +1, hRightSign: -1, clawOpenSign: +1, gateOpenSign: +1,
  timeoutMs: 500, baud: 9600, bridgeRepeatMs: 250,
};

export const COMPONENTS = {
  uno:   { name: 'Arduino Uno R3', role: 'Main controller. D0/D1 stay free for USB upload and the serial monitor.' },
  shield:{ name: 'Sensor Shield V5', role: 'Stacks on the Uno; every pin gets a G / V / S row so each device plugs in with one 3-pin lead.' },
  hc05:  { name: 'HC-05 Bluetooth', role: 'Receives one-letter commands at 9600 baud from the PC bridge (Xbox pad). Only TXD is wired, into D2, so no 5 V signal ever reaches its 3.3 V RXD.' },
  l1:    { name: 'L298N #1 · legs', role: 'Dual H-bridge for the left and right leg motors. ENA/ENB jumpers removed so the Uno sets speed by PWM.' },
  l2:    { name: 'L298N #2 · arm', role: 'Dual H-bridge for arm rotation (channel A) and the lift lead screw (channel B).' },
  mWL:   { name: 'Left leg motor', role: 'DC gear motor, L298N #1 channel A.' },
  mWR:   { name: 'Right leg motor', role: 'DC gear motor, L298N #1 channel B.' },
  mRot:  { name: 'Arm rotation motor', role: 'DC gear motor, L298N #2 channel A, PWM 180.' },
  mLift: { name: 'Lift motor', role: 'DC gear motor on the lead screw, L298N #2 channel B, PWM 255.' },
  sv1:   { name: 'Servo · arm slide L', role: '360° servo, A2. Runs opposite to the right one so the slide moves straight.' },
  sv2:   { name: 'Servo · arm slide R', role: '360° servo, A3.' },
  sv3:   { name: 'Servo · claw', role: '360° servo, A4. Closes faster (30) than it opens (12).' },
  sv4:   { name: 'Servo · gate', role: '360° servo, A5. Opens the storage box onto the EV3 cart.' },
  bus:   { name: 'Servo power block', role: 'Feeds the four servo red/black wires from the BEC, not from the Uno.' },
  bec:   { name: 'Servo BEC 5–6 V', role: 'Separate supply for the servos: four servos can draw far more than the Uno regulator gives.' },
  buck:  { name: 'LM2596 buck → 5.0 V', role: 'Set to 5.0 V with a meter before it is connected; feeds the Uno 5V pin.' },
  batA:  { name: 'Battery A · motors', role: 'Only goes to the L298N motor terminals.' },
  batB:  { name: 'Battery B · logic & servos', role: 'Feeds the LM2596 (logic) and the servo BEC.' },
};

// kind: sig (signal), pwm, ser (serial), mot (motor output), p+ / p- (power), gnd
export const WIRES = [
  // Bluetooth lead on the D2 row (S/V/G)
  ['hc05.TXD', 'shield.D2.S', 'ser', 'HC-05 TXD → D2 (SoftwareSerial RX)'],
  ['hc05.VCC', 'shield.D2.V', 'p+', 'HC-05 VCC ← 5 V'],
  ['hc05.GND', 'shield.D2.G', 'gnd', 'HC-05 GND'],
  // L298N #1
  ['shield.D5.S', 'l1.ENA', 'pwm', 'D5 → ENA (left leg speed)'],
  ['shield.D7.S', 'l1.IN1', 'sig', 'D7 → IN1'],
  ['shield.D8.S', 'l1.IN2', 'sig', 'D8 → IN2'],
  ['shield.D6.S', 'l1.ENB', 'pwm', 'D6 → ENB (right leg speed)'],
  ['shield.D9.S', 'l1.IN3', 'sig', 'D9 → IN3'],
  ['shield.D10.S', 'l1.IN4', 'sig', 'D10 → IN4'],
  ['shield.D10.G', 'l1.GND', 'gnd', 'Common ground → L298N #1', 'g1'],
  // L298N #2
  ['shield.D3.S', 'l2.ENA', 'pwm', 'D3 → ENA (rotation speed)'],
  ['shield.D12.S', 'l2.IN1', 'sig', 'D12 → IN1'],
  ['shield.D13.S', 'l2.IN2', 'sig', 'D13 → IN2'],
  ['shield.D11.S', 'l2.ENB', 'pwm', 'D11 → ENB (lift speed)'],
  ['shield.A0.S', 'l2.IN3', 'sig', 'A0 → IN3'],
  ['shield.A1.S', 'l2.IN4', 'sig', 'A1 → IN4'],
  ['shield.D13.G', 'l2.GND', 'gnd', 'Common ground → L298N #2', 'g2'],
  // motors
  ['l1.OUT1', 'mWL.+', 'mot', 'OUT1 → left leg'], ['l1.OUT2', 'mWL.-', 'mot', 'OUT2 → left leg'],
  ['l1.OUT3', 'mWR.+', 'mot', 'OUT3 → right leg'], ['l1.OUT4', 'mWR.-', 'mot', 'OUT4 → right leg'],
  ['l2.OUT1', 'mRot.+', 'mot', 'OUT1 → rotation'], ['l2.OUT2', 'mRot.-', 'mot', 'OUT2 → rotation'],
  ['l2.OUT3', 'mLift.+', 'mot', 'OUT3 → lift'], ['l2.OUT4', 'mLift.-', 'mot', 'OUT4 → lift'],
  // servos: signal from the shield, power from the block
  ['shield.A2.S', 'sv1.SIG', 'sig', 'A2 → slide L signal'],
  ['shield.A3.S', 'sv2.SIG', 'sig', 'A3 → slide R signal'],
  ['shield.A4.S', 'sv3.SIG', 'sig', 'A4 → claw signal'],
  ['shield.A5.S', 'sv4.SIG', 'sig', 'A5 → gate signal'],
  ['bus.P1', 'sv1.VCC', 'p+', 'servo +'], ['bus.N1', 'sv1.GND', 'gnd', 'servo −'],
  ['bus.P2', 'sv2.VCC', 'p+', 'servo +'], ['bus.N2', 'sv2.GND', 'gnd', 'servo −'],
  ['bus.P3', 'sv3.VCC', 'p+', 'servo +'], ['bus.N3', 'sv3.GND', 'gnd', 'servo −'],
  ['bus.P4', 'sv4.VCC', 'p+', 'servo +'], ['bus.N4', 'sv4.GND', 'gnd', 'servo −'],
  ['bec.OUT+', 'bus.P0', 'p+', 'BEC + → servo block', 'servoFeed'],
  ['bec.OUT-', 'bus.N0', 'gnd', 'BEC − → servo block'],
  ['bus.N5', 'shield.A5.G', 'gnd', 'Servo ground ↔ Uno ground', 'g3'],
  // motor power
  ['batA.+', 'l1.VS', 'p+', 'Battery A + → L298N #1 +12V'],
  ['batA.+', 'l2.VS', 'p+', 'Battery A + → L298N #2 +12V'],
  ['batA.-', 'l1.GND', 'gnd', 'Battery A −'],
  ['batA.-', 'l2.GND', 'gnd', 'Battery A −'],
  // logic power
  ['batB.+', 'buck.IN+', 'p+', 'Battery B + → LM2596 IN+'],
  ['batB.-', 'buck.IN-', 'gnd', 'Battery B − → LM2596 IN−'],
  ['buck.OUT+', 'uno.5V', 'p+', 'LM2596 5.0 V → Uno 5V'],
  ['buck.OUT-', 'uno.GND', 'gnd', 'LM2596 − → Uno GND'],
  ['batB.+', 'bec.IN+', 'p+', 'Battery B + → BEC'],
  ['batB.-', 'bec.IN-', 'gnd', 'Battery B − → BEC'],
];

// Three mistakes from the plan's "Do not connect" list, so you can see what each one does.
export const FAULTS = {
  servoOnUno: {
    label: 'Power the servos from the Uno 5V',
    remove: ['servoFeed'],
    add: [['shield.A4.V', 'bus.P0', 'p+', 'Uno 5 V → servo block (wrong)']],
    effect: 'The four servos pull the 5 V rail down the moment they move: the Uno browns out and resets, every output drops.',
  },
  noCommonGround: {
    label: 'Leave out the common ground',
    remove: ['g1', 'g2', 'g3'],
    add: [],
    effect: 'The L298N and servos have no shared reference for the Uno\'s 5 V signals, so inputs float: motors twitch or ignore commands.',
  },
  motorOnLogic: {
    label: 'Battery A + onto the shield V row',
    remove: [],
    add: [['batA.+', 'shield.D8.V', 'p+', 'Battery A + → 5 V rail (wrong)']],
    effect: 'Motor-battery voltage lands on the 5 V rail that feeds the ATmega328P, HC-05 and shield. The board is damaged.',
  },
};

export function wiresFor(faults = {}) {
  let list = WIRES.slice();
  for (const [key, on] of Object.entries(faults)) {
    if (!on) continue;
    const f = FAULTS[key];
    list = list.filter(w => !f.remove.includes(w[4]));
    list = list.concat(f.add.map(w => [...w, 'fault:' + key]));
  }
  return list;
}

// ---------- rail check: union-find over wires plus connections inside each board ----------
const DIG = ['D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12','D13','A0','A1','A2','A3','A4','A5'];
function internal() {
  const links = [];
  for (const p of DIG) { links.push([`shield.${p}.G`, 'uno.GND']); links.push([`shield.${p}.V`, 'uno.5V']); }
  for (const b of ['l1', 'l2']) links.push([`${b}.GND`, `${b}.GND`]);
  for (let i = 1; i <= 5; i++) { if (i <= 4) links.push(['bus.P0', `bus.P${i}`]); links.push(['bus.N0', `bus.N${i}`]); }
  links.push(['bec.IN-', 'bec.OUT-']);     // BEC and LM2596 share input/output ground
  links.push(['buck.IN-', 'buck.OUT-']);
  return links;
}

export function railCheck(faults = {}) {
  const parent = new Map();
  const find = a => { if (!parent.has(a)) parent.set(a, a); let r = a; while (parent.get(r) !== r) r = parent.get(r); parent.set(a, r); return r; };
  const join = (a, b) => parent.set(find(a), find(b));
  const ws = wiresFor(faults);
  for (const w of ws) join(w[0], w[1]);
  for (const [a, b] of internal()) join(a, b);
  const rails = { 'Motor battery +': 'batA.+', 'Logic 5 V': 'uno.5V', 'Servo 5–6 V': 'bec.OUT+', 'Battery B +': 'batB.+' };
  const problems = [];
  const names = Object.keys(rails);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++)
    if (find(rails[names[i]]) === find(rails[names[j]])) problems.push(`${names[i]} is shorted to ${names[j]}`);
  const grounds = ['uno.GND', 'l1.GND', 'l2.GND', 'bus.N0', 'batA.-', 'batB.-', 'hc05.GND'];
  const g0 = find(grounds[0]);
  for (const g of grounds.slice(1)) if (find(g) !== g0) problems.push(`${g} is not on the common ground`);
  const servoSupply = find('bus.P0') === find('bec.OUT+') ? 'BEC' : find('bus.P0') === find('uno.5V') ? 'Uno 5V' : 'none';
  if (servoSupply !== 'BEC') problems.push(`Servos are powered from ${servoSupply}, not the BEC`);
  return { problems, wires: ws.length, servoSupply };
}

// ---------- firmware: a line-for-line port of control.ino's command handling ----------
const HELP = ['Commands:', 'F/B = walk forward/backward', 'L/R = turn left/right', '1/2 = left walk motor speed -/+', '3/4 = right walk motor speed -/+',
  '5 = print left/right walk speeds', 'A/Z = horizontal extend/retract', 'U/D = vertical up/down', 'E/Q = rotate CW/CCW', 'O/C/M = claw open/close/stop',
  'G/K/N = gate open/close/stop', 'P/V/I/Y = stop walk/vertical/rotate/horizontal only', '0/S = stop all', 'X/! = emergency stop'];
const GROUPS = ['walk', 'horizontal', 'vertical', 'rotate', 'claw', 'gate'];

export class Firmware {
  constructor() { this.reset(0); }
  reset(now) {
    this.out = {};            // pin -> {mode:'d'|'pwm'|'servo', v}
    for (const m of [PINS.WALK_LEFT, PINS.WALK_RIGHT, PINS.ROTATE, PINS.LIFT]) this.stopDc(m);
    for (const p of Object.values(PINS.SERVO)) this.out[p] = { mode: 'servo', v: TUNING.stop };
    this.walkL = TUNING.walkStart; this.walkR = TUNING.walkStart;
    this.active = Object.fromEntries(GROUPS.map(g => [g, null]));
    this.last = Object.fromEntries(GROUPS.map(g => [g, 0]));
    this.log = this.log || [];
    this.boot = now;
    this.print('Robot Uno Sensor Shield V5 ready.');
  }
  print(s) { this.log.push(s); if (this.log.length > 200) this.log.shift(); }
  runDc(m, dir, speed) {
    const pwm = Math.max(0, Math.min(255, speed));
    this.out[m.in1] = { mode: 'd', v: dir >= 0 ? 1 : 0 };
    this.out[m.in2] = { mode: 'd', v: dir >= 0 ? 0 : 1 };
    this.out[m.en] = { mode: 'pwm', v: pwm };
  }
  stopDc(m) { this.out[m.en] = { mode: 'pwm', v: 0 }; this.out[m.in1] = { mode: 'd', v: 0 }; this.out[m.in2] = { mode: 'd', v: 0 }; }
  servo(pin, sign, speed) { this.out[pin] = { mode: 'servo', v: Math.max(0, Math.min(180, TUNING.stop + sign * speed)) }; }
  servoStop(pin) { this.out[pin] = { mode: 'servo', v: TUNING.stop }; }
  start(g, m, now) { this.active[g] = m; this.last[g] = now; }
  release(g) { this.active[g] = null; this.last[g] = 0; }

  walkForward() { this.runDc(PINS.WALK_LEFT, +1, this.walkL); this.runDc(PINS.WALK_RIGHT, +1, this.walkR); return `Walk forward. L=${this.walkL} R=${this.walkR}`; }
  walkBackward() { this.runDc(PINS.WALK_LEFT, -1, this.walkL); this.runDc(PINS.WALK_RIGHT, -1, this.walkR); return `Walk backward. L=${this.walkL} R=${this.walkR}`; }
  turnLeft() { this.stopDc(PINS.WALK_LEFT); this.runDc(PINS.WALK_RIGHT, +1, this.walkR); return `Pivot left. L=0 R=${this.walkR}`; }
  turnRight() { this.runDc(PINS.WALK_LEFT, +1, this.walkL); this.stopDc(PINS.WALK_RIGHT); return `Pivot right. L=${this.walkL} R=0`; }
  stopGroup(g) {
    const S = PINS.SERVO;
    if (g === 'walk') { this.stopDc(PINS.WALK_LEFT); this.stopDc(PINS.WALK_RIGHT); }
    if (g === 'horizontal') { this.servoStop(S.hLeft); this.servoStop(S.hRight); }
    if (g === 'vertical') this.stopDc(PINS.LIFT);
    if (g === 'rotate') this.stopDc(PINS.ROTATE);
    if (g === 'claw') this.servoStop(S.claw);
    if (g === 'gate') this.servoStop(S.gate);
  }
  stopAll() { for (const g of GROUPS) { this.stopGroup(g); this.release(g); } }

  handle(raw, now, source = 'BT') {
    if (' \r\n\t'.includes(raw)) return;
    const c = raw.toUpperCase();
    this.print(`[${source}] ${c}`);
    const T = TUNING, S = PINS.SERVO;
    const clamp = v => Math.max(T.walkMin, Math.min(T.walkMax, v));
    const reapply = () => { const a = this.active.walk; if (a === 'F') this.walkForward(); else if (a === 'B') this.walkBackward(); else if (a === 'L') this.turnLeft(); else if (a === 'R') this.turnRight(); };
    const speeds = () => `Walk speed setting: LEFT=${this.walkL} RIGHT=${this.walkR}`;
    let msg = null;
    switch (c) {
      case 'F': this.start('walk', 'F', now); msg = this.walkForward(); break;
      case 'B': this.start('walk', 'B', now); msg = this.walkBackward(); break;
      case 'L': this.start('walk', 'L', now); msg = this.turnLeft(); break;
      case 'R': this.start('walk', 'R', now); msg = this.turnRight(); break;
      case '1': this.walkL = clamp(this.walkL - T.walkStep); this.print(speeds()); reapply(); break;
      case '2': this.walkL = clamp(this.walkL + T.walkStep); this.print(speeds()); reapply(); break;
      case '3': this.walkR = clamp(this.walkR - T.walkStep); this.print(speeds()); reapply(); break;
      case '4': this.walkR = clamp(this.walkR + T.walkStep); this.print(speeds()); reapply(); break;
      case '5': msg = speeds(); break;
      case 'A': this.start('horizontal', 'A', now); this.servo(S.hLeft, T.hLeftSign, T.horizontal); this.servo(S.hRight, T.hRightSign, T.horizontal); msg = 'Horizontal extend.'; break;
      case 'Z': this.start('horizontal', 'Z', now); this.servo(S.hLeft, -T.hLeftSign, T.horizontal); this.servo(S.hRight, -T.hRightSign, T.horizontal); msg = 'Horizontal retract.'; break;
      case 'U': this.start('vertical', 'U', now); this.runDc(PINS.LIFT, +1, T.lift); msg = 'Vertical up.'; break;
      case 'D': this.start('vertical', 'D', now); this.runDc(PINS.LIFT, -1, T.lift); msg = 'Vertical down.'; break;
      case 'E': this.start('rotate', 'E', now); this.runDc(PINS.ROTATE, +1, T.rotate); msg = 'Rotate CW.'; break;
      case 'Q': this.start('rotate', 'Q', now); this.runDc(PINS.ROTATE, -1, T.rotate); msg = 'Rotate CCW.'; break;
      case 'O': this.start('claw', 'O', now); this.servo(S.claw, T.clawOpenSign, T.clawOpen); msg = 'Claw open.'; break;
      case 'C': this.start('claw', 'C', now); this.servo(S.claw, -T.clawOpenSign, T.clawClose); msg = 'Claw close.'; break;
      case 'M': this.servoStop(S.claw); this.release('claw'); msg = 'Claw stopped.'; break;
      case 'G': this.start('gate', 'G', now); this.servo(S.gate, T.gateOpenSign, T.gateOpen); msg = 'Gate open.'; break;
      case 'K': this.start('gate', 'K', now); this.servo(S.gate, -T.gateOpenSign, T.gateClose); msg = 'Gate close.'; break;
      case 'N': this.servoStop(S.gate); this.release('gate'); msg = 'Gate stopped.'; break;
      case 'P': this.stopGroup('walk'); this.release('walk'); msg = 'Walk stopped.'; break;
      case 'Y': this.stopGroup('horizontal'); this.release('horizontal'); msg = 'Horizontal stopped.'; break;
      case 'V': this.stopGroup('vertical'); this.release('vertical'); msg = 'Vertical stopped.'; break;
      case 'I': this.stopGroup('rotate'); this.release('rotate'); msg = 'Rotate stopped.'; break;
      case '0': case 'S': this.stopAll(); msg = 'All stopped.'; break;
      case 'X': case '!': this.stopAll(); msg = 'Emergency stop.'; break;
      case '?': for (const l of HELP) this.print(l); break;
      default: msg = 'Unknown command.';
    }
    if (msg) this.print(msg);
  }
  tick(now) {
    for (const g of GROUPS) {
      if (!this.active[g]) continue;
      if (now - this.last[g] >= TUNING.timeoutMs) { this.stopGroup(g); this.release(g); this.print('Command timeout stop.'); }
    }
  }
}

// What the hardware does with the pin states: motor speed −1..1 per channel, servo speed −1..1.
export function hardware(fw, faults = {}, rng = Math.random) {
  const ch = m => {
    const en = fw.out[m.en].v / 255, a = fw.out[m.in1].v, b = fw.out[m.in2].v;
    return a === b ? 0 : (a ? 1 : -1) * en;
  };
  let motors = { mWL: ch(PINS.WALK_LEFT), mWR: ch(PINS.WALK_RIGHT), mRot: ch(PINS.ROTATE), mLift: ch(PINS.LIFT) };
  const S = PINS.SERVO;
  const sp = p => Math.max(-1, Math.min(1, (fw.out[p].v - TUNING.stop) / 30));
  let servos = { sv1: sp(S.hLeft), sv2: sp(S.hRight), sv3: sp(S.claw), sv4: sp(S.gate) };
  if (faults.noCommonGround) {
    for (const k in motors) motors[k] = rng() < 0.35 ? (rng() * 2 - 1) * 0.6 : 0;
    for (const k in servos) servos[k] = rng() < 0.25 ? (rng() * 2 - 1) * 0.5 : 0;
  }
  return { motors, servos };
}

export function pinLevel(fw, pin) {
  const o = fw.out[pin];
  if (!o) return 0;
  if (o.mode === 'd') return o.v;
  if (o.mode === 'pwm') return o.v / 255;
  return Math.abs(o.v - TUNING.stop) / 90 > 0 ? 0.6 : 0.15; // servo pulse train is always present
}

export const BRINGUP = [
  { t: 'Upload with USB only', s: 'Uno on USB, nothing else powered. Flash control.ino and open the serial monitor at 9600.', show: ['uno', 'shield'] },
  { t: 'Signal leads, power off', s: 'Plug every S lead into the shield; battery A and the servo BEC stay off.', show: ['uno', 'shield', 'l1', 'l2', 'sv1', 'sv2', 'sv3', 'sv4'], kinds: ['sig', 'pwm'] },
  { t: 'Join every ground', s: 'Uno, both L298Ns, battery A −, the BEC − and the servo block end up on one ground.', show: ['uno', 'shield', 'l1', 'l2', 'bus', 'bec', 'batA', 'batB', 'buck'], kinds: ['sig', 'pwm', 'gnd'] },
  { t: 'One leg motor, low speed', s: 'Battery A on L298N #1. Test one motor unloaded, lowering the speed with 1 / 3.', show: ['uno', 'shield', 'l1', 'mWL', 'batA'], kinds: ['sig', 'pwm', 'gnd', 'mot', 'p+'], try: 'F' },
  { t: 'Second leg motor', s: 'Same L298N, channel B.', show: ['uno', 'shield', 'l1', 'mWL', 'mWR', 'batA'], kinds: ['sig', 'pwm', 'gnd', 'mot', 'p+'], try: 'F' },
  { t: 'L298N #2: rotation, then lift', s: 'One motor at a time.', show: ['uno', 'shield', 'l1', 'l2', 'mWL', 'mWR', 'mRot', 'mLift', 'batA'], kinds: ['sig', 'pwm', 'gnd', 'mot', 'p+'], try: 'E' },
  { t: 'Servo BEC, one servo at a time', s: 'Power the BEC and run claw, gate and the two slide servos one by one.', show: ['uno', 'shield', 'l1', 'l2', 'mWL', 'mWR', 'mRot', 'mLift', 'batA', 'bec', 'bus', 'batB', 'sv1', 'sv2', 'sv3', 'sv4'], kinds: ['sig', 'pwm', 'gnd', 'mot', 'p+'], try: 'O' },
  { t: 'Radio last', s: 'Plug in the Bluetooth lead (TXD → D2, nothing on RXD), switch the Uno to battery B through the LM2596, and drive from the Xbox pad. The plan names an ESP32 here; the robot that shipped used an HC-05 on the same pin.', show: null, try: 'F' },
];
