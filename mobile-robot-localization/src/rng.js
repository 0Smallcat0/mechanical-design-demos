// Seeded PRNG (mulberry32) + Gaussian samples, so tests and the demo film are reproducible.
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const gauss = (sigma = 1) => {
    if (spare !== null) { const v = spare; spare = null; return v * sigma; }
    let u = 0, v = 0;
    while (u === 0) u = next();
    v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v) * sigma;
  };
  return { next, gauss, uniform: (a, b) => a + (b - a) * next() };
}

export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
