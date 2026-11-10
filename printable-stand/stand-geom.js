// Parametric print-in-place folding stand. One source of geometry for the browser
// configurator and the Node build (manifold-3d WASM kernel, always-manifold booleans).
//
// Print pose: hinge axis = +Z (vertical on the bed), cross-section in XY.
//   Front leg F lies along +X at y in [c/2, rk]; rear leg R along +X at y in [-rk, -c/2].
//   Knuckle segments alternate F,R,F,...,F along Z with axial gap c and 45-degree cone pivots
//   (male cone on each segment's top, matching recess offset by c in the next segment).
//   A stop barrel (annulus R1..R2) around the hinge: F owns the top arc, R the bottom arc.
//   Opening R by psi brings R's arc face onto F's arc face: the stand locks at the viewing angle.
// Use pose: R rotated by -psi about Z, then the whole part mapped so F leans at tilt alpha.

export const DEFAULTS = { devW: 75, devT: 11, tilt: 65, clr: 0.4, lipH: 8 };
export const LIMITS = {
  devW: [55, 260, 1], devT: [6, 16, 0.5], tilt: [50, 80, 1], clr: [0.2, 0.6, 0.05], lipH: [4, 20, 1],
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rad = (d) => (d * Math.PI) / 180;

export function derive(p) {
  const q = { ...DEFAULTS, ...p };
  const t = 4.0;                       // leg thickness (10 perimeters at 0.4 mm)
  const c = q.clr;
  const rk = c / 2 + t;                // knuckle radius, flush with leg faces
  const R1 = rk + c;                   // stop barrel inner radius
  const R2 = R1 + 2.4;                 // stop barrel outer radius
  const rc = rk - 1.4 - c * Math.SQRT2;  // cone pivot base radius (1.4 mm wall left around recess)
  const beta = 58;                     // rear leg angle to the desk
  const psi = 180 - q.tilt - beta;     // opening angle between the legs
  const W = clamp(Math.round(q.devW * 0.8), 50, 160);   // stand width along the hinge
  const LF = clamp(60 + 0.25 * q.devW, 80, 125);        // front leg length
  const a = rad(q.tilt), b = rad(beta);
  const LR = (LF * Math.sin(a) + (c / 2) * (Math.cos(b) - Math.cos(a))) / Math.sin(b);
  const tl = 3.2, tlip = 2.4;          // ledge and lip thickness
  const gapDev = q.devT + 1.0;         // channel width for the device
  let n = Math.max(3, Math.round(W / 12)); if (n % 2 === 0) n += 1;   // odd: F at both ends
  const s = (W - (n - 1) * c) / n;     // segment length
  const segs = [];
  for (let i = 0; i < n; i++) { const z0 = i * (s + c); segs.push({ z0, z1: z0 + s, owner: i % 2 ? 'R' : 'F' }); }
  const aR0 = 190;                     // R arc start (deg); F arc ends at aR0 - psi
  return { ...q, t, c, rk, R1, R2, rc, beta, psi, W, LF, LR, tl, tlip, gapDev, n, s, segs, aR0, aF1: aR0 - psi };
}

export function build(M, p, seg = 96) {
  const { Manifold, CrossSection } = M;
  const d = derive(p);
  const { c, rk, R1, R2, rc, LF, LR, tl, tlip, gapDev, W, segs } = d;
  const rect = (x0, y0, x1, y1) => CrossSection.square([x1 - x0, y1 - y0]).translate([x0, y0]);
  const wedge = (a0, a1) => {
    const pts = [[0, 0]]; const r = 4 * R2; const k = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 3));
    for (let i = 0; i <= k; i++) { const ang = rad(a0 + ((a1 - a0) * i) / k); pts.push([r * Math.cos(ang), r * Math.sin(ang)]); }
    return CrossSection.ofPolygons([pts]);
  };
  const annulus = CrossSection.circle(R2, seg).subtract(CrossSection.circle(R1 + 0.1, seg));   // +0.1: no surface coincident with the clearance cut
  const big = 4 * R2;

  // ---- 2D profiles (full width) ----
  const ledgeLip = rect(LF - tl, rk - 0.01, LF, rk + gapDev + tlip)
    .add(rect(LF - tl - d.lipH, rk + gapDev, LF - tl + 0.01, rk + gapDev + tlip));
  const Fplate = rect(0, c / 2, LF, rk).add(ledgeLip);
  const Rplate = rect(0, -rk, LR, -c / 2);
  const Fring = annulus.intersect(wedge(0, d.aF1)).intersect(rect(-big, c / 2, big, big));
  const Rring = annulus.intersect(wedge(d.aR0, 360)).intersect(rect(-big, -big, big, -c / 2));

  const ex = (cs, z0, z1) => Manifold.extrude(cs, z1 - z0).translate([0, 0, z0]);
  const cyl = (r, z0, z1) => Manifold.cylinder(z1 - z0, r, r, seg).translate([0, 0, z0]);
  const cone = (r, z0) => Manifold.cylinder(r, r, 0, seg).translate([0, 0, z0]);

  const body = (who) => {
    const plate = who === 'F' ? Fplate : Rplate;
    const ring = who === 'F' ? Fring : Rring;
    let m = ex(plate.add(ring), 0, W);
    const parts = [], clear = [], rec = [];
    segs.forEach((sg, i) => {
      if (sg.owner === who) {
        parts.push(cyl(rk - 0.05, sg.z0, sg.z1));                      // -0.05: not tangent to the leg face
        if (i < segs.length - 1) parts.push(cone(rc, sg.z1));            // male pivot into the next segment
        if (i > 0) rec.push(cone(rc + c * Math.SQRT2, segs[i - 1].z1));  // recess for the pivot below, offset by c
      } else {
        clear.push(cyl(R1, Math.max(0, sg.z0 - c), Math.min(W, sg.z1 + c)));  // room for the other leg's knuckle
      }
    });
    m = Manifold.union([m.subtract(Manifold.union(clear)), ...parts]);
    if (rec.length) m = m.subtract(Manifold.union(rec));
    return m;
  };
  return { d, F: body('F'), R: body('R') };
}

// Desk pose: open R by openDeg about the hinge, lean F at the tilt angle, hinge axis -> world X,
// profile x -> world Y (forward), profile y -> world Z (up); then drop onto the desk (z = 0).
export function usePose(M, F, R, d, openDeg = d.psi, withDevice = false) {
  const place = (m) => m.rotate([0, 0, -d.tilt]).rotate([90, 0, 90]);
  // the desk height is fixed by the fully open stand, so a folding animation keeps F still
  const fo = place(F), ro = place(R.rotate([0, 0, -d.psi]));
  const z0 = Math.min(fo.boundingBox().min[2], ro.boundingBox().min[2]);
  const res = { z0, F: fo.translate([0, 0, -z0]), R: place(R.rotate([0, 0, -openDeg])).translate([0, 0, -z0]) };
  if (withDevice) {
    const h = deviceHeight(d);
    const dev = M.Manifold.cube([h, d.devT, d.devW]).translate([d.LF - d.tl - h, d.rk + 0.3, d.W / 2 - d.devW / 2]);
    res.device = place(dev).translate([0, 0, -z0]);
  }
  return res;
}
export const deviceHeight = (d) => (d.devW < 120 ? d.devW * 2.05 : d.devW * 0.72);   // portrait phone / landscape tablet

export function meshArrays(m) {
  const mesh = m.getMesh();
  return { pos: mesh.vertProperties, idx: mesh.triVerts, np: mesh.numProp };
}

// ---------------- printability checks (same code in browser and Node) ----------------
export function analyse(M, F, R, d) {
  const { Manifold } = M;
  const out = {};
  const both = Manifold.union([F, R]);
  const parts = both.decompose();
  out.bodies = parts.length;
  out.manifold = F.status() === 'NoError' && R.status() === 'NoError' && F.genus() >= 0 && R.genus() >= 0;
  out.volume_mm3 = F.volume() + R.volume();
  out.area_mm2 = F.surfaceArea() + R.surfaceArea();
  const bb = both.boundingBox();
  out.bbox_mm = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  out.fitsBed = out.bbox_mm[0] <= 220 && out.bbox_mm[1] <= 220 && out.bbox_mm[2] <= 250;
  out.hingeGap_mm = F.minGap(R, 2.0);
  // free swing from print pose to the stop, and lock just past it. Only the hinge barrel can touch
  // (the legs swing apart), so the sweep runs on the bodies clipped to r < R2 + 0.5 for speed;
  // printability.py repeats it on the full bodies.
  const clip = Manifold.cylinder(d.W + 2, d.R2 + 0.5, d.R2 + 0.5, 48).translate([0, 0, -1]);
  const Fc = F.intersect(clip), Rc = R.intersect(clip);
  let freeTo = 0, jam = 0;
  for (let a = 3; a <= Math.floor(d.psi) - 1; a += 3) {
    const v = Fc.intersect(Rc.rotate([0, 0, -a])).volume();
    if (v > 1e-3) { jam = v; break; }
    freeTo = a;
  }
  out.freeRotation_deg = freeTo;
  out.rotatesToStop = freeTo >= Math.floor(d.psi) - 4 && jam === 0 && Fc.intersect(Rc.rotate([0, 0, -(d.psi - 0.5)])).volume() < 1e-3;
  out.stopOverlap_mm3 = Fc.intersect(Rc.rotate([0, 0, -(d.psi + 1)])).volume();
  out.locksAtStop = out.stopOverlap_mm3 > 0.01;
  // overhang: faces pointing down more than 45 deg from vertical, not on the bed
  let ov = 0, tot = 0, hz = 0;
  for (const m of [F, R]) {
    const { vertProperties: P, triVerts: T, numProp: k } = m.getMesh();
    for (let i = 0; i < T.length; i += 3) {
      const a = T[i] * k, b = T[i + 1] * k, cc = T[i + 2] * k;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[cc] - P[a], vy = P[cc + 1] - P[a + 1], vz = P[cc + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const A2 = Math.hypot(nx, ny, nz); const A = A2 / 2; if (!A) continue;
      tot += A;
      const cz = nz / A2;
      if (Math.abs(cz) > 0.7) hz += A;
      const zc = (P[a + 2] + P[b + 2] + P[cc + 2]) / 3;
      if (cz < -Math.SQRT1_2 && zc > 0.05) ov += A;
    }
  }
  out.overhang_mm2 = ov; out.overhangPct = (100 * ov) / tot; out.horizArea_mm2 = hz;
  // wall thickness: thinnest designed wall (parametric, all walls are prismatic)
  const walls = {
    leg: d.t, ledge: d.tl, lip: d.tlip, stopBarrel: d.R2 - d.R1,
    recessWall: d.rk - (d.rc + d.c * Math.SQRT2),
  };
  out.walls_mm = walls;
  out.minWall_mm = Math.min(...Object.values(walls));
  out.minWallOk = out.minWall_mm >= 1.2;   // 3 perimeters of a 0.4 mm nozzle
  out.clearanceOk = out.hingeGap_mm >= 0.3 - 1e-3;
  out.estimate = estimate(out);
  return out;
}

// Print estimate without a slicer: shell + sparse infill, volumetric flow rates, layer overhead.
export const EST = {
  layer: 0.2, wall: 1.2, topBottom: 0.8, infill: 0.15, density: 1.24, filD: 1.75,
  flowWall: 8, flowInfill: 12, layerOverhead_s: 1.5, startup_s: 120,
};
export function estimate(a, e = EST) {
  const vertA = a.area_mm2 - a.horizArea_mm2;
  const shellV = Math.min(a.volume_mm3, vertA * e.wall + a.horizArea_mm2 * e.topBottom);
  const inner = Math.max(0, a.volume_mm3 - shellV);
  const extruded = shellV + inner * e.infill;
  const grams = (extruded / 1000) * e.density;
  const meters = extruded / (Math.PI * (e.filD / 2) ** 2) / 1000;
  const layers = Math.ceil(a.bbox_mm[2] / e.layer);
  const seconds = shellV / e.flowWall + (inner * e.infill) / e.flowInfill + layers * e.layerOverhead_s + e.startup_s;
  return { extruded_mm3: extruded, shell_mm3: shellV, sparse_mm3: inner, grams, meters, layers, minutes: seconds / 60 };
}

export function stlBinary(meshes) {
  let ntri = 0; for (const m of meshes) ntri += m.triVerts.length / 3;
  const buf = new ArrayBuffer(84 + 50 * ntri); const dv = new DataView(buf);
  const head = 'printable-stand parametric, binary STL, mm';
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, ntri, true);
  let o = 84;
  for (const m of meshes) {
    const P = m.vertProperties, T = m.triVerts, k = m.numProp;
    for (let i = 0; i < T.length; i += 3) {
      const A = T[i] * k, B = T[i + 1] * k, C = T[i + 2] * k;
      const ux = P[B] - P[A], uy = P[B + 1] - P[A + 1], uz = P[B + 2] - P[A + 2];
      const vx = P[C] - P[A], vy = P[C + 1] - P[A + 1], vz = P[C + 2] - P[A + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / L, true); dv.setFloat32(o + 4, ny / L, true); dv.setFloat32(o + 8, nz / L, true); o += 12;
      for (const V of [A, B, C]) { dv.setFloat32(o, P[V], true); dv.setFloat32(o + 4, P[V + 1], true); dv.setFloat32(o + 8, P[V + 2], true); o += 12; }
      dv.setUint16(o, 0, true); o += 2;
    }
  }
  return buf;
}
