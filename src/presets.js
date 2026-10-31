export const SOLVER_VERSION = 'kyonami-cosmos-f64-3';
export const PHOTON = 4;
export const PHOTON_SPEED = 80;

export const FLAVORS = [
  {
    id: 0,
    key: 'cyan',
    name: 'SPINNER',
    description: 'Randomly assigned spin +1 or −1. Opposite spins attract; matching spins repel. Close collisions can fuse matter.',
    mass: 1,
    omega: 0.85
  },
  {
    id: 1,
    key: 'amber',
    name: 'BINDER',
    description: 'Brings opposite spinners together, helping them form bigger groups and rings.',
    mass: 1,
    omega: 0.55
  },
  {
    id: 2,
    key: 'green',
    name: 'DRIFTER',
    description: 'A lightweight particle with weak bonds. Reacts quickly to forces and drifts between groups.',
    mass: 0.5,
    omega: 1.15
  },
  {
    id: 3,
    key: 'lavender',
    name: 'ANCHOR',
    description: 'A heavy particle that attracts groups. Absorbing enough photon energy splits it into lighter fragments.',
    mass: 3,
    omega: 0.25
  },
  {
    id: PHOTON,
    key: 'magenta',
    name: 'PHOTON',
    description: 'A massless wave packet moving at fixed speed. Observation and matter interactions reduce its spread; isolation and Reverse restore it. Absorption heats matter and can trigger fission.',
    mass: 0,
    omega: 2.5
  }
];

export const BOUNDS = {
  seed: [1, 999999999],
  population: [0, 120],
  coupling: [0, 4],
  contagion: [0, 2],
  decay: [0, 2],
  sigmaMin: [0.8, 3],
  sigmaMax: [5, 18],
  worldRadius: [60, 200],
  dt: [0.005, 0.08],
  n: [64, 128]
};

export const BASE_SETTINGS = {
  preset: 'primordial-soup',
  seed: 1729,
  population: 52,
  coupling: 0.9,
  contagion: 0.45,
  decay: 0.34,
  sigmaMin: 1.25,
  sigmaMax: 11.5,
  worldRadius: 108,
  dt: 0.018,
  n: 64
};

export const PRESETS = {
  'primordial-soup': {
    label: 'Mixed particles',
    blurb: 'Counter-drifting spiral wave currents interfere across the basin, forming transient pairs or collapsing under the Observer lens while isolated matter dissolves back into waves.',
    population: 52,
    coupling: 0.9,
    contagion: 0.45,
    decay: 0.34,
    sigmaMin: 1.25,
    sigmaMax: 11.5
  },
  'soliton-collider': {
    label: 'Colliding beams',
    blurb: 'Two counter-propagating coherent wave beams collide at the basin core, triggering a localized cascade of wave-to-particle crystallization and vortex capture.',
    population: 48,
    coupling: 1.55,
    contagion: 0.65,
    decay: 0.2,
    sigmaMin: 1.15,
    sigmaMax: 12.0
  },
  'causal-crystal': {
    label: 'Particle lattice',
    blurb: 'A deeply entangled sacred-geometry lattice with long causal chains. Press and hold on the crystal to reverse causality and dissolve it back into waves.',
    population: 48,
    coupling: 1.4,
    contagion: 0.6,
    decay: 0.07,
    sigmaMin: 1.1,
    sigmaMax: 11.0
  },
  'binary-vortex': {
    label: 'Orbiting clusters',
    blurb: 'Twin self-bound classical micro-clusters orbit a shared barycenter, exchanging tidal streams of delocalized Binder waves across the basin.',
    population: 54,
    coupling: 1.3,
    contagion: 0.55,
    decay: 0.16,
    sigmaMin: 1.15,
    sigmaMax: 11.5
  },
  'resonant-rings': {
    label: 'Concentric rings',
    blurb: 'Three concentric counter-rotating flavor shells weave standing interference mandalas and rhythmic shell-to-shell causal condensations.',
    population: 60,
    coupling: 1.05,
    contagion: 0.48,
    decay: 0.28,
    sigmaMin: 1.2,
    sigmaMax: 12.0
  },
  'quantum-foam': {
    label: 'Diffuse waves',
    blurb: 'High-uncertainty synthwave ocean where wide probability clouds drift in cellular eddies and remain delocalized unless collapsed by direct observation.',
    population: 46,
    coupling: 0.35,
    contagion: 0.2,
    decay: 0.68,
    sigmaMin: 1.45,
    sigmaMax: 15.5
  },
  blank: {
    label: 'Empty',
    blurb: 'An empty quantum vacuum chamber. Use EMIT (Slingshot) to launch custom wavepackets, sculpt interference fringes, and trigger collapses from scratch.',
    population: 0,
    coupling: 1.15,
    contagion: 0.5,
    decay: 0.22,
    sigmaMin: 1.2,
    sigmaMax: 12.0
  }
};

export function isNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string' && value.trim() !== '') {
    return Number.isFinite(Number(value));
  }
  return false;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeSettings(input = {}) {
  const presetKey = Object.hasOwn(PRESETS, input.preset) ? input.preset : BASE_SETTINGS.preset;
  const merged = {
    ...BASE_SETTINGS,
    ...PRESETS[presetKey],
    ...input,
    preset: presetKey
  };

  const out = { preset: presetKey };
  for (const [key, [min, max]] of Object.entries(BOUNDS)) {
    const raw = isNumeric(merged[key]) ? Number(merged[key]) : BASE_SETTINGS[key];
    const clamped = clamp(raw, min, max);
    if (key === 'seed' || key === 'population') {
      out[key] = Math.round(clamped);
    } else if (key === 'n') {
      out[key] = clamped >= 96 ? 128 : 64;
    } else {
      out[key] = clamped;
    }
  }

  if (out.sigmaMax <= out.sigmaMin + 1) {
    out.sigmaMax = out.sigmaMin + 1;
  }

  return out;
}
