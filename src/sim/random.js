// Deterministic, serializable Mulberry32 PRNG stream.
export class Random {
  constructor(seed = 1729) {
    this.state = seed >>> 0;
  }

  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  gaussian() {
    const u1 = Math.max(1e-12, this.next());
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

export function deriveSeed(master, id) {
  let x = (master ^ Math.imul(id + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

export function sample(weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) {
    throw new RangeError('Cannot sample a zero-probability state');
  }

  let r = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) {
      return i;
    }
  }
  return weights.length - 1;
}
