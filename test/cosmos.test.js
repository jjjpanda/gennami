import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, restoreSimulation, validateSnapshot } from '../src/engine.js';
import { PRESETS, FLAVORS } from '../src/presets.js';

test('light and heavy particles accelerate inversely with mass under the same interaction', () => {
  const sim = createSimulation({ preset: 'blank', coupling: 0, decay: 0 });
  sim.spawnWave({ x: -5, y: 0, vx: 0, vy: 0, flavor: 2 });
  sim.spawnWave({ x: 5, y: 0, vx: 0, vy: 0, flavor: 3 });
  for (const entity of sim.entities) {
    entity.phase = 0;
    entity.causalDepth = 0;
    entity.sigma = sim.settings.sigmaMax;
    entity.coherence = 1;
    entity.rng.gaussian = () => 0;
  }
  sim.step(1);
  const [light, heavy] = sim.entities;
  assert.ok(light.vx > 0 && heavy.vx < 0);
  assert.ok(Math.abs(light.vx / -heavy.vx - 6) < 1e-10);
  assert.equal(sim.frame().selectedInspector.mass, 3);
});

test('all particle types interact with finite motion and survive snapshot restoration', () => {
  const sim = createSimulation({ preset: 'blank' });
  for (const flavor of FLAVORS) sim.spawnWave({ flavor: flavor.id, x: flavor.id * 4 - 8, y: 0 });
  sim.step(180);
  for (const entity of sim.entities) {
    assert.ok([entity.x, entity.y, entity.vx, entity.vy, entity.sigma].every(Number.isFinite));
  }
  const restored = restoreSimulation(sim.snapshot());
  sim.step(10);
  restored.step(10);
  assert.deepEqual(restored.snapshot(), sim.snapshot());
});

test('all presets initialize valid quantum cosmos states and fields', () => {
  for (const preset of Object.keys(PRESETS)) {
    const sim = createSimulation({ preset, seed: 1234 });
    const frame = sim.frame();
    assert.equal(frame.settings.preset, preset);
    assert.equal(frame.entities.length, frame.settings.population);
    assert.equal(frame.field.density.length, frame.settings.n ** 2);
    if (frame.settings.population > 0) {
      assert.ok(frame.field.density.some(v => v > 0), `field has non-zero density for ${preset}`);
    } else {
      assert.ok(frame.field.density.every(v => v === 0), `blank preset starts with vacuum field`);
    }
  }
});

test('deterministic replay and snapshot restoration match uninterrupted evolution', () => {
  const a = createSimulation({ preset: 'primordial-soup', seed: 2026 });
  a.step(25);
  const snap = a.snapshot();
  validateSnapshot(snap);

  const b = restoreSimulation(snap);
  a.step(20);
  b.step(20);

  const frameA = a.frame();
  const frameB = b.frame();

  assert.equal(frameA.stepIndex, frameB.stepIndex);
  assert.deepEqual(frameA.metrics, frameB.metrics);
  for (let i = 0; i < frameA.entities.length; i++) {
    assert.equal(frameA.entities[i].x, frameB.entities[i].x);
    assert.equal(frameA.entities[i].y, frameB.entities[i].y);
    assert.equal(frameA.entities[i].sigma, frameB.entities[i].sigma);
    assert.equal(frameA.entities[i].causalDepth, frameB.entities[i].causalDepth);
  }
});

test('v2 snapshots migrate both spinner types and other species without treating Anchors as photons', () => {
  const original = createSimulation({ preset: 'primordial-soup', seed: 2026 });
  original.step(5);
  const snapshot = original.snapshot();
  assert.equal(snapshot.solver, 'kyonami-cosmos-f64-3');
  const entities = snapshot.entities.slice(0, 5).map((entity, flavor) => ({ ...entity, flavor }));
  for (const solver of ['kyonami-cosmos-f64-2', 'gennami-cosmos-f64-2']) {
    const restored = restoreSimulation({ ...snapshot, solver, entities });
    assert.deepEqual(restored.entities.map(e => e.flavor), [0, 0, 1, 2, 3]);
    assert.deepEqual(restored.entities.map(e => e.spin), [1, -1, 0, 0, 0]);
    assert.deepEqual(restored.entities.map(e => e.mass), [1, 1, 1, 0.5, 3]);
    restored.step(5);
    validateSnapshot(restored.snapshot());
  }
  assert.throws(() => validateSnapshot({ ...snapshot, solver: 'unknown' }), /Unsupported snapshot solver/);
});

test('spawnWave, observer field, and triggerWaveBurst operate cleanly', () => {
  const sim = createSimulation({ preset: 'quantum-foam', population: 24, seed: 77 });
  const spawnedId = sim.spawnWave({ x: 10, y: -8, vx: 5, vy: 3, flavor: 1 });
  assert.equal(sim.selectedId, spawnedId);

  sim.setFieldAction({
    active: true,
    mode: 'observe',
    x: 10,
    y: -8,
    global: false
  });
  sim.step(25);
  assert.ok(sim.metrics().observations > 0, 'observer lens collapses waves within range');

  sim.triggerWaveBurst();
  assert.ok(sim.metrics().reversals > 0, 'wave burst unwinds causal chains radially');
});
