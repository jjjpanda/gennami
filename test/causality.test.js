import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/engine.js';

test('overlapping waves collapse into tighter particles as causal chains lengthen', () => {
  const sim = createSimulation({
    preset: 'soliton-collider',
    seed: 1729,
    coupling: 2.5,
    contagion: 0.8,
    decay: 0.05
  });

  const initialMetrics = sim.metrics();
  assert.ok(initialMetrics.meanCoherence > 0.75, 'starts predominantly as delocalized waves');
  assert.equal(initialMetrics.interactions, 0);

  sim.step(140);

  const afterMetrics = sim.metrics();
  assert.ok(afterMetrics.interactions > 10, 'overlapping waves undergo causal interactions');
  assert.ok(
    afterMetrics.meanCausalDepth > initialMetrics.meanCausalDepth + 0.5,
    'causal chains lengthen across interacting entities'
  );
  assert.ok(
    afterMetrics.meanSigma < initialMetrics.meanSigma,
    'spatial uncertainty sigma contracts as causal depth increases'
  );
  assert.ok(
    afterMetrics.meanCoherence < initialMetrics.meanCoherence,
    'wave coherence decreases as entities condense toward particles'
  );
});

test('contagious classicality: touching a high-causal-depth particle collapses a wave faster', () => {
  const simLow = createSimulation({ preset: 'primordial-soup', population: 12, seed: 42 });
  const simHigh = createSimulation({ preset: 'primordial-soup', population: 12, seed: 42 });

  const waveLow = simLow.entities[0];
  const partnerLow = simLow.entities[1];
  waveLow.causalDepth = 0;
  waveLow.sigma = simLow.settings.sigmaMax;
  waveLow.coherence = 1;
  partnerLow.causalDepth = 0;

  const waveHigh = simHigh.entities[0];
  const partnerHigh = simHigh.entities[1];
  waveHigh.causalDepth = 0;
  waveHigh.sigma = simHigh.settings.sigmaMax;
  waveHigh.coherence = 1;
  partnerHigh.causalDepth = 12;

  simLow.collapsePair(waveLow, partnerLow, 0.8, new Map());
  simHigh.collapsePair(waveHigh, partnerHigh, 0.8, new Map());

  assert.ok(
    waveHigh.causalDepth > waveLow.causalDepth,
    'interacting with a long-causal-chain partner imparts greater causal depth'
  );
  assert.ok(
    waveHigh.sigma < waveLow.sigma,
    'wave collapses to a smaller spatial uncertainty when touching a classicalized partner'
  );
});

test('probabilistic positional jump diminishes as causal chain lengthens', () => {
  const sim = createSimulation({ preset: 'primordial-soup', population: 12, seed: 99 });
  const a = sim.entities[0];
  const b = sim.entities[1];

  // Case 1: Pure delocalized wave (coherence = 1, causalDepth = 0)
  a.x = -10;
  a.y = 0;
  a.causalDepth = 0;
  a.sigma = sim.settings.sigmaMax;
  a.coherence = 1;

  b.x = 10;
  b.y = 0;
  b.causalDepth = 5;
  b.sigma = sim.targetSigma(5);
  b.coherence = sim.coherenceOf(b.sigma);

  sim.collapsePair(a, b, 0.7, new Map());
  const waveJump = Math.hypot(a.x - -10, a.y - 0);

  // Case 2: Classicalized particle with long causal chain (coherence ~ 0, causalDepth = 20)
  a.x = -10;
  a.y = 0;
  a.causalDepth = 20;
  a.sigma = sim.targetSigma(20);
  a.coherence = sim.coherenceOf(a.sigma);

  sim.collapsePair(a, b, 0.7, new Map());
  const particleJump = Math.hypot(a.x - -10, a.y - 0);

  assert.ok(
    waveJump > particleJump * 5,
    `expected delocalized wave jump (${waveJump}) >> classical particle jump (${particleJump})`
  );
});

test('isolation decay and press-and-hold causal reversal restore wave uncertainty', () => {
  const sim = createSimulation({
    preset: 'causal-crystal',
    seed: 1729,
    coupling: 0,
    decay: 0.8
  });

  const startMetrics = sim.metrics();
  assert.ok(startMetrics.meanCausalDepth > 4, 'causal-crystal preset starts with deep causal chains');

  // 1. Test press-and-hold local causal reversal field at (0, 0)
  sim.setFieldAction({
    active: true,
    mode: 'reverse',
    x: 0,
    y: 0,
    global: false
  });
  sim.step(35);

  const afterReversal = sim.metrics();
  assert.ok(
    afterReversal.meanCausalDepth < startMetrics.meanCausalDepth * 0.6,
    'press-and-hold reversal unwinds causal depth'
  );
  assert.ok(
    afterReversal.meanCoherence > startMetrics.meanCoherence + 0.15,
    'press-and-hold reversal expands particles back into coherent waves'
  );
  assert.ok(afterReversal.reversals > 0, 'records reversal events');
});

test('primordial-soup preserves wave coherence until OBSERVE lens actively collapses waves', () => {
  const sim = createSimulation({
    preset: 'primordial-soup',
    seed: 1729
  });

  // After 200 steps of unassisted evolution, the majority of entities remain coherent waves
  sim.step(200);
  const unassisted = sim.metrics();
  assert.ok(
    unassisted.meanCoherence > 0.65,
    `expected primordial-soup to retain high wave coherence (${unassisted.meanCoherence.toFixed(2)})`
  );
  assert.ok(
    unassisted.waveCount > unassisted.particleCount * 3,
    `expected waves (${unassisted.waveCount}) to outnumber particles (${unassisted.particleCount})`
  );

  // Activating the OBSERVE lens at the center decisively collapses nearby waves into particles
  sim.setFieldAction({
    active: true,
    mode: 'observe',
    x: 0,
    y: 0,
    global: false
  });
  sim.step(40);
  const afterObserve = sim.metrics();
  assert.ok(afterObserve.observations > 5, 'observer lens records collapse observations');
  assert.ok(
    afterObserve.meanCausalDepth > unassisted.meanCausalDepth + 0.5,
    'observer lens increases causal depth'
  );
  assert.ok(
    afterObserve.particleCount > unassisted.particleCount,
    'observer lens condenses delocalized waves into classical particles'
  );
});
