import { QuantumCosmos } from './sim/simulation.js';
import { restoreSimulation, validateSnapshot } from './sim/snapshot.js';
import { SOLVER_VERSION } from './presets.js';

export function createSimulation(options = {}) {
  return new QuantumCosmos(options);
}

export { restoreSimulation, validateSnapshot, SOLVER_VERSION };
