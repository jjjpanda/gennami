import { Random, deriveSeed } from './random.js';
import { FLAVORS, PHOTON, PHOTON_SPEED, PRESETS, SOLVER_VERSION, normalizeSettings, clamp } from '../presets.js';
import { particleProperties, processReactions } from './reactions.js';
import { integrateMotion } from './motion.js';

// Classical orbital equilibrium distances and interaction affinities between flavors.
// Spinner interactions additionally depend on each entity's assigned spin.
const EQUILIBRIUM_DIST = [
  [12.5, 8.8, 14, 11],
  [8.8, 10.5, 13, 10],
  [14, 13, 16, 15],
  [11, 10, 15, 18]
];

const AFFINITY = [
  [-0.35, 0.85, 0.15, 0.95],
  [0.85, 0.45, 0.25, 0.9],
  [0.15, 0.25, -0.2, 0.2],
  [0.95, 0.9, 0.2, -0.15]
];

export class QuantumCosmos {
  constructor(options = {}) {
    this.settings = normalizeSettings(options);
    this.resetState();
    this.initializePreset();
  }

  resetState() {
    this.stepIndex = 0;
    this.time = 0;
    this.nextEntityId = 1;
    this.nextEventId = 1;
    this.rng = new Random(this.settings.seed);
    this.entities = [];
    this.links = [];
    this.ripples = [];
    this.selectedId = null;
    this.fieldAction = {
      active: false,
      mode: 'reverse',
      x: 0,
      y: 0,
      holdTime: 0,
      radius: 50,
      global: false
    };
    this.totals = {
      interactions: 0,
      reversals: 0,
      observations: 0,
      fusions: 0,
      fissions: 0,
      absorptions: 0
    };

    const n = this.settings.n;
    this.fieldDensity = new Float32Array(n * n);
    this.fieldPhase = new Float32Array(n * n);
    this.fieldFlavor = new Float32Array(n * n);
    this.fieldRe = new Float64Array(n * n);
    this.fieldIm = new Float64Array(n * n);
  }

  targetSigma(causalDepth) {
    const { sigmaMin, sigmaMax } = this.settings;
    return sigmaMin + (sigmaMax - sigmaMin) / (1 + 0.32 * Math.max(0, causalDepth));
  }

  coherenceOf(sigma) {
    const { sigmaMin, sigmaMax } = this.settings;
    return clamp((sigma - sigmaMin) / Math.max(0.001, sigmaMax - sigmaMin), 0, 1);
  }

  initializePreset() {
    const { preset, population, worldRadius, sigmaMin, sigmaMax } = this.settings;
    const rMax = worldRadius * 0.82;

    if (preset === 'blank' || population <= 0) {
      this.selectedId = null;
      this.synthesizeField();
      return;
    }

    for (let i = 0; i < population; i++) {
      let flavor = i % FLAVORS.length;
      let x = 0;
      let y = 0;
      let vx = 0;
      let vy = 0;
      let causalDepth = 0;
      let sigma = sigmaMax;

      if (preset === 'soliton-collider') {
        const side = i % 2 === 0 ? -1 : 1;
        const band = Math.floor(i / 2);
        const spread = ((band % 6) - 2.5) * 6.2;
        const layer = Math.floor(band / 6) * 8.5;
        flavor = band % 3 === 0 ? 1 : 0;
        x = side * (30 + layer) + this.rng.range(-2.2, 2.2);
        y = spread + side * 3.5 + this.rng.range(-1.8, 1.8);
        vx = -side * this.rng.range(11.5, 15.5);
        vy = -side * 1.4 + this.rng.range(-1.2, 1.2);
        causalDepth = this.rng.range(0, 0.3);
        sigma = this.targetSigma(causalDepth);
      } else if (preset === 'causal-crystal') {
        if (i < Math.floor(population * 0.72)) {
          const ring = i < 6 ? 0 : i < 18 ? 1 : 2;
          const countInRing = ring === 0 ? 6 : ring === 1 ? 12 : Math.floor(population * 0.72) - 18;
          const idxInRing = ring === 0 ? i : ring === 1 ? i - 6 : i - 18;
          const radius = ring === 0 ? 9 : ring === 1 ? 20 : 32;
          const angle = (idxInRing / Math.max(1, countInRing)) * Math.PI * 2 + ring * 0.35;
          x = Math.cos(angle) * radius + this.rng.range(-1.0, 1.0);
          y = Math.sin(angle) * radius + this.rng.range(-1.0, 1.0);
          const speed = 2.0 + ring * 0.85;
          vx = -Math.sin(angle) * speed;
          vy = Math.cos(angle) * speed;
          causalDepth = this.rng.range(6.8, 11.5);
          sigma = this.targetSigma(causalDepth);
        } else {
          const haloCount = Math.max(1, population - Math.floor(population * 0.72));
          const haloIdx = i - Math.floor(population * 0.72);
          const angle = (haloIdx / haloCount) * Math.PI * 2 + this.rng.range(-0.12, 0.12);
          const radius = this.rng.range(54, worldRadius * 0.76);
          x = Math.cos(angle) * radius;
          y = Math.sin(angle) * radius;
          const speed = this.rng.range(3.2, 5.8);
          vx = Math.sin(angle) * speed;
          vy = -Math.cos(angle) * speed;
          causalDepth = 0;
          sigma = sigmaMax * 0.92;
        }
      } else if (preset === 'binary-vortex') {
        const clusterPop = Math.floor(population * 0.66);
        if (i < clusterPop) {
          const lobe = i % 2 === 0 ? -1 : 1;
          const idxInLobe = Math.floor(i / 2);
          const lobeTotal = Math.max(1, Math.ceil(clusterPop / 2));
          const cx = lobe * 30;
          const cy = lobe * 6;
          const ringR = idxInLobe < 5 ? 6.5 : 14.5;
          const ang = (idxInLobe / lobeTotal) * Math.PI * 4 + lobe * 0.4;
          x = cx + Math.cos(ang) * ringR + this.rng.range(-1.0, 1.0);
          y = cy + Math.sin(ang) * ringR + this.rng.range(-1.0, 1.0);
          // Orbital motion of the binary lobes around (0,0) + internal spin
          const lobeVx = -lobe * 1.2;
          const lobeVy = lobe * 4.6;
          vx = lobeVx - Math.sin(ang) * 1.8;
          vy = lobeVy + Math.cos(ang) * 1.8;
          flavor = idxInLobe % 3 === 0 ? 1 : 0;
          causalDepth = this.rng.range(4.2, 8.2);
          sigma = this.targetSigma(causalDepth);
        } else {
          // Delocalized Chronon/wave tidal bridge & outer envelope
          const bridgeIdx = i - clusterPop;
          const bridgeTotal = Math.max(1, population - clusterPop);
          const angle = (bridgeIdx / bridgeTotal) * Math.PI * 2;
          const radius = bridgeIdx % 3 === 0 ? this.rng.range(8, 24) : this.rng.range(52, rMax);
          x = Math.cos(angle) * radius;
          y = Math.sin(angle) * radius * 0.78;
          const speed = 3.0 + (radius / rMax) * 2.5;
          vx = -Math.sin(angle) * speed;
          vy = Math.cos(angle) * speed;
          flavor = bridgeIdx % 2 === 0 ? 1 : 0;
          causalDepth = this.rng.range(0, 0.4);
          sigma = this.targetSigma(causalDepth);
        }
      } else if (preset === 'resonant-rings') {
        const shell = i % 3;
        const idxInShell = Math.floor(i / 3);
        const shellCount = Math.max(1, Math.ceil(population / 3));
        const baseRadius = shell === 0 ? rMax * 0.28 : shell === 1 ? rMax * 0.56 : rMax * 0.82;
        const angle = (idxInShell / shellCount) * Math.PI * 2 + shell * (Math.PI / shellCount);
        const radialWave = Math.sin(angle * 3) * 3.2;
        const radius = baseRadius + radialWave;
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius;
        const dir = shell === 1 ? -1 : 1;
        const speed = (2.8 + shell * 1.15) * dir;
        vx = -Math.sin(angle) * speed;
        vy = Math.cos(angle) * speed;
        flavor = shell === 2 ? 1 : 0;
        causalDepth = shell === 0 ? this.rng.range(0.6, 1.4) : this.rng.range(0.05, 0.35);
        sigma = this.targetSigma(causalDepth);
      } else if (preset === 'quantum-foam') {
        // Multi-cell counter-rotating probability eddies
        const cellAngle = (i / population) * Math.PI * 2;
        const band = (i % 4) / 3;
        const radius = (0.24 + 0.68 * Math.sqrt((i + 0.5) / population)) * (worldRadius * 0.74);
        x = Math.cos(cellAngle * 2.0 + band) * radius;
        y = Math.sin(cellAngle * 2.0 + band) * radius;
        const eddySign = i % 2 === 0 ? 1 : -1;
        const speed = this.rng.range(2.2, 5.2);
        const dir = Math.atan2(y, x) + eddySign * Math.PI * 0.5 + this.rng.range(-0.35, 0.35);
        vx = Math.cos(dir) * speed;
        vy = Math.sin(dir) * speed;
        causalDepth = this.rng.range(0, 0.15);
        sigma = this.targetSigma(causalDepth);
      } else {
        // 'primordial-soup': dual-arm logarithmic wave spiral with gentle counter-shear
        const arm = i % 2;
        const armIdx = Math.floor(i / 2);
        const armTotal = Math.max(1, Math.ceil(population / 2));
        const frac = (armIdx + 0.35) / armTotal;
        const radius = (0.14 + 0.82 * Math.sqrt(frac)) * (worldRadius * 0.78);
        const spiralTheta = arm * Math.PI + frac * Math.PI * 2.6 + this.rng.range(-0.18, 0.18);
        x = Math.cos(spiralTheta) * radius;
        y = Math.sin(spiralTheta) * radius;
        const orbitalSpeed = 3.2 + 2.4 * (radius / rMax);
        const inward = Math.sin(frac * Math.PI * 2) * 0.8;
        vx = -Math.sin(spiralTheta) * orbitalSpeed + Math.cos(spiralTheta) * inward;
        vy = Math.cos(spiralTheta) * orbitalSpeed + Math.sin(spiralTheta) * inward;
        causalDepth = i < 4 ? this.rng.range(0.7, 1.5) : this.rng.range(0, 0.22);
        sigma = clamp(this.targetSigma(causalDepth), sigmaMin, sigmaMax);
      }

      const id = this.nextEntityId++;
      this.entities.push({
        id,
        flavor,
        ...particleProperties(flavor, this.rng),
        x,
        y,
        vx,
        vy,
        sigma,
        phase: this.rng.range(-Math.PI, Math.PI),
        causalDepth,
        coherence: this.coherenceOf(sigma),
        interactionCount: causalDepth > 1 ? Math.round(causalDepth) : 0,
        lastInteractionTime: causalDepth > 1 ? 0 : -10,
        rng: new Random(deriveSeed(this.settings.seed, id)),
        history: [],
        trail: [[x, y]]
      });
    }

    for (const e of this.entities) {
      if (e.flavor === PHOTON) {
        const angle = Math.atan2(e.vy, e.vx);
        e.vx = Math.cos(angle) * PHOTON_SPEED;
        e.vy = Math.sin(angle) * PHOTON_SPEED;
        e.sigma = sigmaMax;
        e.coherence = 1;
        e.causalDepth = 0;
        e.interactionCount = 0;
        e.lastInteractionTime = -10;
      }
    }

    if (preset === 'causal-crystal' || preset === 'binary-vortex') {
      this.seedCrystalLinks();
    }

    this.selectedId = this.entities[0]?.id ?? null;
    this.synthesizeField();
  }

  seedCrystalLinks() {
    for (let i = 0; i < this.entities.length; i++) {
      const a = this.entities[i];
      if (a.causalDepth < 3) continue;
      for (let j = i + 1; j < this.entities.length; j++) {
        const b = this.entities[j];
        if (b.causalDepth < 3) continue;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d < 16) {
          this.upsertLink(a, b, 0.85);
          a.history.push({
            id: this.nextEventId++,
            step: 0,
            time: 0,
            kind: 'collapse',
            partnerId: b.id,
            partnerFlavor: b.flavor,
            x: a.x,
            y: a.y,
            prevX: a.x + (a.rng.next() - 0.5) * 8,
            prevY: a.y + (a.rng.next() - 0.5) * 8,
            prevSigma: this.settings.sigmaMax * 0.75,
            newSigma: a.sigma,
            prevDepth: Math.max(0, a.causalDepth - 2.2),
            newDepth: a.causalDepth,
            probability: 0.72
          });
        }
      }
    }
  }

  upsertLink(a, b, boost = 0.5) {
    if (a.flavor === PHOTON || b.flavor === PHOTON) return null;
    const lo = Math.min(a.id, b.id);
    const hi = Math.max(a.id, b.id);
    let link = this.links.find(l => l.a === lo && l.b === hi);
    if (!link) {
      link = {
        a: lo,
        b: hi,
        strength: clamp(boost, 0.1, 1),
        born: this.time,
        lastPulse: this.time,
        interactions: 1
      };
      this.links.push(link);
    } else {
      link.strength = clamp(link.strength + boost * 0.65, 0.1, 1);
      link.lastPulse = this.time;
      link.interactions++;
    }
    return link;
  }

  recordEvent(entity, event) {
    entity.history.push({
      id: this.nextEventId++,
      step: this.stepIndex,
      time: this.time,
      ...event
    });
    if (entity.history.length > 24) {
      entity.history.shift();
    }
  }

  addRipple(x, y, fromSigma, toSigma, flavor, kind = 'collapse') {
    this.ripples.push({
      x,
      y,
      fromSigma,
      toSigma,
      flavor,
      kind,
      age: 0,
      maxAge: kind === 'reverse' ? 0.95 : 0.85
    });
    if (this.ripples.length > 36) {
      this.ripples.shift();
    }
  }

  setFieldAction(action = {}) {
    const wasActive = this.fieldAction.active;
    this.fieldAction = {
      ...this.fieldAction,
      ...action
    };
    if (!this.fieldAction.active) {
      this.fieldAction.holdTime = 0;
    } else if (!wasActive) {
      this.fieldAction.holdTime = 0.01;
    }
  }

  selectEntity(id) {
    if (id === null || this.entities.some(e => e.id === id)) {
      this.selectedId = id;
    }
  }

  findNearestEntity(x, y, maxDist = 24) {
    let best = null;
    let bestDist = maxDist;
    for (const e of this.entities) {
      const d = Math.hypot(e.x - x, e.y - y);
      const effectiveDist = Math.max(0, d - e.sigma * 0.35);
      if (effectiveDist < bestDist) {
        bestDist = effectiveDist;
        best = e;
      }
    }
    return best;
  }

  createEntity({ x = 0, y = 0, vx = 0, vy = 0, flavor = null, sigma = null } = {}) {
    const { sigmaMin, sigmaMax, worldRadius } = this.settings;
    const id = this.nextEntityId++;
    const chosenFlavor = flavor !== null && FLAVORS[flavor] ? flavor : id % FLAVORS.length;
    const initialSigma = sigma !== null ? clamp(sigma, sigmaMin, sigmaMax) : sigmaMax;
    const properties = particleProperties(chosenFlavor, this.rng);
    if (chosenFlavor === PHOTON) {
      const angle = vx || vy ? Math.atan2(vy, vx) : this.rng.range(-Math.PI, Math.PI);
      vx = Math.cos(angle) * PHOTON_SPEED;
      vy = Math.sin(angle) * PHOTON_SPEED;
    }

    const maxR = Math.max(10, worldRadius - initialSigma * 0.65);
    const dist = Math.hypot(x, y);
    const clampedX = dist > maxR ? (x / dist) * maxR : x;
    const clampedY = dist > maxR ? (y / dist) * maxR : y;

    const entity = {
      id,
      flavor: chosenFlavor,
      ...properties,
      x: clampedX,
      y: clampedY,
      vx: chosenFlavor === PHOTON ? vx : clamp(vx, -48, 48),
      vy: chosenFlavor === PHOTON ? vy : clamp(vy, -48, 48),
      sigma: initialSigma,
      phase: this.rng.range(-Math.PI, Math.PI),
      causalDepth: 0,
      coherence: this.coherenceOf(initialSigma),
      interactionCount: 0,
      lastInteractionTime: -10,
      rng: new Random(deriveSeed(this.settings.seed, id)),
      history: [],
      trail: [[clampedX, clampedY]]
    };

    return entity;
  }

  spawnWave(wave = {}) {
    const entity = this.createEntity(wave);
    if (this.entities.length >= Math.max(this.settings.population + 24, 144)) {
      const removed = this.entities.shift();
      if (removed) {
        this.links = this.links.filter(l => l.a !== removed.id && l.b !== removed.id);
      }
    }

    this.entities.push(entity);
    this.selectedId = entity.id;
    this.addRipple(entity.x, entity.y, this.settings.sigmaMin, entity.sigma, entity.flavor, 'spawn');
    this.synthesizeField();
    return entity.id;
  }

  triggerWaveBurst() {
    // Unwinds a surge of causal energy from the center, expanding clustered particles into fresh waves
    this.applyReversalField(0, 0, this.settings.worldRadius * 1.25, 0.35, true);
    this.synthesizeField();
  }

  applyReversalField(cx, cy, radius, dt, isBurst = false) {
    const { sigmaMin, sigmaMax } = this.settings;
    const affectedIds = new Set();

    for (const e of this.entities) {
      const dx = e.x - cx;
      const dy = e.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;

      const falloff = isBurst ? 1 : Math.pow(1 - dist / Math.max(1, radius), 0.65);
      const rate = (isBurst ? 16 : 9.0) * falloff * dt;
      const prevDepth = e.causalDepth;
      const prevSigma = e.sigma;

      // Pop causal chain records and gently pull entity back toward its pre-collapse uncertainty & position
      if (e.history.length > 0 && (isBurst || e.rng.next() < clamp(rate * 1.4, 0.15, 0.95))) {
        const lastEvent = e.history.pop();
        if (lastEvent && Number.isFinite(lastEvent.prevX)) {
          const pull = clamp(0.28 * falloff, 0.05, 0.4);
          e.x += (lastEvent.prevX - e.x) * pull;
          e.y += (lastEvent.prevY - e.y) * pull;
        }
      }

      e.causalDepth = Math.max(0, e.causalDepth - rate * (1.45 + e.causalDepth * 0.45));
      const targetSig = this.targetSigma(e.causalDepth);
      e.sigma = clamp(e.sigma + (targetSig - e.sigma) * clamp(rate * 1.25, 0.15, 0.85), sigmaMin, sigmaMax);
      e.coherence = this.coherenceOf(e.sigma);

      // Gentle radial wave-dispersion outward so dissolved clusters blossom into interfering wavepackets
      if (dist > 0.5 && e.flavor !== PHOTON) {
        const push = (isBurst ? 6.5 : 8.5 * dt) * falloff * e.coherence;
        e.vx += (dx / dist) * push + e.rng.gaussian() * 0.6 * dt;
        e.vy += (dy / dist) * push + e.rng.gaussian() * 0.6 * dt;
      }

      if (prevDepth > 0.6 && e.causalDepth < prevDepth - 0.15) {
        affectedIds.add(e.id);
        this.totals.reversals++;
        if (isBurst || this.stepIndex % 6 === 0) {
          this.addRipple(e.x, e.y, prevSigma, e.sigma, e.flavor, 'reverse');
        }
      }
    }

    if (affectedIds.size > 0) {
      for (let i = this.links.length - 1; i >= 0; i--) {
        const l = this.links[i];
        if (affectedIds.has(l.a) || affectedIds.has(l.b)) {
          l.strength -= isBurst ? 0.9 : 2.8 * dt;
          if (l.strength <= 0.05) {
            this.links.splice(i, 1);
          }
        }
      }
    }
  }

  applyObservationField(cx, cy, radius, dt) {
    const { sigmaMin, sigmaMax } = this.settings;
    const observed = [];
    for (const e of this.entities) {
      const dist = Math.hypot(e.x - cx, e.y - cy);
      if (dist > radius + e.sigma * 0.5) continue;

      const falloff = Math.max(0, 1 - dist / Math.max(1, radius + e.sigma * 0.5));
      const overlap = Math.exp(-(dist * dist) / (2 * (radius * 0.65 + e.sigma) ** 2));
      const prob = 1 - Math.exp(-11.0 * Math.max(overlap, falloff * 0.65) * dt);
      if (e.rng.next() < prob) {
        const prevX = e.x;
        const prevY = e.y;
        const prevSigma = e.sigma;
        const prevDepth = e.causalDepth;
        const q = e.coherence;

        // Collapse wave position toward a sampled point within its current wavepacket near the observer lens
        const sampleSpread = e.sigma * 0.36 * q;
        const weightObs = (e.sigma * e.sigma) / (e.sigma * e.sigma + radius * radius * 0.45);
        const meanX = e.x + (cx - e.x) * weightObs * 0.5 * q;
        const meanY = e.y + (cy - e.y) * weightObs * 0.5 * q;
        e.x = meanX + e.rng.gaussian() * sampleSpread;
        e.y = meanY + e.rng.gaussian() * sampleSpread;

        e.causalDepth = Math.min(28, e.causalDepth + 2.6 + 0.42 * e.causalDepth);
        e.sigma = clamp(this.targetSigma(e.causalDepth), sigmaMin, sigmaMax);
        e.coherence = this.coherenceOf(e.sigma);
        e.interactionCount++;
        e.lastInteractionTime = this.time;
        this.totals.observations++;
        this.totals.interactions++;
        observed.push(e);

        this.recordEvent(e, {
          kind: 'observe',
          partnerId: 0,
          partnerFlavor: -1,
          x: e.x,
          y: e.y,
          prevX,
          prevY,
          prevSigma,
          newSigma: e.sigma,
          prevDepth,
          newDepth: e.causalDepth,
          probability: clamp(overlap, 0.05, 0.99)
        });
        if (prevSigma - e.sigma > 0.65 || this.stepIndex % 6 === 0) {
          this.addRipple(e.x, e.y, prevSigma, e.sigma, e.flavor, 'collapse');
        }
      }
    }

    for (let i = 0; i < observed.length; i++) {
      for (let j = i + 1; j < observed.length; j++) {
        const a = observed[i];
        const b = observed[j];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 26) {
          this.upsertLink(a, b, 0.55);
        }
      }
    }
  }

  update(nextSettings = {}) {
    const prevPop = this.settings.population;
    const prevPreset = this.settings.preset;
    const prevSeed = this.settings.seed;
    const prevN = this.settings.n;
    const presetChanged = nextSettings.preset !== undefined && nextSettings.preset !== prevPreset;
    const baseForUpdate = presetChanged && PRESETS[nextSettings.preset]
      ? { ...this.settings, ...PRESETS[nextSettings.preset], ...nextSettings }
      : { ...this.settings, ...nextSettings };
    this.settings = normalizeSettings(baseForUpdate);

    if (
      presetChanged ||
      nextSettings.seed !== undefined && this.settings.seed !== prevSeed ||
      nextSettings.population !== undefined && this.settings.population !== prevPop
    ) {
      this.resetState();
      this.initializePreset();
      return;
    }

    if (this.settings.n !== prevN) {
      const n = this.settings.n;
      this.fieldDensity = new Float32Array(n * n);
      this.fieldPhase = new Float32Array(n * n);
      this.fieldFlavor = new Float32Array(n * n);
      this.fieldRe = new Float64Array(n * n);
      this.fieldIm = new Float64Array(n * n);
    }
    this.synthesizeField();
  }

  restart() {
    this.resetState();
    this.initializePreset();
  }

  step(steps = 1) {
    const count = Math.max(1, Math.round(steps));
    for (let s = 0; s < count; s++) {
      this.advanceOneStep();
    }
    this.synthesizeField();
    return this;
  }

  advanceOneStep() {
    const {
      dt,
      coupling,
      decay,
      worldRadius
    } = this.settings;

    this.stepIndex++;
    this.time = Number((this.stepIndex * dt).toFixed(6));

    const entityById = new Map();
    for (const e of this.entities) {
      entityById.set(e.id, e);
    }

    // 1. Active cursor or global field actions (Press-and-Hold Causal Reversal or Observer Lens)
    if (this.fieldAction.active) {
      this.fieldAction.holdTime += dt;
      const activeRadius = this.fieldAction.global ? worldRadius * 1.6 : 50;
      this.fieldAction.radius = activeRadius;

      if (this.fieldAction.mode === 'reverse' || this.fieldAction.global) {
        this.applyReversalField(this.fieldAction.x, this.fieldAction.y, activeRadius, dt, false);
      } else if (this.fieldAction.mode === 'observe') {
        this.applyObservationField(this.fieldAction.x, this.fieldAction.y, activeRadius, dt);
      }
    }

    // Count active bond strength per entity so isolated entities decay faster than bonded cluster cores
    const bondLoad = new Map();
    for (let i = this.links.length - 1; i >= 0; i--) {
      const link = this.links[i];
      const a = entityById.get(link.a);
      const b = entityById.get(link.b);
      if (!a || !b) {
        this.links.splice(i, 1);
        continue;
      }
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const maxReach = 18 + (a.sigma + b.sigma) * 1.1;
      const stretchDecay = dist > maxReach ? 1.0 : 0.16;
      link.strength -= stretchDecay * dt * (0.4 + decay);

      if (link.strength <= 0.04 || dist > maxReach * 1.5) {
        this.links.splice(i, 1);
      } else {
        bondLoad.set(a.id, (bondLoad.get(a.id) ?? 0) + link.strength);
        bondLoad.set(b.id, (bondLoad.get(b.id) ?? 0) + link.strength);
      }
    }

    // 2. Pairwise quantum interference, classical orbital forces, and stochastic wave-collapse interactions
    const nEntities = this.entities.length;
    for (let i = 0; i < nEntities; i++) {
      const a = this.entities[i];
      for (let j = i + 1; j < nEntities; j++) {
        const b = this.entities[j];
        // Light interferes in the synthesized field; matter contact can decohere it.
        // Photons exert no orbital force or radiation pressure and never bond.
        if (a.flavor === PHOTON && b.flavor === PHOTON) continue;
        const photonPair = a.flavor === PHOTON || b.flavor === PHOTON;
        const massA = a.mass;
        const massB = b.mass;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq) + 1e-6;
        const nx = dx / dist;
        const ny = dy / dist;

        const sumSigmaSq = a.sigma * a.sigma + b.sigma * b.sigma;
        const sumSigma = a.sigma + b.sigma;

        // Wavepacket overlap integral \Omega_{ij} \in [0, 1]
        const overlap =
          dist < sumSigma * 2.6
            ? ((2 * a.sigma * b.sigma) / sumSigmaSq) * Math.exp(-distSq / (2 * sumSigmaSq))
            : 0;

        // Quantum vs Classical regime weights
        const qPair = 0.5 * (a.coherence + b.coherence);
        const cPair = 1 - qPair;

        // (A) Quantum Phase-Interference Force (dominant when entities are delocalized waves)
        if (overlap > 0.002 && qPair > 0.05) {
          const phaseDiff = b.phase - a.phase;
          const phaseAlign = Math.cos(phaseDiff);
          // Constructive interference pulls wave envelopes gently together; destructive diffracts apart
          if (!photonPair) {
            const waveForce = 4.2 * qPair * overlap * phaseAlign;
            a.vx += nx * waveForce * dt / massA;
            a.vy += ny * waveForce * dt / massA;
            b.vx -= nx * waveForce * dt / massB;
            b.vy -= ny * waveForce * dt / massB;
          }

          // Gentle phase synchronization when strongly overlapping
          const sync = 0.12 * overlap * dt;
          const sinDiff = Math.sin(phaseDiff);
          a.phase += sinDiff * sync;
          b.phase -= sinDiff * sync;
        }

        // (B) Classical Multi-Flavor Orbital & Lattice Potential (dominant as causal chains lengthen)
        if (!photonPair && dist < 42 && cPair > 0.04) {
          const spinnerPair = a.flavor === 0 && b.flavor === 0;
          const oppositeSpin = a.spin * b.spin < 0;
          const rEq = spinnerPair && oppositeSpin ? 7.2 : EQUILIBRIUM_DIST[a.flavor][b.flavor];
          const affinity = spinnerPair ? (oppositeSpin ? 1.25 : -0.35) : AFFINITY[a.flavor][b.flavor];
          const ratio = rEq / Math.max(1.8, dist);

          // Soft-core repulsion + selective flavor attraction at equilibrium distance
          const repulsion = Math.pow(ratio, 3.2) * 18;
          const attraction = affinity * Math.pow(ratio, 1.35) * 15;
          const radialForce = clamp((attraction - repulsion) * cPair, -28, 22);

          a.vx += nx * radialForce * dt / massA;
          a.vy += ny * radialForce * dt / massA;
          b.vx -= nx * radialForce * dt / massB;
          b.vy -= ny * radialForce * dt / massB;

          // Subtle tangential spin-orbit coupling so classical clusters rotate gracefully
          if (dist < rEq * 1.9) {
            const spinCouple = (a.spin + b.spin) * 1.05 * cPair * Math.exp(-dist / (rEq * 1.4));
            const tx = -ny;
            const ty = nx;
            a.vx += tx * spinCouple * dt / massA;
            a.vy += ty * spinCouple * dt / massA;
            b.vx -= tx * spinCouple * dt / massB;
            b.vy -= ty * spinCouple * dt / massB;

            // Relative velocity damping inside classical bonds so crystals stabilize smoothly
            const rvx = b.vx - a.vx;
            const rvy = b.vy - a.vy;
            const damp = 2.2 * cPair * cPair * Math.exp(-dist / rEq) * dt;
            a.vx += rvx * damp * 2 * massB / (massA + massB);
            a.vy += rvy * damp * 2 * massB / (massA + massB);
            b.vx -= rvx * damp * 2 * massA / (massA + massB);
            b.vy -= rvy * damp * 2 * massA / (massA + massB);
          }
        }

        // (C) Stochastic Causal Interaction & Progressive Wave Collapse
        // Requires substantial core overlap so waves persist until genuine close collisions or direct observation
        if (overlap > 0.22 && coupling > 0) {
          const cooldownA = Math.min(1, Math.max(0.1, (this.time - a.lastInteractionTime) / 0.42));
          const cooldownB = Math.min(1, Math.max(0.1, (this.time - b.lastInteractionTime) / 0.42));
          const quantumDrive = Math.max(a.coherence, b.coherence) * (0.25 + 0.75 * Math.min(a.coherence, b.coherence));
          const effectiveOverlap = (overlap - 0.22) / 0.78;
          const rate = coupling * effectiveOverlap * overlap * quantumDrive * cooldownA * cooldownB * 1.5;
          const prob = 1 - Math.exp(-rate * dt);

          if (a.rng.next() < prob) {
            this.collapsePair(a, b, overlap, entityById);
          }
        }
      }
    }

    // 3. Motion and isolation decay
    integrateMotion(this, bondLoad);

    processReactions(this);

    // 4. Advance collapse & reversal ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].age += dt;
      if (this.ripples[i].age >= this.ripples[i].maxAge) {
        this.ripples.splice(i, 1);
      }
    }
  }

  collapsePair(a, b, overlap, entityById) {
    const { contagion, sigmaMin, sigmaMax } = this.settings;

    const varA = a.sigma * a.sigma;
    const varB = b.sigma * b.sigma;
    const sumVar = varA + varB;

    // Shared interaction locus sampled from product distribution |\psi_a|^2 |\psi_b|^2
    const meanX = (varB * a.x + varA * b.x) / sumVar;
    const meanY = (varB * a.y + varA * b.y) / sumVar;
    const jointSigma = Math.sqrt((varA * varB) / sumVar);
    const collapseX = meanX + a.rng.gaussian() * jointSigma * 0.65;
    const collapseY = meanY + a.rng.gaussian() * jointSigma * 0.65;

    const prevAX = a.x;
    const prevAY = a.y;
    const prevASigma = a.sigma;
    const prevADepth = a.causalDepth;

    const prevBX = b.x;
    const prevBY = b.y;
    const prevBSigma = b.sigma;
    const prevBDepth = b.causalDepth;

    // Probabilistic positional snap scales with each entity's wave coherence!
    // Delocalized waves snap strongly toward the sampled locus; classical particles barely shift.
    const snapA = 0.58 * a.coherence * a.coherence;
    const snapB = 0.58 * b.coherence * b.coherence;
    a.x += (collapseX - a.x) * snapA;
    a.y += (collapseY - a.y) * snapA;
    b.x += (collapseX - b.x) * snapB;
    b.y += (collapseY - b.y) * snapB;

    // Contagious Causal Chain Lengthening: interacting with a high-depth partner accelerates collapse
    const gainA = (0.42 + 0.35 * overlap) + contagion * 0.65 * Math.log1p(prevBDepth * 1.4);
    const gainB = (0.42 + 0.35 * overlap) + contagion * 0.65 * Math.log1p(prevADepth * 1.4);
    a.causalDepth = Math.min(28, prevADepth + gainA);
    b.causalDepth = Math.min(28, prevBDepth + gainB);

    // Contract spatial uncertainty \sigma progressively toward the new causal target
    const targetA = this.targetSigma(a.causalDepth);
    const targetB = this.targetSigma(b.causalDepth);
    a.sigma = clamp(a.sigma + (targetA - a.sigma) * 0.55, sigmaMin, sigmaMax);
    b.sigma = clamp(b.sigma + (targetB - b.sigma) * 0.55, sigmaMin, sigmaMax);
    a.coherence = this.coherenceOf(a.sigma);
    b.coherence = this.coherenceOf(b.sigma);

    a.interactionCount++;
    b.interactionCount++;
    a.lastInteractionTime = this.time;
    b.lastInteractionTime = this.time;
    this.totals.interactions++;

    // Propagate causal reinforcement down connected causal neighbors (chain lengthening cascade)
    for (const link of this.links) {
      if (link.a === a.id || link.b === a.id || link.a === b.id || link.b === b.id) {
        const neighborId =
          link.a === a.id || link.a === b.id ? link.b : link.a;
        if (neighborId !== a.id && neighborId !== b.id) {
          const neighbor = entityById.get(neighborId);
          if (neighbor) {
            neighbor.causalDepth = Math.min(28, neighbor.causalDepth + 0.12 * contagion * link.strength);
            neighbor.sigma = clamp(
              neighbor.sigma + (this.targetSigma(neighbor.causalDepth) - neighbor.sigma) * 0.3,
              sigmaMin,
              sigmaMax
            );
            neighbor.coherence = this.coherenceOf(neighbor.sigma);
            link.lastPulse = this.time;
          }
        }
      }
    }

    this.upsertLink(a, b, 0.32 + 0.32 * overlap);

    const prob = clamp(overlap, 0.04, 0.99);
    this.recordEvent(a, {
      kind: 'collapse',
      partnerId: b.id,
      partnerFlavor: b.flavor,
      x: a.x,
      y: a.y,
      prevX: prevAX,
      prevY: prevAY,
      prevSigma: prevASigma,
      newSigma: a.sigma,
      prevDepth: prevADepth,
      newDepth: a.causalDepth,
      probability: prob
    });
    this.recordEvent(b, {
      kind: 'collapse',
      partnerId: a.id,
      partnerFlavor: a.flavor,
      x: b.x,
      y: b.y,
      prevX: prevBX,
      prevY: prevBY,
      prevSigma: prevBSigma,
      newSigma: b.sigma,
      prevDepth: prevBDepth,
      newDepth: b.causalDepth,
      probability: prob
    });

    if (prevASigma - a.sigma > 1.1 && this.ripples.length < 10) {
      this.addRipple(collapseX, collapseY, Math.max(prevASigma, prevBSigma), Math.min(a.sigma, b.sigma), a.flavor, 'collapse');
    }
  }

  // Synthesize the continuous 2D complex wave interference field \Psi(x, y) over the circular cosmic basin
  synthesizeField() {
    const n = this.settings.n;
    const R = this.settings.worldRadius;
    const re = this.fieldRe;
    const im = this.fieldIm;
    const density = this.fieldDensity;
    const phase = this.fieldPhase;
    const flavorField = this.fieldFlavor;

    re.fill(0);
    im.fill(0);
    flavorField.fill(0);

    const cellSize = (2 * R) / n;

    for (const e of this.entities) {
      // Even partially condensed entities contribute a tight wave halo, while delocalized waves span wide cells
      const effSigma = Math.max(2.2, e.sigma * 1.15);
      const cutoff = effSigma * 2.65;
      const minX = Math.max(0, Math.floor((e.x - cutoff + R) / cellSize));
      const maxX = Math.min(n - 1, Math.ceil((e.x + cutoff + R) / cellSize));
      const minY = Math.max(0, Math.floor((e.y - cutoff + R) / cellSize));
      const maxY = Math.min(n - 1, Math.ceil((e.y + cutoff + R) / cellSize));

      const invTwoSigmaSq = 1 / (2 * effSigma * effSigma);
      // Wave amplitude scales with coherence so wavepackets dominate the interference field
      const amp = (0.32 + 0.68 * e.coherence) / Math.sqrt(effSigma);
      const kx = clamp(e.vx * 0.065, -1.5, 1.5);
      const ky = clamp(e.vy * 0.065, -1.5, 1.5);

      for (let gy = minY; gy <= maxY; gy++) {
        const wy = -R + (gy + 0.5) * cellSize;
        const dy = wy - e.y;
        const dySq = dy * dy;

        for (let gx = minX; gx <= maxX; gx++) {
          const wx = -R + (gx + 0.5) * cellSize;
          const dx = wx - e.x;
          const dSq = dx * dx + dySq;
          if (dSq > cutoff * cutoff) continue;

          const env = amp * Math.exp(-dSq * invTwoSigmaSq);
          const localPhase = e.phase + kx * dx + ky * dy;
          const idx = gy * n + gx;

          re[idx] += env * Math.cos(localPhase);
          im[idx] += env * Math.sin(localPhase);
          flavorField[idx] += env * (e.flavor - 1);
        }
      }
    }

    const rSqMax = R * R;
    const taperStart = (R * 0.88) ** 2;
    const taperSpan = Math.max(1, rSqMax - taperStart);

    for (let gy = 0; gy < n; gy++) {
      const wy = -R + (gy + 0.5) * cellSize;
      const wySq = wy * wy;
      for (let gx = 0; gx < n; gx++) {
        const wx = -R + (gx + 0.5) * cellSize;
        const rSq = wx * wx + wySq;
        const idx = gy * n + gx;
        if (rSq >= rSqMax) {
          density[idx] = 0;
          phase[idx] = 0;
          flavorField[idx] = 0;
          continue;
        }
        const boundaryMask = rSq > taperStart ? 1 - (rSq - taperStart) / taperSpan : 1;
        const r = re[idx];
        const imVal = im[idx];
        density[idx] = (r * r + imVal * imVal) * boundaryMask * boundaryMask;
        phase[idx] = Math.atan2(imVal, r);
      }
    }
  }

  metrics() {
    if (this.entities.length === 0) {
      return {
        population: 0,
        meanCoherence: 1,
        meanCausalDepth: 0,
        meanSigma: this.settings.sigmaMax,
        waveCount: 0,
        particleCount: 0,
        activeBonds: 0,
        interactions: this.totals.interactions,
        reversals: this.totals.reversals,
        observations: this.totals.observations,
        fusions: this.totals.fusions,
        fissions: this.totals.fissions,
        absorptions: this.totals.absorptions
      };
    }

    const count = this.entities.length;
    let sumCoherence = 0;
    let sumDepth = 0;
    let sumSigma = 0;
    let waveCount = 0;
    let particleCount = 0;

    for (const e of this.entities) {
      sumCoherence += e.coherence;
      sumDepth += e.causalDepth;
      sumSigma += e.sigma;
      if (e.coherence >= 0.5) waveCount++;
      else particleCount++;
    }

    return {
      population: this.entities.length,
      meanCoherence: sumCoherence / count,
      meanCausalDepth: sumDepth / count,
      meanSigma: sumSigma / count,
      waveCount,
      particleCount,
      activeBonds: this.links.length,
      interactions: this.totals.interactions,
      reversals: this.totals.reversals,
      observations: this.totals.observations,
      fusions: this.totals.fusions,
      fissions: this.totals.fissions,
      absorptions: this.totals.absorptions
    };
  }

  frame() {
    const selected =
      this.entities.find(e => e.id === this.selectedId) ??
      this.entities[0] ??
      null;

    return {
      solver: SOLVER_VERSION,
      stepIndex: this.stepIndex,
      time: this.time,
      settings: { ...this.settings },
      metrics: this.metrics(),
      fieldAction: { ...this.fieldAction },
      selectedId: selected?.id ?? null,
      selectedInspector: selected
        ? {
            id: selected.id,
            flavor: selected.flavor,
            flavorName: selected.constituents.length > 1 ? 'COMPOSITE' : FLAVORS[selected.flavor].name,
            mass: selected.mass,
            spin: selected.spin,
            energy: selected.energy,
            constituents: selected.constituents.map(part => ({ ...part })),
            x: selected.x,
            y: selected.y,
            vx: selected.vx,
            vy: selected.vy,
            sigma: selected.sigma,
            coherence: selected.coherence,
            causalDepth: selected.causalDepth,
            interactionCount: selected.interactionCount,
            history: selected.history.slice(-10).reverse()
          }
        : null,
      entities: this.entities.map(e => ({
        id: e.id,
        flavor: e.flavor,
        mass: e.mass,
        spin: e.spin,
        energy: e.energy,
        constituentCount: e.constituents.length,
        x: e.x,
        y: e.y,
        vx: e.vx,
        vy: e.vy,
        sigma: e.sigma,
        phase: e.phase,
        coherence: e.coherence,
        causalDepth: e.causalDepth,
        interactionCount: e.interactionCount,
        trail: e.trail.slice()
      })),
      links: this.links.map(l => ({ ...l })),
      ripples: this.ripples.map(r => ({ ...r })),
      field: {
        n: this.settings.n,
        worldRadius: this.settings.worldRadius,
        density: Float32Array.from(this.fieldDensity),
        phase: Float32Array.from(this.fieldPhase),
        flavor: Float32Array.from(this.fieldFlavor)
      }
    };
  }

  snapshot() {
    return {
      solver: SOLVER_VERSION,
      stepIndex: this.stepIndex,
      time: this.time,
      nextEntityId: this.nextEntityId,
      nextEventId: this.nextEventId,
      rng: this.rng.state,
      selectedId: this.selectedId,
      settings: { ...this.settings },
      totals: { ...this.totals },
      fieldAction: { ...this.fieldAction },
      entities: this.entities.map(e => ({
        id: e.id,
        flavor: e.flavor,
        mass: e.mass,
        spin: e.spin,
        energy: e.energy,
        constituents: e.constituents.map(part => ({ ...part })),
        lastReactionTime: e.lastReactionTime,
        x: e.x,
        y: e.y,
        vx: e.vx,
        vy: e.vy,
        sigma: e.sigma,
        phase: e.phase,
        causalDepth: e.causalDepth,
        coherence: e.coherence,
        interactionCount: e.interactionCount,
        lastInteractionTime: e.lastInteractionTime,
        rng: e.rng.state,
        history: e.history.map(h => ({ ...h })),
        trail: e.trail.map(pt => [pt[0], pt[1]])
      })),
      links: this.links.map(l => ({ ...l }))
    };
  }
}
