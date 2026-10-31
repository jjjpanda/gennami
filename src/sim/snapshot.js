import { SOLVER_VERSION, normalizeSettings, FLAVORS, PHOTON } from '../presets.js';
import { Random } from './random.js';
import { QuantumCosmos } from './simulation.js';

export function validateSnapshot(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Snapshot must be an object');
  }
  if (![SOLVER_VERSION, 'kyonami-cosmos-f64-2', 'gennami-cosmos-f64-2'].includes(data.solver)) {
    throw new Error(`Unsupported snapshot solver: ${data.solver}`);
  }
  if (!Number.isInteger(data.stepIndex) || data.stepIndex < 0) {
    throw new Error('Invalid snapshot stepIndex');
  }
  if (!Array.isArray(data.entities)) {
    throw new Error('Snapshot must contain entities');
  }
  const isBlankPreset = data.settings?.preset === 'blank' || data.settings?.population === 0;
  if (data.entities.length === 0 && !isBlankPreset) {
    throw new Error('Snapshot must contain entities');
  }
  for (const e of data.entities) {
    if (!Number.isInteger(e.id) || e.id <= 0) {
      throw new Error('Invalid entity id in snapshot');
    }
    if (!FLAVORS[e.flavor]) {
      throw new Error('Invalid entity flavor in snapshot');
    }
    if (![e.x, e.y, e.vx, e.vy, e.sigma, e.phase, e.causalDepth].every(Number.isFinite)) {
      throw new Error('Non-finite entity coordinates in snapshot');
    }
    if (data.solver === SOLVER_VERSION) {
      if (![e.mass, e.spin, e.energy, e.lastReactionTime].every(Number.isFinite) ||
          e.energy < 0 || !Array.isArray(e.constituents) ||
          e.constituents.some(part => !Number.isInteger(part.flavor) || !FLAVORS[part.flavor] ||
            part.flavor === PHOTON || (part.flavor === 0 ? ![-1, 1].includes(part.spin) : part.spin !== 0))) {
        throw new Error('Invalid particle properties in snapshot');
      }
      const mass = e.constituents.reduce((sum, part) => sum + FLAVORS[part.flavor].mass, 0);
      const spin = e.constituents.reduce((sum, part) => sum + part.spin, 0);
      if (e.mass !== mass || e.spin !== spin ||
          (e.flavor === PHOTON ? e.constituents.length !== 0 :
            !e.constituents.length || e.flavor !== e.constituents[0].flavor)) {
        throw new Error('Inconsistent particle composition in snapshot');
      }
    }
  }
  return true;
}

export function restoreSimulation(data) {
  validateSnapshot(data);
  const sim = new QuantumCosmos(normalizeSettings(data.settings));
  sim.stepIndex = data.stepIndex;
  sim.time = Number(data.time) || 0;
  sim.nextEntityId = Number(data.nextEntityId) || data.entities.length + 1;
  sim.nextEventId = Number(data.nextEventId) || 1;
  sim.rng = Object.assign(new Random(), { state: data.rng >>> 0 });
  sim.selectedId = data.selectedId ?? data.entities[0]?.id ?? null;
  sim.totals = {
    interactions: Number(data.totals?.interactions) || 0,
    reversals: Number(data.totals?.reversals) || 0,
    observations: Number(data.totals?.observations) || 0,
    fusions: Number(data.totals?.fusions) || 0,
    fissions: Number(data.totals?.fissions) || 0,
    absorptions: Number(data.totals?.absorptions) || 0
  };
  sim.fieldAction = { ...sim.fieldAction, ...data.fieldAction };
  const legacy = data.solver !== SOLVER_VERSION;
  const migrateFlavor = flavor => legacy && flavor >= 0 ? [0, 0, 1, 2, 3][flavor] : flavor;
  sim.entities = data.entities.map(e => ({
    id: e.id,
    flavor: migrateFlavor(e.flavor),
    mass: legacy ? FLAVORS[migrateFlavor(e.flavor)].mass : e.mass,
    spin: legacy ? (e.flavor === 0 ? 1 : e.flavor === 1 ? -1 : 0) : e.spin,
    energy: legacy ? 0 : e.energy,
    constituents: legacy ? [{ flavor: migrateFlavor(e.flavor), spin: e.flavor === 0 ? 1 : e.flavor === 1 ? -1 : 0 }]
      : e.constituents.map(part => ({ ...part })),
    lastReactionTime: legacy ? -10 : e.lastReactionTime,
    x: e.x,
    y: e.y,
    vx: e.vx,
    vy: e.vy,
    sigma: e.sigma,
    phase: e.phase,
    causalDepth: e.causalDepth,
    coherence: sim.coherenceOf(e.sigma),
    interactionCount: Number(e.interactionCount) || 0,
    lastInteractionTime: Number(e.lastInteractionTime) || 0,
    rng: Object.assign(new Random(), { state: e.rng >>> 0 }),
    history: Array.isArray(e.history) ? e.history.map(h => ({ ...h, partnerFlavor: migrateFlavor(h.partnerFlavor) })) : [],
    trail: Array.isArray(e.trail) ? e.trail.map(pt => [pt[0], pt[1]]) : [[e.x, e.y]]
  }));
  sim.links = Array.isArray(data.links) ? data.links.map(l => ({ ...l })) : [];
  sim.ripples = [];
  sim.synthesizeField();
  return sim;
}
