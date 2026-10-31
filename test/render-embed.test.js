import test from 'node:test';
import assert from 'node:assert/strict';
import { attributeValue, embedAttributes } from '../src/embed-options.js';
import { palette, phaseRGB } from '../src/render/palette.js';
import { exposure, densityContours, phaseContours, interpolateWave } from '../src/render/density.js';
import { Swarm } from '../src/render/quanta.js';
import { FLAVORS } from '../src/presets.js';
import { FieldRenderer } from '../src/render/field.js';

test('camera keeps the basin circular, fits the viewport, and round-trips pointer coordinates', () => {
  const renderer = { zoom: 1, panX: 0, panY: 0, embedded: false };
  for (const [width, height] of [[1440, 1000], [390, 844], [800, 400], [1000, 1400]]) {
    const camera = FieldRenderer.prototype.cameraProjection.call(renderer, width, height, 108);
    assert.equal(camera.scaleX, camera.scaleY);
    const bounds = camera.worldBoundsScreen();
    assert.ok(bounds.x >= 0 && bounds.y >= 0);
    assert.ok(bounds.x + bounds.w <= width && bounds.y + bounds.h <= height);
    const point = camera.screenToWorld(...camera.worldToScreen(17, -31));
    assert.ok(Math.abs(point[0] - 17) < 1e-10 && Math.abs(point[1] + 31) < 1e-10);
  }
  const camera = FieldRenderer.prototype.cameraProjection.call({ ...renderer, embedded: true, zoom: 3, panX: 100, panY: 80 }, 320, 200, 108);
  assert.equal(camera.cx, 160);
  assert.equal(camera.cy, 100);
  assert.equal(camera.worldBoundsScreen().h, 192);
});

test('embedAttributes validates presets, numeric ranges, and themes', () => {
  const attrs = embedAttributes('?preset=soliton-collider&population=999&theme=citypop&autoplay=false', true);
  assert.equal(attrs.preset, 'soliton-collider');
  assert.equal(attrs.population, '120');
  assert.equal(attrs.theme, 'citypop');
  assert.equal(attrs.autoplay, 'false');
  assert.equal(attrs.embed, '');

  assert.equal(attributeValue('preset', 'unknown-preset'), null);
  assert.equal(attributeValue('mode', 'reverse'), 'reverse');
  assert.equal(attributeValue('mode', 'inspect'), 'inspect');
});

test('regular and embed URLs respect booleans and the first repeated value', () => {
  assert.deepEqual(embedAttributes('', false), {});
  assert.equal(embedAttributes('?embed=false', true).embed, '');
  assert.equal(embedAttributes('?embed=false', false).embed, 'false');
  assert.equal(embedAttributes('?transparent&autofocus=false').transparent, '');
  assert.equal(embedAttributes('?autofocus=false').autofocus, 'false');
  assert.equal(embedAttributes('?preset=invalid&preset=blank').preset, undefined);
  assert.equal(embedAttributes('?speed=invalid&speed=2').speed, undefined);
  assert.equal(embedAttributes('?speed=0.5&speed=2').speed, '0.5');
  assert.equal(embedAttributes('?unknown=value').unknown, undefined);
});

test('palette, wave interpolation, contours, and probability swarm operate cleanly', () => {
  for (const theme of ['citypop', 'cyber', 'daylight']) {
    const pal = palette(theme);
    assert.equal(pal.flavors.length, FLAVORS.length);
  }

  const rgb = phaseRGB(0.5);
  assert.equal(rgb.length, 3);
  assert.ok(exposure(0.5) > 0 && exposure(0.5) <= 1);

  const n = 16;
  const density = new Float32Array(n * n);
  const phase = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - 8, y - 8);
      density[y * n + x] = Math.exp(-(d * d) / 10);
      phase[y * n + x] = (x - y) * 0.3;
    }
  }

  const upscaled = interpolateWave(density, phase, n, 32);
  assert.equal(upscaled.n, 32);
  assert.equal(upscaled.density.length, 32 * 32);

  const bounds = { x: 0, y: 0, w: 100, h: 100 };
  const dSegs = densityContours(density, n, 0.2, bounds);
  const pSegs = phaseContours(density, phase, n, bounds);
  assert.ok(dSegs.length > 0);
  assert.ok(pSegs.length > 0);

  const swarm = new Swarm(100).update(density, 100);
  assert.equal(swarm.empty, false);
});
