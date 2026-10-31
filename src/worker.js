import { createSimulation, restoreSimulation } from './engine.js';

let sim = null;

self.onmessage = ({ data: m }) => {
  try {
    const started = performance.now();
    let advancedSteps = 0;
    let stepMs = 0;

    if (m.type === 'init') {
      sim = createSimulation(m.settings);
    } else if (m.type === 'restore') {
      sim = restoreSimulation(m.snapshot);
    } else if (!sim) {
      throw new Error('Simulation is not initialized');
    }

    if (m.type === 'update') {
      sim.update(m.settings);
    } else if (m.type === 'restart') {
      sim.restart();
    } else if (m.type === 'field-action') {
      sim.setFieldAction(m.action);
    } else if (m.type === 'spawn') {
      sim.spawnWave(m.wave);
    } else if (m.type === 'burst') {
      sim.triggerWaveBurst();
    } else if (m.type === 'select') {
      if (m.x !== undefined && m.y !== undefined) {
        const nearest = sim.findNearestEntity(m.x, m.y, m.maxDist ?? 26);
        sim.selectEntity(nearest ? nearest.id : null);
      } else {
        sim.selectEntity(m.id ?? null);
      }
    } else if (m.type === 'advance') {
      if (m.action) {
        sim.setFieldAction(m.action);
      }
      const steps = Number.isFinite(m.steps)
        ? Math.max(1, Math.min(32, Math.round(m.steps)))
        : 1;
      const stepStarted = performance.now();
      sim.step(steps);
      advancedSteps = steps;
      stepMs = (performance.now() - stepStarted) / steps;
    } else if (m.type === 'snapshot') {
      self.postMessage({
        type: 'snapshot',
        id: m.id,
        snapshot: sim.snapshot()
      });
      return;
    }

    const frame = sim.frame();
    frame.workerMs = performance.now() - started;
    frame.advancedSteps = advancedSteps;
    frame.stepMs = stepMs;

    self.postMessage(
      {
        type: 'frame',
        generation: m.generation,
        frame
      },
      [
        frame.field.density.buffer,
        frame.field.phase.buffer,
        frame.field.flavor.buffer
      ]
    );
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: m.id,
      message: error.message
    });
  }
};
