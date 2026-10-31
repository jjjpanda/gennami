import { FLAVORS, PHOTON, clamp } from '../presets.js';

// Integrate motion after pair interactions and before reactions. Preserve this
// order so collapse snaps do not become collision paths.
export function integrateMotion(sim, bondLoad) {
  const { dt, decay, sigmaMin, sigmaMax, worldRadius } = sim.settings;
  for (const e of sim.entities) {
    // Start sweeps after observation/collapse snaps; those are not motion paths.
    e.previousX = e.x;
    e.previousY = e.y;
    const timeSinceInteract = sim.time - e.lastInteractionTime;
    const bonds = bondLoad.get(e.id) ?? 0;

    // Isolation restores wave behavior for both matter and light.
    const isolationFactor = bonds < 0.35 ? (timeSinceInteract > 0.6 ? 1.6 : 0.9) : 0.38 / (1 + bonds * 0.85);
    if (decay > 0 && e.causalDepth > 0) {
      e.causalDepth = Math.max(
        0,
        e.causalDepth - decay * isolationFactor * (0.75 + 0.28 * e.causalDepth) * dt
      );
    }

    const targetSig = sim.targetSigma(e.causalDepth);
    const relaxRate = targetSig > e.sigma ? 1.35 * (0.4 + decay) : 4.8;
    e.sigma = clamp(e.sigma + (targetSig - e.sigma) * clamp(relaxRate * dt, 0, 1), sigmaMin, sigmaMax);
    e.coherence = sim.coherenceOf(e.sigma);

    if (e.flavor === PHOTON) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const radius = Math.hypot(e.x, e.y);
      if (radius > worldRadius - 2) {
        const nx = e.x / radius;
        const ny = e.y / radius;
        const radialVelocity = e.vx * nx + e.vy * ny;
        e.x = nx * (worldRadius - 2);
        e.y = ny * (worldRadius - 2);
        if (radialVelocity > 0) {
          e.vx -= 2 * radialVelocity * nx;
          e.vy -= 2 * radialVelocity * ny;
        }
      }
      e.phase += FLAVORS[PHOTON].omega * dt;
      e.trail.push([e.x, e.y]);
      if (e.trail.length > 14) e.trail.shift();
      continue;
    }
    // Gentle quantum zero-point drift scales with coherence^2 (vanishes for classical particles)
    if (e.coherence > 0.05) {
      const quantumJitter = 1.15 * e.coherence * e.coherence * Math.sqrt(dt / e.mass);
      e.vx += e.rng.gaussian() * quantumJitter;
      e.vy += e.rng.gaussian() * quantumJitter;
    }

    // Speed cap and smooth cosmic drag
    const speed = Math.hypot(e.vx, e.vy);
    const maxSpeed = 44 + 10 * e.coherence;
    if (speed > maxSpeed) {
      e.vx = (e.vx / speed) * maxSpeed;
      e.vy = (e.vy / speed) * maxSpeed;
    }
    const drag = Math.exp(-0.28 * dt);
    e.vx *= drag;
    e.vy *= drag;

    e.x += e.vx * dt;
    e.y += e.vy * dt;

    // Circular cosmic basin boundary matching the background horizon ring (R = worldRadius)
    const r = Math.hypot(e.x, e.y);
    const margin = e.sigma * 0.7;
    const softRim = Math.max(20, worldRadius - margin - 14);
    const hardRim = Math.max(24, worldRadius - margin * 0.65);

    if (r > softRim && r > 1e-6) {
      const rx = e.x / r;
      const ry = e.y / r;
      const excess = (r - softRim) / Math.max(1, hardRim - softRim);
      const pull = 16 * excess * excess;
      e.vx -= rx * pull * dt;
      e.vy -= ry * pull * dt;
      // Subtle tangential circulation along the basin wall
      e.vx += -ry * 1.4 * Math.min(1.5, excess) * dt;
      e.vy += rx * 1.4 * Math.min(1.5, excess) * dt;

      if (r > hardRim) {
        e.x = rx * hardRim;
        e.y = ry * hardRim;
        const vRad = e.vx * rx + e.vy * ry;
        if (vRad > 0) {
          e.vx -= 1.65 * vRad * rx;
          e.vy -= 1.65 * vRad * ry;
        }
      }
    }

    // Evolve quantum phase \phi smoothly
    const baseOmega = FLAVORS[e.flavor].omega * (e.flavor === 0 ? e.spin : 1);
    e.phase = ((e.phase + (baseOmega + 0.008 * (e.vx * e.vx + e.vy * e.vy)) * dt + Math.PI) % (2 * Math.PI)) - Math.PI;

    // Record motion trail
    if (sim.stepIndex % 2 === 0) {
      e.trail.push([e.x, e.y]);
      if (e.trail.length > 14) {
        e.trail.shift();
      }
    }
  }
}
