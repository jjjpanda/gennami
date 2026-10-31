import { palette, phaseRGB } from './palette.js';
import {
  exposure,
  densityContours,
  phaseContours,
  interpolateWave,
  DENSITY_LEVELS
} from './density.js';
import {
  Swarm,
  drawSwarm,
  drawCausalLinks,
  drawRipples,
  drawEntities,
  drawFieldOverlay
} from './quanta.js';

export class FieldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.surface = document.createElement('canvas');
    this.sc = this.surface.getContext('2d');
    this.glow = document.createElement('canvas');
    this.gc = this.glow.getContext('2d');

    this.phaseLUT = new Uint8Array(1024 * 3);
    for (let i = 0; i < 1024; i++) {
      this.phaseLUT.set(phaseRGB((i / 1024) * Math.PI * 2 - Math.PI), i * 3);
    }

    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    this.embedded = false;
    this.swarm = new Swarm(260);
    this.waveScratch = {};
    this.pixels = null;
    this.glowPixels = null;
    this.lastStepRendered = -1;
  }

  resetCamera() {
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
  }

  cameraProjection(width, height, worldRadius = 108) {
    const minDim = Math.max(1, Math.min(width, height));
    const baseScale = (minDim * (this.embedded ? 0.48 : 0.44)) / Math.max(10, worldRadius);
    const scale = baseScale * (this.embedded ? 1 : this.zoom);
    const scaleX = scale;
    const scaleY = scale;
    const cx = width * 0.5 + (this.embedded ? 0 : this.panX);
    const cy = height * 0.5 + (this.embedded ? 0 : this.panY);

    return {
      width,
      height,
      cx,
      cy,
      scale,
      scaleX,
      scaleY,
      worldRadius,
      worldToScreen(wx, wy) {
        return [cx + wx * scaleX, cy + wy * scaleY];
      },
      screenToWorld(sx, sy) {
        return [(sx - cx) / scaleX, (sy - cy) / scaleY];
      },
      worldBoundsScreen() {
        const rx = worldRadius * scaleX;
        const ry = worldRadius * scaleY;
        return {
          x: cx - rx,
          y: cy - ry,
          w: rx * 2,
          h: ry * 2
        };
      }
    };
  }

  updateWaveTexture(field, pal) {
    const targetN = 128;
    const wave = interpolateWave(
      field.density,
      field.phase,
      field.n,
      targetN,
      this.waveScratch
    );
    // Only interpolated outputs own reusable buffers. At native resolution the
    // result aliases the worker frame and must not become scratch storage.
    if (field.n < targetN) this.waveScratch = wave;
    const { density, phase, n } = wave;

    if (this.surface.width !== n) {
      this.surface.width = this.surface.height = n;
      this.glow.width = this.glow.height = n;
      this.pixels = this.sc.createImageData(n, n);
      this.glowPixels = this.gc.createImageData(n, n);
    }

    const data = this.pixels.data;
    const gData = this.glowPixels.data;
    const isDaylight = pal.name === 'daylight';
    const half = n * 0.5;
    const maxRSq = half * half;

    for (let i = 0; i < n * n; i++) {
      const gx = (i % n) + 0.5 - half;
      const gy = Math.floor(i / n) + 0.5 - half;
      const rSq = gx * gx + gy * gy;
      const d = rSq <= maxRSq ? density[i] : 0;
      const exp = exposure(d);
      const offset = i * 4;

      if (exp < 0.012) {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 0;
        gData[offset] = 0;
        gData[offset + 1] = 0;
        gData[offset + 2] = 0;
        gData[offset + 3] = 0;
        continue;
      }

      const phiIdx = (((Math.round(((phase[i] + Math.PI) / (2 * Math.PI)) * 1024) % 1024) + 1024) % 1024) * 3;
      const pr = this.phaseLUT[phiIdx];
      const pg = this.phaseLUT[phiIdx + 1];
      const pb = this.phaseLUT[phiIdx + 2];

      // Smooth interference fringes modulated by phase crests
      const crest = 0.86 + 0.14 * Math.cos(phase[i]);
      const boost = Math.min(1, exp * 1.18);

      data[offset] = Math.min(255, Math.round(pr * crest));
      data[offset + 1] = Math.min(255, Math.round(pg * crest));
      data[offset + 2] = Math.min(255, Math.round(pb * crest));
      data[offset + 3] = Math.round(boost * (isDaylight ? 165 : 200));

      gData[offset] = pr;
      gData[offset + 1] = pg;
      gData[offset + 2] = pb;
      gData[offset + 3] = Math.round(exp * exp * (isDaylight ? 120 : 210));
    }

    this.sc.putImageData(this.pixels, 0, 0);
    this.gc.putImageData(this.glowPixels, 0, 0);
  }

  drawBackdrop(ctx, camera, pal, now) {
    const { width, height, cx, cy, scaleX, scaleY, worldRadius } = camera;
    const rimX = worldRadius * scaleX;
    const rimY = worldRadius * scaleY;
    const isDaylight = pal.name === 'daylight';

    // 1. Sunset / Midnight Vaporwave vertical gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, pal.bgTop);
    bgGrad.addColorStop(0.55, pal.bgMid);
    bgGrad.addColorStop(1, pal.bgBottom);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Dimmed exterior outside the circular simulation boundary so background matches basin bounds
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.ellipse(cx, cy, rimX, rimY, 0, 0, Math.PI * 2, true);
    ctx.fillStyle = isDaylight ? 'rgba(28, 13, 54, 0.08)' : 'rgba(4, 1, 10, 0.52)';
    ctx.fill('evenodd');
    ctx.restore();

    // 3. Retrofuturist Synth-Grid & Polar Cosmic Basin Rings clipped to the simulation basin
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rimX, rimY, 0, 0, Math.PI * 2);
    ctx.clip();

    const basinGlow = ctx.createRadialGradient(cx, cy, rimY * 0.15, cx, cy, rimX);
    basinGlow.addColorStop(0, isDaylight ? 'rgba(255, 255, 255, 0.35)' : 'rgba(26, 10, 56, 0.28)');
    basinGlow.addColorStop(0.82, 'rgba(0, 0, 0, 0)');
    basinGlow.addColorStop(1, isDaylight ? 'rgba(0, 132, 138, 0.12)' : 'rgba(0, 245, 212, 0.14)');
    ctx.fillStyle = basinGlow;
    ctx.fillRect(cx - rimX, cy - rimY, rimX * 2, rimY * 2);

    const gridX = 24 * scaleX;
    const gridY = 24 * scaleY;
    if (gridY >= 14) {
      ctx.strokeStyle = pal.grid;
      ctx.lineWidth = 1;
      const startX = ((cx % gridX) + gridX) % gridX;
      const startY = ((cy % gridY) + gridY) % gridY;

      ctx.beginPath();
      for (let x = startX; x < width; x += gridX) {
        ctx.moveTo(x, cy - rimY);
        ctx.lineTo(x, cy + rimY);
      }
      for (let y = startY; y < height; y += gridY) {
        ctx.moveTo(cx - rimX, y);
        ctx.lineTo(cx + rimX, y);
      }
      ctx.stroke();
    }

    // Center crosshair axes within the basin
    ctx.strokeStyle = pal.gridHorizon;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - rimY);
    ctx.lineTo(cx, cy + rimY);
    ctx.moveTo(cx - rimX, cy);
    ctx.lineTo(cx + rimX, cy);
    ctx.stroke();

    // Inner harmonic guide rings (R = 33%, 66%)
    const innerRings = [0.33, 0.66];
    for (let i = 0; i < innerRings.length; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rimX * innerRings[i], rimY * innerRings[i], 0, 0, Math.PI * 2);
      ctx.strokeStyle = pal.grid;
      ctx.lineWidth = 1;
      if (i === 1) ctx.setLineDash([6, 6]);
      else ctx.setLineDash([]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // 4. Outer simulation containment boundary ring & slow horizon ticks
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rimX, rimY, 0, 0, Math.PI * 2);
    ctx.strokeStyle = pal.accent;
    ctx.globalAlpha = isDaylight ? 0.55 : 0.72;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, cy, rimX + 5, rimY + 5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = pal.gridHorizon;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = pal.gridHorizon;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let deg = 0; deg < 360; deg += 15) {
      const rad = (deg * Math.PI) / 180 + now * 0.00001;
      const len = deg % 45 === 0 ? 9 : 4;
      ctx.moveTo(cx + Math.cos(rad) * rimX, cy + Math.sin(rad) * rimY);
      ctx.lineTo(cx + Math.cos(rad) * (rimX + len), cy + Math.sin(rad) * (rimY + len));
    }
    ctx.stroke();
    ctx.restore();
  }

  render(frame, options = {}) {
    if (!frame || !frame.field) return;

    const now = options.now ?? performance.now();
    const theme = options.theme ?? 'citypop';
    const pal = palette(theme);
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;
    const worldRadius = frame.field.worldRadius || 108;
    const camera = this.cameraProjection(width, height, worldRadius);
    const bounds = camera.worldBoundsScreen();

    // 1. Backdrop & Synthwave Cosmic Grid matched to basin boundary
    if (options.transparent) {
      ctx.clearRect(0, 0, width, height);
    } else {
      this.drawBackdrop(ctx, camera, pal, now);
    }

    const hasEntities = Array.isArray(frame.entities) && frame.entities.length > 0;

    // 2. Volumetric Wave Interference Field (clipped to circular basin)
    if (this.lastFrame !== frame || this.lastTheme !== theme) {
      if (hasEntities) {
        this.updateWaveTexture(frame.field, pal);
      }
      this.lastFrame = frame;
      this.lastTheme = theme;
    }

    if (hasEntities) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(camera.cx, camera.cy, bounds.w / 2, bounds.h / 2, 0, 0, Math.PI * 2);
      ctx.clip();

      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = pal.name === 'daylight' ? 'source-over' : 'lighter';
      ctx.globalAlpha = pal.name === 'daylight' ? 0.72 : 0.85;
      ctx.drawImage(this.surface, bounds.x, bounds.y, bounds.w, bounds.h);

      ctx.filter = 'blur(14px)';
      ctx.globalAlpha = pal.name === 'daylight' ? 0.35 : 0.72;
      ctx.drawImage(this.glow, bounds.x, bounds.y, bounds.w, bounds.h);
      ctx.filter = 'none';

      // 3. Wave Density & Phase Crest Vector Contours
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      for (let l = 0; l < DENSITY_LEVELS.length; l++) {
        const segs = densityContours(frame.field.density, frame.field.n, DENSITY_LEVELS[l], bounds);
        if (!segs.length) continue;
        ctx.beginPath();
        for (const [[x0, y0], [x1, y1]] of segs) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.strokeStyle = l % 2 === 0 ? pal.accent : pal.magenta;
        ctx.lineWidth = 0.75 + l * 0.25;
        ctx.globalAlpha = 0.14 + l * 0.06;
        ctx.stroke();
      }

      const phaseSegs = phaseContours(frame.field.density, frame.field.phase, frame.field.n, bounds);
      if (phaseSegs.length) {
        ctx.beginPath();
        for (const [[x0, y0], [x1, y1]] of phaseSegs) {
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
        }
        ctx.strokeStyle = pal.lavender;
        ctx.lineWidth = 0.8;
        ctx.globalAlpha = 0.18;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 4. Causal Interaction Links & Traveling Telemetry Pulses
    drawCausalLinks(ctx, camera, frame.entities, frame.links, frame.selectedId, pal, now);

    // 5. Collapse Reticles & Reversal Shockwaves
    drawRipples(ctx, camera, frame.ripples, pal);

    // 6. Quanta (Wave Envelopes -> Classical Faceted Particles)
    drawEntities(ctx, camera, frame.entities, frame.selectedId, pal, now);

    // 7. Interactive Cursor Field Overlay (Press-and-Hold Causal Reversal / Observer / Emitter)
    drawFieldOverlay(ctx, camera, frame.fieldAction, options.dragEmit, pal, now);
  }

  dispose() {
    for (const c of [this.canvas, this.surface, this.glow]) {
      if (c) {
        c.width = c.height = 1;
      }
    }
    this.pixels = null;
    this.glowPixels = null;
    this.waveScratch = {};
  }
}
