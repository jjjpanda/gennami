import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, restoreSimulation, validateSnapshot } from '../src/engine.js';
import { PHOTON, PHOTON_SPEED } from '../src/presets.js';
import { fuseParticles, splitParticle, processReactions } from '../src/sim/reactions.js';

function emit(sim, wave) {
  const id = sim.spawnWave(wave);
  return sim.entities.find(entity => entity.id === id);
}

const mass = sim => sim.entities.reduce((sum, e) => sum + e.mass, 0);
const energy = sim => sim.entities.reduce((sum, e) => sum + e.energy + 0.5 * e.mass * (e.vx ** 2 + e.vy ** 2), 0);
const momentum = sim => sim.entities.reduce(([x, y], e) => [x + e.mass * e.vx, y + e.mass * e.vy], [0, 0]);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);

test('Spinner spin is assigned per entity, seeded, and preserved on restore', () => {
  const a = createSimulation({ preset: 'blank', seed: 1729 });
  const b = createSimulation({ preset: 'blank', seed: 1729 });
  for (let i = 0; i < 40; i++) {
    emit(a, { flavor: 0 });
    emit(b, { flavor: 0 });
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.deepEqual(new Set(a.entities.map(e => e.spin)), new Set([-1, 1]));
  assert.deepEqual(restoreSimulation(a.snapshot()).snapshot(), a.snapshot());
});

test('fusion accounts for mass, momentum, energy, selection, links and emitted photons', () => {
  const sim = createSimulation({ preset: 'blank' });
  const a = emit(sim, { flavor: 0, x: -2, vx: 8 });
  const b = emit(sim, { flavor: 1, x: 2, vx: -4 });
  sim.upsertLink(a, b);
  const before = { mass: mass(sim), energy: energy(sim), momentum: momentum(sim) };
  const product = fuseParticles(sim, a, b);
  near(mass(sim), before.mass);
  near(energy(sim), before.energy);
  momentum(sim).forEach((v, i) => near(v, before.momentum[i]));
  assert.equal(product.constituents.length, 2);
  assert.equal(sim.selectedId, product.id);
  assert.equal(sim.links.length, 0);
  assert.equal(sim.entities.filter(e => e.flavor === PHOTON).length, 2);
  assert.ok(sim.entities.filter(e => e.flavor === PHOTON).every(e => e.coherence === 1));
  assert.equal(sim.frame().selectedInspector.flavorName, 'COMPOSITE');
  assert.equal(product.history.at(-1).kind, 'fusion');
  assert.equal(sim.metrics().fusions, 1);
});

test('opposite Spinner spins attract and matching spins repel within the unified species', () => {
  for (const spin of [-1, 1]) {
    const sim = createSimulation({ preset: 'blank', coupling: 0, decay: 0 });
    const a = emit(sim, { flavor: 0, x: -5, sigma: 2 });
    const b = emit(sim, { flavor: 0, x: 5, sigma: 2 });
    a.spin = 1;
    b.spin = spin;
    for (const entity of sim.entities) {
      entity.causalDepth = 28;
      entity.rng.gaussian = () => 0;
    }
    sim.step(1);
    assert.ok(spin === -1 ? a.vx > 0 && b.vx < 0 : a.vx < 0 && b.vx > 0);
  }
});

test('excited composite fission conserves mass, momentum and reaction energy', () => {
  const sim = createSimulation({ preset: 'blank' });
  const product = fuseParticles(sim, emit(sim, { flavor: 0, vx: 10 }), emit(sim, { flavor: 1, vx: -10 }));
  const before = { mass: mass(sim), energy: energy(sim), momentum: momentum(sim) };
  const fragments = splitParticle(sim, product);
  assert.equal(fragments.length, 2);
  near(mass(sim), before.mass);
  near(energy(sim), before.energy);
  momentum(sim).forEach((v, i) => near(v, before.momentum[i]));
  assert.equal(sim.selectedId, fragments[0].id);
  assert.ok(fragments.every(e => e.energy === 0 && e.history.at(-1).kind === 'fission'));
  const restored = restoreSimulation(sim.snapshot());
  sim.step(60);
  restored.step(60);
  assert.deepEqual(restored.snapshot(), sim.snapshot());
});

test('photon absorption heats and splits an Anchor during time evolution', () => {
  const sim = createSimulation({ preset: 'blank', coupling: 0, decay: 0 });
  const anchor = emit(sim, { flavor: 3, sigma: 2 });
  emit(sim, { flavor: PHOTON, x: -4, vx: PHOTON_SPEED });
  sim.step(1);
  assert.equal(sim.metrics().absorptions, 1);
  assert.equal(sim.metrics().fissions, 1);
  assert.ok(!sim.entities.includes(anchor));
  near(mass(sim), 3);
  assert.deepEqual(sim.entities.filter(e => e.mass > 0).map(e => e.mass), [1.5, 1.5]);
  assert.ok(sim.entities.filter(e => e.mass > 0).every(e => e.history.some(event => event.kind === 'absorb')));
  validateSnapshot(sim.snapshot());
});

test('photons hit the first particle along their path regardless of creation order or direction', () => {
  for (const direction of [-1, 1]) {
    for (const nearFirst of [false, true]) {
      const sim = createSimulation({ preset: 'blank', coupling: 0, decay: 0, dt: 0.08 });
      const positions = nearFirst ? [-4, 1] : [1, -4];
      const targets = positions.map(x => emit(sim, { flavor: 1, x: x * direction, sigma: 1.2 }));
      const first = targets[nearFirst ? 0 : 1];
      const second = targets[nearFirst ? 1 : 0];
      const photon = emit(sim, { flavor: PHOTON, x: -8 * direction, vx: PHOTON_SPEED * direction });
      sim.step(1);

      assert.equal(first.energy, photon.energy);
      assert.equal(second.energy, 0);
      assert.equal(sim.entities.includes(photon), false);
      assert.equal(sim.metrics().absorptions, 1);
      assert.equal(first.history.at(-1).partnerId, photon.id);
      assert.equal(first.history.at(-1).kind, 'absorb');
    }
  }
});

test('photon absorption orders surface contact rather than target centers', () => {
  const sim = createSimulation({ preset: 'blank', coupling: 0 });
  const grazing = emit(sim, { flavor: 1, x: 0, y: 3.4 });
  const direct = emit(sim, { flavor: 1, x: 1, y: 0 });
  const photon = emit(sim, { flavor: PHOTON, x: 2, vx: PHOTON_SPEED });
  photon.previousX = -4;
  photon.previousY = 0;

  processReactions(sim);

  assert.equal(direct.energy, 24);
  assert.equal(grazing.energy, 0);
  assert.equal(sim.metrics().absorptions, 1);
});

test('photon sweeps follow fast moving matter and absorption can trigger fission', () => {
  for (const flavor of [1, 3]) {
    for (const photonFirst of [false, true]) {
      const sim = createSimulation({ preset: 'blank', coupling: 0, decay: 0, dt: 0.08 });
      const waves = [{ flavor, vy: -48 }, { flavor: PHOTON, x: -4, vx: PHOTON_SPEED }];
      if (photonFirst) waves.reverse();
      const entities = waves.map(wave => emit(sim, wave));
      for (const entity of entities) entity.rng.gaussian = () => 0;
      const target = entities.find(e => e.flavor !== PHOTON);
      const photon = entities.find(e => e.flavor === PHOTON);

      sim.step(1);

      assert.ok(target.y < -3.5, 'target finishes outside the stationary photon sweep');
      assert.equal(sim.entities.includes(photon), false);
      assert.equal(sim.metrics().absorptions, 1);
      assert.equal(sim.metrics().fissions, flavor === 3 ? 1 : 0);
      if (flavor === 1) {
        assert.equal(target.energy, photon.energy);
        assert.equal(target.history.at(-1).kind, 'absorb');
      } else {
        assert.ok(sim.entities.filter(e => e.mass > 0).every(e =>
          e.history.some(event => event.kind === 'absorb' && event.partnerId === photon.id)));
      }
      validateSnapshot(sim.snapshot());
    }
  }
});

test('relative photon sweeps reject paths that cross at different times', () => {
  const sim = createSimulation({ preset: 'blank', coupling: 0, decay: 0, dt: 0.08 });
  const target = emit(sim, { flavor: 1, y: 6.8, vy: -48 });
  const photon = emit(sim, { flavor: PHOTON, x: -4, vx: PHOTON_SPEED });
  target.rng.gaussian = () => 0;

  sim.step(1);

  assert.ok(target.y < 3.5, 'final target position lies inside the stationary photon sweep');
  assert.equal(target.energy, 0);
  assert.ok(sim.entities.includes(photon));
  assert.equal(sim.metrics().absorptions, 0);
});

test('relative photon sweeps handle equal displacements and choose earliest moving contact', () => {
  for (const overlap of [false, true]) {
    const sim = createSimulation({ preset: 'blank', coupling: 0 });
    const target = emit(sim, { flavor: 1, x: overlap ? 2 : 4 });
    const photon = emit(sim, { flavor: PHOTON, vx: PHOTON_SPEED });
    for (const entity of [target, photon]) {
      entity.previousX = entity.x;
      entity.previousY = entity.y;
      entity.x += 6;
    }
    processReactions(sim);
    assert.equal(target.energy, overlap ? 24 : 0);
    assert.equal(sim.entities.includes(photon), !overlap);
  }

  for (const earlyFirst of [false, true]) {
    const sim = createSimulation({ preset: 'blank', coupling: 0 });
    const waves = [{ flavor: 1, x: 0 }, { flavor: 1, x: 1, y: 6 }];
    if (!earlyFirst) waves.reverse();
    const targets = waves.map(wave => emit(sim, wave));
    const early = targets[earlyFirst ? 0 : 1];
    const late = targets[earlyFirst ? 1 : 0];
    const photon = emit(sim, { flavor: PHOTON, x: 2, vx: PHOTON_SPEED });
    photon.previousX = -4;
    photon.previousY = 0;
    early.previousX = early.x;
    early.previousY = early.y;
    early.y = -4;
    late.previousX = late.x;
    late.previousY = late.y;
    late.y = 0;

    processReactions(sim);

    assert.equal(early.energy, 24);
    assert.equal(late.energy, 0);
    assert.equal(sim.metrics().absorptions, 1);
  }
});

test('photon swept collisions handle initial overlap and reject targets outside the segment', () => {
  for (const [previousX, x, targetX, targetY, hit] of [
    [0, 0, 0, 0, true],
    [0, 0, 5, 0, false],
    [0, 6, 0, 0, true],
    [0, 6, -4, 0, false],
    [0, 6, 10, 0, false],
    [0, 6, 3, 4, false],
    [0, 6, 3, 3.5, false]
  ]) {
    const sim = createSimulation({ preset: 'blank', coupling: 0 });
    const target = emit(sim, { flavor: 1, x: targetX, y: targetY });
    const photon = emit(sim, { flavor: PHOTON, x, vx: PHOTON_SPEED });
    photon.previousX = previousX;
    photon.previousY = 0;

    processReactions(sim);

    assert.equal(target.energy, hit ? 24 : 0);
    assert.equal(sim.entities.includes(photon), !hit);
  }
});

test('close localized collisions automatically fuse; cooldown prevents immediate fission', () => {
  const sim = createSimulation({ preset: 'blank', decay: 0 });
  emit(sim, { flavor: 1, x: -2, vx: 8, sigma: 1.2 });
  emit(sim, { flavor: 1, x: 2, vx: -8, sigma: 1.2 });
  sim.step(1);
  assert.equal(sim.metrics().fusions, 1);
  assert.equal(sim.metrics().fissions, 0);
  sim.step(50);
  assert.ok(sim.metrics().fissions >= 1);
});

test('photons stay massless and keep fixed speed and energy through rim reflections and reversal', () => {
  const sim = createSimulation({ preset: 'blank' });
  const photon = emit(sim, { flavor: PHOTON, x: 100, vx: 5, vy: 2 });
  sim.setFieldAction({ active: true, mode: 'observe', global: true });
  sim.step(400);
  near(Math.hypot(photon.vx, photon.vy), PHOTON_SPEED);
  assert.equal(photon.mass, 0);
  assert.equal(photon.energy, 24);
  assert.equal(photon.causalDepth, 0);
  assert.equal(sim.links.length, 0);
  assert.ok(Math.hypot(photon.x, photon.y) <= sim.settings.worldRadius);
  sim.triggerWaveBurst();
  near(Math.hypot(photon.vx, photon.vy), PHOTON_SPEED);
});

test('manual and preset photons start as coherent waves and interfere by phase', () => {
  const preset = createSimulation({ preset: 'primordial-soup' });
  assert.ok(preset.entities.some(e => e.flavor === PHOTON));
  assert.ok(preset.entities.filter(e => e.flavor === PHOTON).every(e => e.coherence === 1));

  const sim = createSimulation({ preset: 'blank' });
  const a = emit(sim, { flavor: PHOTON, vx: PHOTON_SPEED });
  const b = emit(sim, { flavor: PHOTON, vx: PHOTON_SPEED });
  assert.equal(a.sigma, sim.settings.sigmaMax);
  assert.equal(a.coherence, 1);
  a.phase = b.phase = 0;
  sim.synthesizeField();
  const constructive = sim.fieldDensity.reduce((sum, value) => sum + value, 0);
  assert.ok(constructive > 0);
  assert.ok(sim.fieldDensity.filter(value => value > 0.001).length > 20);
  b.phase = Math.PI;
  sim.synthesizeField();
  const destructive = sim.fieldDensity.reduce((sum, value) => sum + value, 0);
  assert.ok(destructive < constructive * 1e-10);

  const localized = emit(sim, { flavor: PHOTON, sigma: sim.settings.sigmaMin });
  assert.equal(localized.coherence, 0);
});

test('observation decoheres photons and reversal restores spread without changing their motion or energy', () => {
  const sim = createSimulation({ preset: 'blank', decay: 0 });
  const photon = emit(sim, { flavor: PHOTON, x: 10, vx: PHOTON_SPEED });
  sim.applyObservationField(10, 0, 50, 1);
  assert.ok(photon.causalDepth > 0);
  assert.ok(photon.coherence < 1);
  assert.ok(photon.sigma < sim.settings.sigmaMax);
  assert.equal(photon.history.at(-1).kind, 'observe');
  assert.equal(sim.metrics().observations, 1);
  const { sigma, vx, vy } = photon;
  sim.triggerWaveBurst();
  assert.ok(photon.sigma > sigma);
  assert.equal(photon.vx, vx);
  assert.equal(photon.vy, vy);
  assert.equal(photon.energy, 24);
  assert.equal(photon.mass, 0);
  assert.equal(sim.links.length, 0);
});

test('decohered photons spread in isolation and replay deterministically after restoration', () => {
  const sim = createSimulation({ preset: 'blank', decay: 2 });
  const photon = emit(sim, { flavor: PHOTON, vx: PHOTON_SPEED });
  sim.applyObservationField(0, 0, 50, 1);
  const sigma = photon.sigma;
  const depth = photon.causalDepth;
  const restored = restoreSimulation(sim.snapshot());
  sim.step(200);
  restored.step(200);
  assert.ok(photon.sigma > sigma);
  assert.ok(photon.causalDepth < depth);
  near(Math.hypot(photon.vx, photon.vy), PHOTON_SPEED);
  assert.deepEqual(restored.snapshot(), sim.snapshot());
});

test('overlapping matter decoheres photons without bonds, radiation pressure or infinite massless acceleration', () => {
  for (const photonFirst of [false, true]) {
    const sim = createSimulation({ preset: 'blank', coupling: 4, decay: 0, dt: 0.08 });
    const waves = [{ flavor: 1 }, { flavor: PHOTON, x: 10, vy: PHOTON_SPEED }];
    if (photonFirst) waves.reverse();
    const entities = waves.map(wave => emit(sim, wave));
    for (const entity of entities) {
      entity.rng.next = () => 0;
      entity.rng.gaussian = () => 0;
    }
    const photon = entities.find(e => e.flavor === PHOTON);
    const matter = entities.find(e => e.flavor !== PHOTON);
    sim.step(1);
    assert.ok(sim.entities.includes(photon));
    assert.ok(photon.coherence < 1);
    assert.ok(photon.causalDepth > 0);
    assert.equal(photon.history.at(-1).kind, 'collapse');
    near(Math.hypot(photon.vx, photon.vy), PHOTON_SPEED);
    assert.equal(matter.vx, 0);
    assert.equal(matter.vy, 0);
    assert.equal(sim.links.length, 0);
    validateSnapshot(sim.snapshot());
  }
});

test('cold matter and elementary light particles do not split', () => {
  const sim = createSimulation({ preset: 'blank' });
  const anchor = emit(sim, { flavor: 3 });
  assert.deepEqual(splitParticle(sim, anchor), []);
  const binder = emit(sim, { flavor: 1 });
  binder.energy = 100;
  assert.deepEqual(splitParticle(sim, binder), []);
  processReactions(sim);
  assert.equal(sim.metrics().fissions, 0);
});

test('reactions at capacity defer without deleting matter or energy', () => {
  const sim = createSimulation({ preset: 'blank' });
  for (let i = 0; i < 144; i++) emit(sim, { flavor: 3 });
  sim.entities[0].energy = 100;
  const before = sim.snapshot();
  assert.deepEqual(splitParticle(sim, sim.entities[0]), []);
  assert.equal(fuseParticles(sim, sim.entities[0], sim.entities[1]), null);
  assert.deepEqual(sim.snapshot(), before);
});

test('snapshot validation rejects corrupt mass, spin, composition and energy', () => {
  const sim = createSimulation({ preset: 'blank' });
  emit(sim, { flavor: 0 });
  for (const properties of [{ mass: 5 }, { spin: 0 }, { energy: -1 }, { constituents: [] }]) {
    const snapshot = sim.snapshot();
    Object.assign(snapshot.entities[0], properties);
    assert.throws(() => validateSnapshot(snapshot), /particle/);
  }
});
