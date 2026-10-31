import { test, expect } from '@playwright/test';

test('hosted embed starts with URL settings and fits small containers', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 200 });
  await page.goto('/embed?preset=blank&autoplay=false&speed=0.5&theme=cyber&embed=false&transparent=true&autofocus=false');
  expect(new URL(page.url()).pathname).toMatch(/\/embed\/$/);
  const chamber = page.locator('kyonami-chamber');
  await expect.poll(() => chamber.evaluate(el => Boolean(el.frame))).toBe(true);
  await expect(chamber.locator('.hud-sidebar')).toBeHidden();
  await expect(chamber.locator('.hud-dock')).toBeVisible();
  expect(await chamber.boundingBox()).toMatchObject({ width: 320, height: 200 });
  expect(await chamber.evaluate(el => ({
    preset: el.settings.preset, speed: el.speed, theme: el.theme,
    playing: el.playing, steps: el.frame.stepIndex, count: el.frame.entities.length,
    background: getComputedStyle(el).backgroundColor,
    focused: el.shadowRoot.activeElement !== null,
    alpha: el.renderer.ctx.getImageData(0, 0, 1, 1).data[3]
  }))).toEqual({
    preset: 'blank', speed: 0.5, theme: 'cyber', playing: false,
    steps: 0, count: 0, background: 'rgba(0, 0, 0, 0)', focused: false, alpha: 0
  });
  await page.waitForTimeout(150);
  expect(await chamber.evaluate(el => el.frame.stepIndex)).toBe(0);
  await chamber.evaluate(el => el.setAttribute('transparent', 'false'));
  expect(await chamber.evaluate(el => el.renderer.ctx.getImageData(0, 0, 1, 1).data[3])).toBe(255);
  expect(errors).toEqual([]);
});

test('iframes support both full controls and the embed bottom panel', async ({ page }) => {
  await page.goto('/?autoplay=false');
  await page.evaluate(() => {
    document.querySelector('kyonami-chamber').remove();
    for (const [id, path] of [['regular', './'], ['embed', './embed/']]) {
      const frame = document.createElement('iframe');
      frame.id = id;
      frame.style.cssText = 'width:300px;height:200px;border:0';
      frame.src = `${path}?preset=causal-crystal&autoplay=false`;
      document.body.append(frame);
    }
  });
  for (const id of ['regular', 'embed']) {
    const chamber = page.frameLocator(`#${id}`).locator('kyonami-chamber');
    await expect.poll(() => chamber.evaluate(el => el.frame?.entities.length ?? 0)).toBeGreaterThan(0);
    expect(await chamber.boundingBox()).toMatchObject({ width: 300, height: 200 });
    await expect(chamber.locator('.hud-sidebar')).toBeHidden();
    if (id === 'regular') {
      await expect(chamber.locator('[data-action="toggle-panels"]')).toBeVisible();
      await chamber.locator('[data-action="toggle-panels"]').click();
      await expect(chamber.locator('.hud-sidebar')).toBeVisible();
      await chamber.locator('button[data-action="close-panels"]').click();
    } else {
      await expect(chamber.locator('[data-action="toggle-panels"]')).toBeHidden();
    }
    await expect(chamber.locator('.hud-dock')).toBeVisible();
    const bounds = await chamber.boundingBox();
    for (const control of await chamber.locator('.hud-dock [data-mode]').all()) {
      const box = await control.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.y).toBeGreaterThanOrEqual(bounds.y);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
  }
});

test('web components accept attributes before connection and can toggle embed mode', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?autoplay=false');
  await page.evaluate(async () => {
    await customElements.whenDefined('kyonami-chamber');
    document.querySelector('kyonami-chamber').remove();
    const holder = document.createElement('div');
    holder.style.cssText = 'width:300px;height:180px';
    holder.innerHTML = '<kyonami-chamber id="custom" embed transparent width="800" height="450" preset="blank" autoplay="false"></kyonami-chamber>';
    document.body.append(holder);
  });
  const chamber = page.locator('#custom');
  await expect.poll(() => chamber.evaluate(el => Boolean(el.frame))).toBe(true);
  expect(await chamber.boundingBox()).toMatchObject({ width: 300, height: 180 });
  await expect(chamber.locator('.hud-sidebar')).toBeHidden();
  await expect(chamber.locator('.hud-dock')).toBeVisible();
  expect(await chamber.evaluate(el => el.frame.entities.length)).toBe(0);
  await chamber.evaluate(el => el.setAttribute('embed', 'false'));
  await expect(chamber.locator('.hud-sidebar')).toBeHidden();
  await chamber.locator('[data-action="toggle-panels"]').click();
  await expect(chamber.locator('.hud-sidebar')).toBeVisible();
  await expect(chamber.locator('.hud-dock')).toBeVisible();
  await chamber.evaluate(el => el.setAttribute('embed', ''));
  await expect(chamber.locator('.hud-sidebar')).toBeHidden();
  await expect(chamber.locator('.hud-dock')).toBeVisible();
  await chamber.evaluate(el => el.setAttribute('preset', 'causal-crystal'));
  await expect.poll(() => chamber.evaluate(el => el.frame.entities.length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('embed bottom panel changes modes and emits the selected particle type', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 200 });
  await page.goto('/embed/?preset=blank&autoplay=false');
  const chamber = page.locator('kyonami-chamber');
  await expect.poll(() => chamber.evaluate(el => Boolean(el.frame))).toBe(true);

  for (const mode of ['reverse', 'observe', 'inspect']) {
    const button = chamber.locator(`[data-mode="${mode}"]`);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(await chamber.evaluate(el => el.cursorMode)).toBe(mode);
  }

  const emit = chamber.getByRole('button', { name: 'Emit particle', exact: true });
  await emit.click();
  await chamber.getByRole('option', { name: 'SPINNER', exact: true }).click();
  await expect(emit).toHaveAttribute('aria-pressed', 'true');
  await chamber.locator('.cosmos-canvas').click({ position: { x: 160, y: 60 } });
  await expect.poll(() => chamber.evaluate(el => el.frame.entities.length)).toBe(1);
  expect(await chamber.evaluate(el => el.frame.selectedInspector.flavor)).toBe(0);
  expect(await chamber.evaluate(el => el.frame.stepIndex)).toBe(0);
});

test('embed fills its parent, locks the camera, and renders at the container resolution', async ({ page }) => {
  await page.goto('/embed/?preset=blank&autoplay=false&width=80&height=60&mode=inspect');
  const chamber = page.locator('kyonami-chamber');
  await expect.poll(() => chamber.evaluate(el => Boolean(el.frame))).toBe(true);
  expect(await chamber.boundingBox()).toMatchObject(page.viewportSize());
  const canvas = chamber.locator('.cosmos-canvas');
  const before = await chamber.evaluate(el => {
    const canvas = el.shadowRoot.querySelector('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return { width: canvas.width, height: canvas.height, dpr };
  });
  expect(before.width).toBe(Math.round(page.viewportSize().width * before.dpr));
  expect(before.height).toBe(Math.round(page.viewportSize().height * before.dpr));
  await canvas.dispatchEvent('wheel', { deltaY: -120, cancelable: true });
  await canvas.dispatchEvent('pointerdown', { pointerId: 3, button: 1, clientX: 40, clientY: 40 });
  await canvas.dispatchEvent('pointermove', { pointerId: 3, clientX: 100, clientY: 80 });
  await canvas.dispatchEvent('pointerup', { pointerId: 3 });
  expect(await chamber.evaluate(el => [el.renderer.zoom, el.renderer.panX, el.renderer.panY])).toEqual([1, 0, 0]);
  await chamber.evaluate(el => {
    el.removeAttribute('width');
    el.removeAttribute('height');
    el.setAttribute('embed', 'false');
  });
  await canvas.dispatchEvent('wheel', { deltaY: -120, cancelable: true });
  expect(await chamber.evaluate(el => el.renderer.zoom)).toBeGreaterThan(1);
  await chamber.evaluate(el => el.setAttribute('embed', ''));
  expect(await chamber.evaluate(el => [el.renderer.zoom, el.renderer.panX, el.renderer.panY])).toEqual([1, 0, 0]);
  await page.setViewportSize({ width: 240, height: 140 });
  await expect.poll(() => canvas.evaluate(el => el.height)).toBe(Math.round(140 * before.dpr));
  expect(await chamber.boundingBox()).toMatchObject({ width: 240, height: 140 });
});
