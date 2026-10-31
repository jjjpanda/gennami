import { FLAVORS, PHOTON, PHOTON_SPEED } from '../presets.js';

// Fictional reaction rules in simulation units. The ambient solver includes drag
// and noise; individual reactions conserve matter mass and account for released energy.
export function particleProperties(flavor, rng) {
  const spin = flavor === 0 ? (rng.next() < 0.5 ? -1 : 1) : 0;
  return {
    mass: FLAVORS[flavor].mass,
    spin,
    energy: flavor === PHOTON ? 24 : 0,
    constituents: flavor === PHOTON ? [] : [{ flavor, spin }],
    lastReactionTime: -10
  };
}

const capacity = sim => Math.max(sim.settings.population + 24, 144);
const massOf = parts => parts.reduce((sum, part) => sum + FLAVORS[part.flavor].mass, 0);

function hitTime(photon, target) {
  const x = photon.previousX ?? photon.x;
  const y = photon.previousY ?? photon.y;
  const targetX = target.previousX ?? target.x;
  const targetY = target.previousY ?? target.y;
  // Sweep in the target's frame: both endpoints move during integration.
  const dx = (photon.x - x) - (target.x - targetX);
  const dy = (photon.y - y) - (target.y - targetY);
  const offsetX = x - targetX;
  const offsetY = y - targetY;
  const outside = offsetX * offsetX + offsetY * offsetY - 3.5 ** 2;
  if (outside < 0) return 0;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Infinity;
  const projection = offsetX * dx + offsetY * dy;
  const discriminant = projection * projection - lengthSq * outside;
  if (discriminant <= 0) return Infinity;
  // First entry into the target's collision radius, as a fraction of this step.
  const t = (-projection - Math.sqrt(discriminant)) / lengthSq;
  return t >= 0 && t < 1 ? t : Infinity;
}

function removeEntities(sim, ids, replacementId) {
  sim.entities = sim.entities.filter(e => !ids.has(e.id));
  sim.links = sim.links.filter(link => !ids.has(link.a) && !ids.has(link.b));
  if (ids.has(sim.selectedId)) sim.selectedId = replacementId;
}

function recordReaction(sim, entity, kind, partnerId, partnerFlavor, energy) {
  entity.interactionCount++;
  entity.lastInteractionTime = sim.time;
  entity.lastReactionTime = sim.time;
  sim.recordEvent(entity, {
    kind, partnerId, partnerFlavor, energy,
    x: entity.x, y: entity.y,
    newSigma: entity.sigma, newDepth: entity.causalDepth
  });
}

function fragment(sim, source, parts, x, y, vx, vy) {
  const entity = sim.createEntity({ flavor: parts[0].flavor, x, y, vx, vy, sigma: source.sigma });
  entity.constituents = parts.map(part => ({ ...part }));
  entity.mass = massOf(parts);
  // Preserve reaction velocities beyond the manual-emission speed limit.
  entity.vx = vx;
  entity.vy = vy;
  entity.spin = parts.reduce((sum, part) => sum + part.spin, 0);
  entity.causalDepth = source.causalDepth;
  entity.coherence = sim.coherenceOf(entity.sigma);
  entity.history = source.history.map(event => ({ ...event }));
  sim.entities.push(entity);
  return entity;
}

function emitPhotons(sim, source, energy, angle, kind) {
  if (!(energy > 0)) return;
  for (const sign of [-1, 1]) {
    const nx = Math.cos(angle) * sign;
    const ny = Math.sin(angle) * sign;
    const photon = sim.createEntity({
      flavor: PHOTON,
      x: source.x + nx * 6, y: source.y + ny * 6,
      vx: nx * PHOTON_SPEED, vy: ny * PHOTON_SPEED
    });
    photon.energy = energy / 2;
    recordReaction(sim, photon, kind, source.id, source.flavor, photon.energy);
    sim.entities.push(photon);
  }
}

export function fuseParticles(sim, a, b) {
  if (a === b || a.flavor === PHOTON || b.flavor === PHOTON ||
      !sim.entities.includes(a) || !sim.entities.includes(b) ||
      sim.entities.length + 1 > capacity(sim)) return null;
  const mass = a.mass + b.mass;
  const vx = (a.mass * a.vx + b.mass * b.vx) / mass;
  const vy = (a.mass * a.vy + b.mass * b.vy) / mass;
  const relativeEnergy = 0.5 * a.mass * b.mass / mass * ((a.vx - b.vx) ** 2 + (a.vy - b.vy) ** 2);
  const availableEnergy = relativeEnergy + a.energy + b.energy;
  const x = (a.x * a.mass + b.x * b.mass) / mass;
  const y = (a.y * a.mass + b.y * b.mass) / mass;
  const product = fragment(sim, a, [...a.constituents, ...b.constituents], x, y, vx, vy);
  product.energy = availableEnergy * 0.75;
  product.interactionCount = a.interactionCount + b.interactionCount;
  recordReaction(sim, product, 'fusion', b.id, b.flavor, availableEnergy * 0.25);
  removeEntities(sim, new Set([a.id, b.id]), product.id);
  emitPhotons(sim, product, availableEnergy * 0.25, sim.rng.range(-Math.PI, Math.PI), 'fusion');
  sim.addRipple(x, y, sim.settings.sigmaMin, 12, product.flavor, 'fusion');
  sim.totals.fusions++;
  sim.totals.interactions++;
  return product;
}

export function splitParticle(sim, source) {
  if (source.flavor === PHOTON || !sim.entities.includes(source) ||
      source.energy < source.mass * 8 || sim.entities.length + 3 > capacity(sim)) return [];
  let parts = source.constituents;
  if (parts.length === 1 && parts[0].flavor === 3) {
    // One 3× Anchor becomes two 1.5× Binder/Drifter fragments.
    parts = [{ flavor: 1, spin: 0 }, { flavor: 2, spin: 0 },
      { flavor: 1, spin: 0 }, { flavor: 2, spin: 0 }];
  }
  if (parts.length < 2) return [];
  const midpoint = Math.ceil(parts.length / 2);
  const groups = [parts.slice(0, midpoint), parts.slice(midpoint)];
  const masses = groups.map(massOf);
  const reducedMass = masses[0] * masses[1] / source.mass;
  const relativeSpeed = Math.sqrt(2 * source.energy * 0.75 / reducedMass);
  const angle = sim.rng.range(-Math.PI, Math.PI);
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const fragments = groups.map((group, i) => {
    const sign = i === 0 ? -1 : 1;
    const speed = relativeSpeed * masses[1 - i] / source.mass;
    const entity = fragment(sim, source, group, source.x + sign * nx * 3,
      source.y + sign * ny * 3, source.vx + sign * nx * speed, source.vy + sign * ny * speed);
    entity.interactionCount = source.interactionCount;
    recordReaction(sim, entity, 'fission', source.id, source.flavor, source.energy * 0.25);
    return entity;
  });
  removeEntities(sim, new Set([source.id]), fragments[0].id);
  emitPhotons(sim, source, source.energy * 0.25, angle + Math.PI / 2, 'fission');
  sim.addRipple(source.x, source.y, sim.settings.sigmaMin, 16, source.flavor, 'fission');
  sim.totals.fissions++;
  sim.totals.interactions++;
  return fragments;
}

export function processReactions(sim) {
  // Take stable lists: newly emitted photons and fragments react on later steps.
  const matter = sim.entities.filter(e => e.flavor !== PHOTON);
  for (const photon of sim.entities.filter(e => e.flavor === PHOTON)) {
    if (sim.time - photon.lastReactionTime < 0.12) continue;
    let target;
    let firstHit = Infinity;
    for (const entity of matter) {
      const t = hitTime(photon, entity);
      if (t < firstHit) {
        target = entity;
        firstHit = t;
      }
    }
    if (!target) continue;
    target.energy += photon.energy;
    // Absorption does not reset the matter cooldown, allowing energy to trigger fission.
    const lastReactionTime = target.lastReactionTime;
    recordReaction(sim, target, 'absorb', photon.id, PHOTON, photon.energy);
    target.lastReactionTime = lastReactionTime;
    removeEntities(sim, new Set([photon.id]), target.id);
    sim.totals.absorptions++;
    sim.totals.interactions++;
  }
  for (const entity of matter) {
    if (sim.time - entity.lastReactionTime >= 0.8) splitParticle(sim, entity);
  }
  if (sim.settings.coupling <= 0) return;
  const eligible = sim.entities.filter(e => e.flavor !== PHOTON &&
    e.coherence < 0.65 && sim.time - e.lastReactionTime >= 0.8);
  const consumed = new Set();
  for (let i = 0; i < eligible.length; i++) {
    const a = eligible[i];
    if (consumed.has(a.id)) continue;
    for (let j = i + 1; j < eligible.length; j++) {
      const b = eligible[j];
      if (consumed.has(b.id) || (a.flavor === 0 && b.flavor === 0 && a.spin * b.spin > 0)) continue;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 4.5) continue;
      const approaching = (b.x - a.x) * (b.vx - a.vx) + (b.y - a.y) * (b.vy - a.vy) < 0;
      const speed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
      if ((approaching && speed > 4) || a.rng.next() < 1 - Math.exp(-3 * sim.settings.coupling * sim.settings.dt)) {
        if (fuseParticles(sim, a, b)) {
          consumed.add(a.id);
          consumed.add(b.id);
          break;
        }
      }
    }
  }
}
