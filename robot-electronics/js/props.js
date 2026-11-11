// Bench props drawn in code: multimeter probes, a USB cable and a screwdriver. Pure scenery, not part of the circuit.
import * as THREE from 'three';

const plastic = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4, ...o });
const steel = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.22 });
const nickel = new THREE.MeshStandardMaterial({ color: 0xbfc4ca, metalness: 1, roughness: 0.32 });
const rubber = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 });

function shadowed(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }

// lathe profile along +x: [x, radius] pairs
function lathe(profile, mat, seg = 40) {
  const g = new THREE.LatheGeometry(profile.map(([x, r]) => new THREE.Vector2(r, x)), seg);
  const m = new THREE.Mesh(g, mat); m.rotation.z = -Math.PI / 2; return m;   // lathe axis y -> x
}
function cable(points, r, mat, seg = 160) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, false, 'centripetal'), seg, r, 10, false), mat);
}

// one test probe lying on the mat, tip toward +x, lead leaving from the back
function probe(color) {
  const g = new THREE.Group();
  const body = plastic(color);
  g.add(lathe([[0, 0], [0, 2.4], [6, 3.0], [38, 3.4], [41, 5.2], [43, 5.2], [44, 3.0], [58, 2.3], [62, 1.4], [62, 0]], body));
  for (let i = 0; i < 9; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(3.38, 0.22, 6, 32), body); ring.rotation.y = Math.PI / 2; ring.position.x = 10 + i * 3; g.add(ring); }
  g.add(lathe([[62, 0.75], [76, 0.65], [79, 0]], steel, 20));
  return g;
}
export function probes() {
  const g = new THREE.Group();
  const lead = (color, y0, z0, pts) => {
    const p = probe(color); p.position.set(0, y0, z0); g.add(p);
    g.add(cable([new THREE.Vector3(0, y0, z0), ...pts], 1.35, plastic(color, { roughness: 0.5 })));
  };
  // probes rest on their finger guards, so the body sits ~5 mm up
  lead(0xc8231d, 5.2, 0, [new THREE.Vector3(-14, 2, 2), new THREE.Vector3(-40, 1.4, 14), new THREE.Vector3(-62, 1.4, 4), new THREE.Vector3(-80, 1.4, -18), new THREE.Vector3(-120, 1.4, -30)]);
  lead(0x1c1c1f, 5.2, 16, [new THREE.Vector3(-12, 2, 20), new THREE.Vector3(-34, 1.4, 34), new THREE.Vector3(-70, 1.4, 30), new THREE.Vector3(-96, 1.4, 6), new THREE.Vector3(-124, 1.4, -14)]);
  return shadowed(g);
}

// USB A-to-B cable lying loose
export function usbCable() {
  const g = new THREE.Group();
  const jacket = plastic(0x2a2b2e, { roughness: 0.55 });
  const shellA = new THREE.Mesh(new THREE.BoxGeometry(18, 7, 15), plastic(0x2a2b2e)); shellA.position.set(0, 3.5, 0); g.add(shellA);
  const metalA = new THREE.Mesh(new THREE.BoxGeometry(12, 4.6, 12.2), nickel); metalA.position.set(15, 3.5, 0); g.add(metalA);
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(11, 1.2, 10), plastic(0xf2f2f2)); tongue.position.set(15.5, 3.5, 0); g.add(tongue);
  const shellB = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 13), plastic(0x2a2b2e)); shellB.position.set(150, 6, 20); shellB.rotation.y = 0.3; g.add(shellB);
  const metalB = new THREE.Mesh(new THREE.BoxGeometry(9, 10.6, 11.5), nickel); metalB.position.set(150 + Math.cos(0.3) * 14, 6, 20 - Math.sin(0.3) * 14); metalB.rotation.y = 0.3; g.add(metalB);
  g.add(cable([new THREE.Vector3(-9, 3.5, 0), new THREE.Vector3(-24, 2, 2), new THREE.Vector3(-28, 2, 20), new THREE.Vector3(0, 2, 32), new THREE.Vector3(50, 2, 24), new THREE.Vector3(95, 2, 36), new THREE.Vector3(128, 2, 30), new THREE.Vector3(150 - Math.cos(0.3) * 10, 6, 20 + Math.sin(0.3) * 10)], 1.9, jacket, 200));
  return shadowed(g);
}

// flat screwdriver
export function screwdriver() {
  const g = new THREE.Group();
  const handle = plastic(0xf2b705, { transmission: 0, roughness: 0.3 });
  g.add(lathe([[0, 0], [0, 6.5], [4, 8.2], [52, 7.6], [62, 6.0], [70, 4.4], [72, 2.0], [72, 0]], handle, 12));
  const grip = rubber(0x1d1d20); g.add(lathe([[16, 8.25], [46, 7.85]], grip, 12));
  g.add(lathe([[72, 1.9], [150, 1.9], [156, 1.3], [160, 0.2]], steel, 24));
  g.position.y = 8;
  return shadowed(g);
}
