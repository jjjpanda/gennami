export const DENSITY_LEVELS = [0.025, 0.09, 0.24, 0.55];

export function exposure(densityValue) {
  return 1 - Math.exp(-2.8 * Math.sqrt(Math.max(0, densityValue)));
}

export function densityContours(field, n, level, bounds) {
  return marchingSquares(field, n, level, bounds);
}

export function phaseContours(density, phase, n, bounds) {
  const crests = new Float32Array(phase.length);
  for (let i = 0; i < phase.length; i++) {
    crests[i] = Math.cos(phase[i]);
  }
  return marchingSquares(crests, n, 0.75, bounds, density);
}

export function interpolateWave(density, phase, n, target = 128, scratch = {}) {
  if (n >= target) {
    return { density, phase, n };
  }

  const scale = target / n;
  const re = scratch.re?.length === density.length ? scratch.re : new Float32Array(density.length);
  const im = scratch.im?.length === density.length ? scratch.im : new Float32Array(density.length);

  for (let i = 0; i < density.length; i++) {
    const a = Math.sqrt(Math.max(0, density[i]));
    re[i] = a * Math.cos(phase[i]);
    im[i] = a * Math.sin(phase[i]);
  }

  const outDensity =
    scratch.density?.length === target * target ? scratch.density : new Float32Array(target * target);
  const outPhase =
    scratch.phase?.length === target * target ? scratch.phase : new Float32Array(target * target);

  for (let y = 0; y < target; y++) {
    const yy = Math.max(0, Math.min(n - 1, (y + 0.5) / scale - 0.5));
    const y0 = Math.floor(yy);
    const y1 = Math.min(n - 1, y0 + 1);
    const fy = yy - y0;

    for (let x = 0; x < target; x++) {
      const xx = Math.max(0, Math.min(n - 1, (x + 0.5) / scale - 0.5));
      const x0 = Math.floor(xx);
      const x1 = Math.min(n - 1, x0 + 1);
      const fx = xx - x0;

      const a = y0 * n + x0;
      const b = y0 * n + x1;
      const c = y1 * n + x0;
      const d = y1 * n + x1;

      const wa = (1 - fx) * (1 - fy);
      const wb = fx * (1 - fy);
      const wc = (1 - fx) * fy;
      const wd = fx * fy;

      const p = density[a] * wa + density[b] * wb + density[c] * wc + density[d] * wd;
      const r = re[a] * wa + re[b] * wb + re[c] * wc + re[d] * wd;
      const iVal = im[a] * wa + im[b] * wb + im[c] * wc + im[d] * wd;

      const idx = y * target + x;
      outDensity[idx] = p;
      outPhase[idx] = Math.atan2(iVal, r);
    }
  }

  return { density: outDensity, phase: outPhase, n: target, re, im };
}

const EDGE_PAIRS = [
  [],
  [3, 0],
  [0, 1],
  [3, 1],
  [1, 2],
  [3, 0, 1, 2],
  [0, 2],
  [3, 2],
  [2, 3],
  [0, 2],
  [0, 1, 2, 3],
  [1, 2],
  [1, 3],
  [0, 1],
  [3, 0],
  []
];

function marchingSquares(field, n, level, bounds, mask) {
  const segments = [];
  const step = n > 96 ? 2 : 1;

  for (let y = 0; y < n - step; y += step) {
    for (let x = 0; x < n - step; x += step) {
      if (mask) {
        const mMax = Math.max(
          mask[y * n + x],
          mask[y * n + x + step],
          mask[(y + step) * n + x + step],
          mask[(y + step) * n + x]
        );
        if (mMax < 0.04) continue;
      }

      const a = field[y * n + x];
      const b = field[y * n + x + step];
      const c = field[(y + step) * n + x + step];
      const d = field[(y + step) * n + x];

      const code = (a >= level ? 1 : 0) | (b >= level ? 2 : 0) | (c >= level ? 4 : 0) | (d >= level ? 8 : 0);
      const edges = EDGE_PAIRS[code];
      if (!edges.length) continue;

      const vals = [a, b, c, d];
      const corners = [
        [x + 0.5, y + 0.5],
        [x + step + 0.5, y + 0.5],
        [x + step + 0.5, y + step + 0.5],
        [x + 0.5, y + step + 0.5]
      ];

      const pts = edges.map(edge => {
        const next = (edge + 1) % 4;
        const denom = vals[next] - vals[edge];
        const frac = Math.abs(denom) > 1e-9 ? (level - vals[edge]) / denom : 0.5;
        return [
          bounds.x + ((corners[edge][0] + (corners[next][0] - corners[edge][0]) * frac) / n) * bounds.w,
          bounds.y + ((corners[edge][1] + (corners[next][1] - corners[edge][1]) * frac) / n) * bounds.h
        ];
      });

      for (let i = 0; i < pts.length; i += 2) {
        segments.push([pts[i], pts[i + 1]]);
      }
    }
  }

  return segments;
}
