import { FONT_FAMILY } from '../typography.js';

const clamp01 = t => Math.min(1, Math.max(0, t));

function getUiScale(camera) {
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const minCssDim = Math.min(camera.width || 800, camera.height || 600) / dpr;
  const sizeFactor = minCssDim < 560 ? 0.9 : 1;
  return dpr * sizeFactor;
}

function drawCanvasBadge(
  ctx,
  text,
  x,
  y,
  borderColor,
  textColor,
  isDaylight,
  uiScale,
  align = 'left',
  variant = 'tag'
) {
  ctx.save();
  const baseFont = variant === 'banner' ? 15 : 13.5;
  const fontSize = Math.round(baseFont * uiScale);
  ctx.font = `700 ${fontSize}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const padX = Math.round((variant === 'banner' ? 9 : 7) * uiScale);
  const padY = Math.round((variant === 'banner' ? 5 : 3.5) * uiScale);
  const metrics = ctx.measureText(text);
  const boxW = Math.ceil(metrics.width + padX * 2);
  const boxH = Math.ceil(fontSize + padY * 2);

  let boxX = align === 'center' ? x - boxW * 0.5 : x;
  let boxY = y - boxH * 0.5;

  if (ctx.canvas) {
    const margin = Math.round(10 * uiScale);
    boxX = Math.max(margin, Math.min(ctx.canvas.width - boxW - margin, boxX));
    boxY = Math.max(margin, Math.min(ctx.canvas.height - boxH - margin, boxY));
  }

  ctx.fillStyle = isDaylight ? 'rgba(252, 245, 255, 0.9)' : 'rgba(12, 4, 28, 0.84)';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = Math.max(1, 1.2 * uiScale);
  ctx.globalAlpha = variant === 'banner' ? 0.96 : 0.9;

  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, boxH);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.globalAlpha = 1;
  ctx.fillText(text, boxX + padX, boxY + boxH * 0.5 + 0.5);
  ctx.restore();
}

// Display-only probability cloud samples over the 2D wave field.
export class Swarm {
  constructor(count = 260) {
    this.count = count;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.cell = new Int32Array(count).fill(-1);
    this.cdf = null;
    this.empty = true;
  }

  update(field, worldRadius, churn = 0.015) {
    if (!field || !field.length) {
      this.empty = true;
      this.cell.fill(-1);
      return this;
    }
    const n = Math.round(Math.sqrt(field.length));
    if (!this.cdf || this.cdf.length !== field.length) {
      this.cdf = new Float64Array(field.length);
    }

    let sum = 0;
    for (let i = 0; i < field.length; i++) {
      sum += field[i];
      this.cdf[i] = sum;
    }
    this.total = sum;
    this.empty = !(sum > 1e-6);
    if (this.empty) {
      this.cell.fill(-1);
      return this;
    }

    const floor = (sum / field.length) * 0.04;
    const span = worldRadius * 2;

    for (let k = 0; k < this.count; k++) {
      const c = this.cell[k];
      if (c < 0 || Math.random() < churn || field[c] < floor) {
        const target = Math.random() * sum;
        let lo = 0;
        let hi = this.cdf.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (this.cdf[mid] < target) lo = mid + 1;
          else hi = mid;
        }
        this.cell[k] = lo;
        this.x[k] = -worldRadius + ((lo % n) + Math.random()) * (span / n);
        this.y[k] = -worldRadius + (Math.floor(lo / n) + Math.random()) * (span / n);
      }
    }
    return this;
  }
}

export function drawSwarm(ctx, camera, swarm, pal, alpha = 1) {
  if (swarm.empty || alpha <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = alpha * 0.38;
  const size = Math.max(1.4, camera.scale * 0.38);
  for (let k = 0; k < swarm.count; k++) {
    const [sx, sy] = camera.worldToScreen(swarm.x[k], swarm.y[k]);
    ctx.fillRect(sx - size * 0.5, sy - size * 0.5, size, size);
  }
  ctx.restore();
}

export function drawCausalLinks(ctx, camera, entities, links, selectedId, pal, now) {
  if (!links || !links.length) return;
  const byId = new Map();
  for (const e of entities) {
    byId.set(e.id, e);
  }

  ctx.save();
  ctx.lineCap = 'round';

  for (const link of links) {
    const a = byId.get(link.a);
    const b = byId.get(link.b);
    if (!a || !b) continue;

    const [ax, ay] = camera.worldToScreen(a.x, a.y);
    const [bx, by] = camera.worldToScreen(b.x, b.y);
    const isSelected = selectedId !== null && (link.a === selectedId || link.b === selectedId);
    const strength = clamp01(link.strength);

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);

    if (isSelected) {
      ctx.strokeStyle = pal.amber;
      ctx.lineWidth = Math.max(1.6, 2.6 * strength);
      ctx.globalAlpha = 0.88;
      ctx.stroke();
    } else {
      ctx.strokeStyle = pal.lavender;
      ctx.lineWidth = Math.max(0.8, 1.8 * strength);
      ctx.globalAlpha = 0.22 + 0.42 * strength;
      ctx.stroke();
    }

    // Smooth telemetry pulse traveling along the causal chain
    const pulseT = ((now * 0.00045 + (link.a * 0.17 + link.b * 0.31)) % 1 + 1) % 1;
    const px = ax + (bx - ax) * pulseT;
    const py = ay + (by - ay) * pulseT;
    ctx.fillStyle = isSelected ? pal.accent : pal.magenta;
    ctx.globalAlpha = (isSelected ? 0.9 : 0.48) * strength;
    const dotSize = isSelected ? 3.5 : 2.2;
    ctx.fillRect(px - dotSize * 0.5, py - dotSize * 0.5, dotSize, dotSize);
  }

  ctx.restore();
}

export function drawRipples(ctx, camera, ripples, pal) {
  if (!ripples || !ripples.length) return;
  ctx.save();

  for (const r of ripples) {
    const t = clamp01(r.age / Math.max(0.01, r.maxAge));
    const ease = 1 - Math.pow(1 - t, 3);
    const sigma = r.fromSigma + (r.toSigma - r.fromSigma) * ease;
    const [sx, sy] = camera.worldToScreen(r.x, r.y);
    const rad = Math.max(4, sigma * camera.scale * 0.55);
    const flavorColor = pal.flavors[r.flavor]?.hex ?? pal.accent;

    ctx.globalAlpha = (1 - t) * 0.42;
    ctx.strokeStyle = r.kind === 'reverse' ? pal.amber : flavorColor;
    ctx.lineWidth = r.kind === 'reverse' ? 1.5 : 1.1;

    if (r.kind === 'collapse') {
      // Retrofuturist contracting diamond reticle on wave collapse
      ctx.beginPath();
      ctx.moveTo(sx, sy - rad);
      ctx.lineTo(sx + rad, sy);
      ctx.lineTo(sx, sy + rad);
      ctx.lineTo(sx - rad, sy);
      ctx.closePath();
      ctx.stroke();
    } else {
      // Expanding re-coherence wave ring on causal reversal
      ctx.beginPath();
      ctx.ellipse(sx, sy, rad * camera.scaleX / camera.scale, rad, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function drawEntities(ctx, camera, entities, selectedId, pal, now) {
  if (!entities || !entities.length) return;
  ctx.save();
  const uiScale = getUiScale(camera);
  const isDaylight = pal.name === 'daylight';
  let selectedOverlay = null;

  for (const e of entities) {
    const [sx, sy] = camera.worldToScreen(e.x, e.y);
    const fCol = pal.flavors[e.flavor] ?? pal.flavors[0];
    const q = clamp01(e.coherence);
    const classicality = 1 - q;
    const sigmaPx = Math.max(4, e.sigma * camera.scale);
    const isSelected = e.id === selectedId;

    // 1. Classical motion ribbon trail (stronger as entity becomes more particle-like)
    if (e.trail && e.trail.length > 1 && classicality > 0.12) {
      ctx.beginPath();
      for (let i = 0; i < e.trail.length; i++) {
        const [tx, ty] = camera.worldToScreen(e.trail[i][0], e.trail[i][1]);
        if (i === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.strokeStyle = fCol.hex;
      ctx.lineWidth = Math.max(1, 2.2 * classicality);
      ctx.globalAlpha = 0.12 + 0.36 * classicality;
      ctx.stroke();
    }

    // 2. Quantum uncertainty wave envelope (prominent when q is high; tightens as causal chain grows)
    if (q > 0.08) {
      ctx.beginPath();
      ctx.ellipse(sx, sy, sigmaPx * camera.scaleX / camera.scale, sigmaPx, 0, 0, Math.PI * 2);
      ctx.strokeStyle = fCol.hex;
      ctx.lineWidth = isSelected ? 1.6 : 0.9;
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.14 + 0.34 * q;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Core particle geometry (crystallizes from soft phase dot into crisp faceted vector polyhedron)
    const massSize = e.mass > 0 ? Math.min(1.8, Math.cbrt(e.mass)) : 0.85;
    const coreRadius = Math.max(2.8, (2.4 + 3.4 * classicality) * Math.min(1.8, camera.scale * 0.26)) * massSize;
    ctx.fillStyle = fCol.hex;
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.45 + 0.55 * classicality;

    ctx.beginPath();
    if (e.flavor === 4) {
      // Photon: bright four-point energy spark.
      const r = coreRadius * 1.6;
      for (let k = 0; k < 8; k++) {
        const angle = k * Math.PI / 4;
        const radius = k % 2 === 0 ? r : r * 0.3;
        const px = sx + Math.cos(angle) * radius;
        const py = sy + Math.sin(angle) * radius;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (e.constituentCount > 1) {
      // Composite: faceted hexagon, scaled by its combined mass.
      for (let k = 0; k < 6; k++) {
        const angle = e.phase * 0.15 + k * Math.PI / 3;
        const px = sx + Math.cos(angle) * coreRadius * 1.2;
        const py = sy + Math.sin(angle) * coreRadius * 1.2;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (e.flavor === 0) {
      // Spinner: diamond; its spin is an entity property.
      const r = coreRadius * 1.25;
      ctx.moveTo(sx, sy - r);
      ctx.lineTo(sx + r, sy);
      ctx.lineTo(sx, sy + r);
      ctx.lineTo(sx - r, sy);
      ctx.closePath();
    } else if (e.flavor === 2) {
      // Drifter: small triangle
      ctx.moveTo(sx, sy - coreRadius * 1.3);
      ctx.lineTo(sx + coreRadius, sy + coreRadius);
      ctx.lineTo(sx - coreRadius, sy + coreRadius);
      ctx.closePath();
    } else if (e.flavor === 3) {
      // Anchor: large square
      ctx.rect(sx - coreRadius, sy - coreRadius, coreRadius * 2, coreRadius * 2);
    } else {
      // Binder: circle
      ctx.arc(sx, sy, coreRadius * 1.05, 0, Math.PI * 2);
    }
    ctx.fill();

    if (classicality > 0.45) {
      ctx.lineWidth = 0.9;
      ctx.globalAlpha = 0.75 * classicality;
      ctx.stroke();
    }

    // 4. Selected entity retrofuturist target reticle
    if (isSelected) {
      const bracketR = Math.max(coreRadius + 8 * uiScale, sigmaPx * 0.65);
      const corner = Math.min(10 * uiScale, bracketR * 0.45);
      ctx.strokeStyle = pal.amber;
      ctx.lineWidth = Math.max(1.6, 1.6 * uiScale);
      ctx.globalAlpha = 0.95;

      ctx.beginPath();
      // Top-left bracket
      ctx.moveTo(sx - bracketR, sy - bracketR + corner);
      ctx.lineTo(sx - bracketR, sy - bracketR);
      ctx.lineTo(sx - bracketR + corner, sy - bracketR);
      // Top-right bracket
      ctx.moveTo(sx + bracketR - corner, sy - bracketR);
      ctx.lineTo(sx + bracketR, sy - bracketR);
      ctx.lineTo(sx + bracketR, sy - bracketR + corner);
      // Bottom-right bracket
      ctx.moveTo(sx + bracketR, sy + bracketR - corner);
      ctx.lineTo(sx + bracketR, sy + bracketR);
      ctx.lineTo(sx + bracketR - corner, sy + bracketR);
      // Bottom-left bracket
      ctx.moveTo(sx - bracketR + corner, sy + bracketR);
      ctx.lineTo(sx - bracketR, sy + bracketR);
      ctx.lineTo(sx - bracketR, sy + bracketR - corner);
      ctx.stroke();

      selectedOverlay = {
        tag: `#${e.id}  C:${e.causalDepth.toFixed(1)}  σ:${e.sigma.toFixed(1)}`,
        x: sx + bracketR + 8 * uiScale,
        y: sy
      };
    }
  }

  // Draw selected entity telemetry pill on top of all entities so it is always legible
  if (selectedOverlay) {
    drawCanvasBadge(
      ctx,
      selectedOverlay.tag,
      selectedOverlay.x,
      selectedOverlay.y,
      pal.amber,
      pal.amber,
      isDaylight,
      uiScale,
      'left'
    );
  }

  ctx.restore();
}

export function drawFieldOverlay(ctx, camera, fieldAction, dragEmit, pal, now) {
  ctx.save();
  const uiScale = getUiScale(camera);
  const isDaylight = pal.name === 'daylight';

  if (fieldAction && fieldAction.active) {
    const isReverse = fieldAction.mode === 'reverse' || fieldAction.global;
    const [cx, cy] = fieldAction.global
      ? [camera.width * 0.5, camera.height * 0.5]
      : camera.worldToScreen(fieldAction.x, fieldAction.y);
    const radiusPx = fieldAction.global
      ? Math.hypot(camera.width, camera.height) * 0.45
      : Math.max(22 * uiScale, fieldAction.radius * camera.scale);
    const radiusX = fieldAction.global ? radiusPx : radiusPx * camera.scaleX / camera.scale;

    const primary = isReverse ? pal.amber : pal.magenta;
    const secondary = isReverse ? pal.accent : pal.lavender;

    // Translucent radial chronosphere glow
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, radiusPx);
    grad.addColorStop(0, isReverse ? 'rgba(255, 184, 77, 0.22)' : 'rgba(255, 46, 151, 0.22)');
    grad.addColorStop(0.65, isReverse ? 'rgba(0, 245, 212, 0.10)' : 'rgba(167, 123, 255, 0.10)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX, radiusPx, 0, 0, Math.PI * 2);
    ctx.fill();

    // Slowly rotating vector chronosphere ring
    ctx.strokeStyle = primary;
    ctx.lineWidth = Math.max(1.6, 1.8 * uiScale);
    ctx.globalAlpha = 0.88;
    ctx.setLineDash([10 * uiScale, 6 * uiScale]);
    ctx.lineDashOffset = isReverse ? now * 0.014 : -now * 0.014;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX, radiusPx, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Inner counter-rotating ring
    ctx.strokeStyle = secondary;
    ctx.lineWidth = Math.max(1.1, 1.2 * uiScale);
    ctx.setLineDash([4 * uiScale, 8 * uiScale]);
    ctx.lineDashOffset = isReverse ? -now * 0.018 : now * 0.018;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radiusX * 0.62, radiusPx * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // High-contrast centered overlay badge
    const labelText = isReverse
      ? '◀◀ CAUSALITY REVERSAL'
      : '◎ OBSERVER COLLAPSE';
    const labelY = fieldAction.global
      ? camera.height * 0.18
      : cy - radiusPx - 18 * uiScale;
    drawCanvasBadge(ctx, labelText, cx, labelY, primary, primary, isDaylight, uiScale, 'center', 'banner');
  }

  if (dragEmit && dragEmit.active) {
    const [sx, sy] = camera.worldToScreen(dragEmit.startX, dragEmit.startY);
    const [ex, ey] = camera.worldToScreen(dragEmit.curX, dragEmit.curY);
    const dx = sx - ex;
    const dy = sy - ey;
    const dist = Math.hypot(dx, dy);
    const tx = sx + dx;
    const ty = sy + dy;

    // Slingshot tension cord (from spawn anchor to pulled cursor)
    ctx.strokeStyle = pal.magenta;
    ctx.lineWidth = Math.max(1.8, 1.8 * uiScale);
    ctx.setLineDash([5 * uiScale, 5 * uiScale]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    // Forward launch trajectory arrow (opposite of drag direction)
    if (dist > 3) {
      ctx.strokeStyle = pal.accent;
      ctx.lineWidth = Math.max(2.2, 2.2 * uiScale);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      const ang = Math.atan2(dy, dx);
      const headLen = Math.min(14 * uiScale, Math.max(8 * uiScale, dist * 0.22));
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - Math.cos(ang - 0.42) * headLen, ty - Math.sin(ang - 0.42) * headLen);
      ctx.lineTo(tx - Math.cos(ang + 0.42) * headLen, ty - Math.sin(ang + 0.42) * headLen);
      ctx.closePath();
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(sx, sy, 22 * uiScale, 0, Math.PI * 2);
    ctx.strokeStyle = pal.magenta;
    ctx.lineWidth = Math.max(1.5, 1.6 * uiScale);
    ctx.stroke();

    ctx.fillStyle = pal.amber;
    ctx.beginPath();
    ctx.arc(ex, ey, 5 * uiScale, 0, Math.PI * 2);
    ctx.fill();

    drawCanvasBadge(
      ctx,
      'SLINGSHOT WAVEPACKET',
      sx,
      sy - 34 * uiScale,
      pal.accent,
      pal.accent,
      isDaylight,
      uiScale,
      'center',
      'banner'
    );
  }

  ctx.restore();
}
