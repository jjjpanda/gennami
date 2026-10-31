import { test, expect } from '@playwright/test';

test('controls and canvas use IBM Plex Mono with a circular basin', async ({ page }) => {
  await page.goto('/?autoplay=false');
  const chamber = page.locator('kyonami-chamber');
  await expect.poll(() => chamber.evaluate(el => Boolean(el.frame))).toBe(true);
  const result = await chamber.evaluate(el => {
    const canvas = el.shadowRoot.querySelector('canvas');
    const camera = el.renderer.cameraProjection(canvas.width, canvas.height, el.settings.worldRadius);
    const elements = [el, ...el.shadowRoot.querySelectorAll('button, input, h2, kbd')];
    return {
      fonts: [...new Set(elements.map(element => getComputedStyle(element).fontFamily))],
      circular: camera.scaleX === camera.scaleY,
      bounds: camera.worldBoundsScreen(),
      canvas: [canvas.width, canvas.height]
    };
  });
  expect(result.fonts).toEqual(['"IBM Plex Mono", monospace']);
  expect(result.circular).toBe(true);
  expect(result.bounds.x).toBeGreaterThanOrEqual(0);
  expect(result.bounds.y).toBeGreaterThanOrEqual(0);
  expect(result.bounds.x + result.bounds.w).toBeLessThanOrEqual(result.canvas[0]);
  expect(result.bounds.y + result.bounds.h).toBeLessThanOrEqual(result.canvas[1]);
});

async function openPanel(chamber, panel = 'controls') {
  const toggle = chamber.locator('[data-action="toggle-panels"]');
  if (!await toggle.isVisible() && !await chamber.locator('.panel-menu-header').isVisible()) return;
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await chamber.locator(`button[data-panel="${panel}"]`).click();
}

async function closePanels(chamber) {
  const close = chamber.locator('button[data-action="close-panels"]');
  if (await close.isVisible()) await close.click();
}

async function chooseOption(chamber, control, label) {
  await openPanel(chamber);
  const trigger = chamber.getByRole('combobox', { name: control });
  await trigger.scrollIntoViewIfNeeded();
  // Let the sidebar finish scrolling before opening its popover.
  await chamber.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await trigger.click();
  await chamber.getByRole('option', { name: label, exact: true }).click();
}

test('panels use full-height tabs through 1100px and split above, with one control per row', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Viewport matrix includes mobile sizes.');
  await page.goto('/?preset=causal-crystal&autoplay=false');
  const chamber = page.locator('kyonami-chamber');
  await expect.poll(() => chamber.evaluate(el => Boolean(el.frame))).toBe(true);

  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const [width, height] of [[280, 640], [320, 200], [390, 844], [768, 1024], [780, 390], [819, 900], [820, 900], [1024, 400], [1024, 768], [1100, 900], [1101, 900], [1200, 400], [1440, 1000], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    if (width < 820) {
      const toggle = chamber.locator('[data-action="toggle-panels"]');
      await expect(chamber.locator('.hud-panels')).toBeHidden();
      await expect(chamber.locator('.cosmos-canvas')).toHaveCSS('width', `${width}px`);
      await openPanel(chamber);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const controls = await chamber.locator('.hud-sidebar').boundingBox();
      const panel = await chamber.locator('.hud-panels').boundingBox();
      const inset = width <= 360 ? 6 : 8;
      expect(panel.y).toBe(inset);
      expect(panel.y + panel.height).toBe(height - inset);
      expect(panel.width).toBeLessThanOrEqual(320);
      expect(controls.y + controls.height).toBe(height - inset);
      await expect(chamber.locator('.hud-inspector')).toBeHidden();
      if (height >= 640) {
        const playback = await chamber.locator('.sidebar-controls').boundingBox();
        expect(controls.y + controls.height - playback.y - playback.height).toBeLessThan(14);
      }
      await chamber.locator('[data-action="restart"]').scrollIntoViewIfNeeded();
      await expect(chamber.locator('[data-action="restart"]')).toBeInViewport();
      await chamber.locator('[data-action="toggle-drawer"]').click();
      const tuning = chamber.locator('[data-role="drawer"]');
      const tuningBox = await tuning.boundingBox();
      expect(tuningBox.y).toBe(inset);
      expect(tuningBox.y + tuningBox.height).toBe(height - inset);
      await page.keyboard.press('Escape');
      await expect(tuning).toBeHidden();
      await openPanel(chamber, 'inspector');
      const inspector = await chamber.locator('.hud-inspector').boundingBox();
      expect(inspector.y).toBe(controls.y);
      expect(inspector.height).toBe(controls.height);
      await expect(chamber.locator('.hud-sidebar')).toBeHidden();
      await chamber.locator('.inspector-guide summary').click();
      await expect(chamber.locator('.inspector-guide dl')).toBeVisible();
      expect(await chamber.locator('.hud-inspector').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await chamber.locator('.inspector-guide summary').click();
      await page.keyboard.press('Escape');
      await expect(chamber.locator('.hud-panels')).toBeHidden();
      await expect(toggle).toBeFocused();
      await toggle.press('Space');
      await expect(chamber.locator('.hud-inspector')).toBeVisible();
      expect(await chamber.evaluate(el => el.globalReverseHeld)).toBe(false);
      await closePanels(chamber);
      if (width > 320) {
        await openPanel(chamber);
        await chamber.locator('.panel-backdrop').click({ position: { x: 1, y: height / 2 } });
        await expect(chamber.locator('.hud-panels')).toBeHidden();
      }
      continue;
    }
    await expect(chamber.locator('[data-action="toggle-panels"]')).toBeHidden();
    await openPanel(chamber);
    const sidebar = await chamber.locator('.hud-sidebar').boundingBox();
    if (width <= 1100) {
      await expect(chamber.locator('.hud-inspector')).toBeHidden();
      await expect(chamber.locator('button[data-action="close-panels"]')).toBeHidden();
      await openPanel(chamber, 'inspector');
      await expect(chamber.locator('.hud-sidebar')).toBeHidden();
      await expect(chamber.locator('button[data-panel="inspector"]')).toHaveAttribute('aria-pressed', 'true');
    }
    const inspector = await chamber.locator('.hud-inspector').boundingBox();
    await openPanel(chamber);
    const dock = await chamber.locator('.hud-dock').boundingBox();
    for (const box of [sidebar, inspector, dock]) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    expect(overlaps(sidebar, dock)).toBe(false);
    expect(overlaps(inspector, dock)).toBe(false);
    expect(sidebar.width).toBeLessThanOrEqual(260);
    expect(inspector.width).toBeLessThanOrEqual(260);
    if (width > 1100) {
      expect(sidebar.x).toBeLessThan(20);
      expect(inspector.x).toBeGreaterThan(width - 280);
      expect(sidebar.y).toBe(inspector.y);
      expect(sidebar.height).toBe(inspector.height);
      expect(sidebar.y).toBe(10);
      expect(sidebar.y + sidebar.height).toBeCloseTo(height - 10, 0);
      expect(inspector.y + inspector.height).toBeCloseTo(height - 10, 0);
      const playback = await chamber.locator('.sidebar-controls').boundingBox();
      expect(sidebar.y + sidebar.height - playback.y - playback.height).toBeLessThan(14);
      expect(sidebar.x + sidebar.width).toBeLessThan(dock.x);
      expect(dock.x + dock.width).toBeLessThan(inspector.x);
      if (height >= 900) {
        const log = await chamber.locator('.chain-list').boundingBox();
        expect(log.height).toBeGreaterThan(120);
        expect(inspector.y + inspector.height - log.y - log.height).toBeLessThan(16);
      }
    } else {
      expect(sidebar.x).toBe(inspector.x);
      expect(sidebar.y).toBe(inspector.y);
      expect(sidebar.height).toBe(inspector.height);
      expect(inspector.y + inspector.height).toBeCloseTo(height - 10, 0);
      const header = await chamber.locator('.panel-menu-header').boundingBox();
      expect(header.y).toBe(10);
      expect(sidebar.y).toBe(header.y + header.height);
      const playback = await chamber.locator('.sidebar-controls').boundingBox();
      expect(sidebar.y + sidebar.height - playback.y - playback.height).toBeLessThan(14);
      const canvas = chamber.locator('.cosmos-canvas');
      await expect.poll(() => canvas.evaluate(el => el.width === Math.max(1,
        Math.round(el.getBoundingClientRect().width * Math.min(2, devicePixelRatio || 1))))).toBe(true);
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox.x + canvasBox.width).toBeLessThan(sidebar.x);
      const basin = await chamber.evaluate(el => {
        const canvas = el.shadowRoot.querySelector('canvas');
        const rect = canvas.getBoundingClientRect();
        const camera = el.renderer.cameraProjection(canvas.width, canvas.height, el.settings.worldRadius);
        const bounds = camera.worldBoundsScreen();
        return { x: rect.x + bounds.x / canvas.width * rect.width,
          right: rect.x + (bounds.x + bounds.w) / canvas.width * rect.width };
      });
      expect(basin.x).toBeGreaterThanOrEqual(canvasBox.x);
      expect(basin.right).toBeLessThanOrEqual(canvasBox.x + canvasBox.width);
      await canvas.focus();
      await page.keyboard.press('h');
      await expect(canvas).toHaveCSS('width', `${width}px`);
      await page.keyboard.press('h');
      await expect(canvas).toHaveCSS('width', `${canvasBox.width}px`);
    }
    for (const panel of await chamber.locator('.hud-sidebar, .hud-inspector, .hud-dock').all()) {
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }

    const controls = await chamber.locator('.sidebar-controls .action-group > *').all();
    let previous;
    for (const control of controls) {
      const box = await control.boundingBox();
      if (previous) {
        expect(box.x).toBe(previous.x);
        expect(box.width).toBe(previous.width);
        expect(box.y).toBeGreaterThanOrEqual(previous.y + previous.height);
      }
      previous = box;
    }

    // Full-height tuning on a wide chamber leaves the center dock exposed.
    await chamber.locator('[data-action="toggle-drawer"]').click();
    const drawer = chamber.locator('[data-role="drawer"]');
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox.x).toBeGreaterThanOrEqual(0);
    expect(drawerBox.x + drawerBox.width).toBeLessThanOrEqual(width);
    expect(drawerBox.y + drawerBox.height).toBeLessThanOrEqual(height);
    expect(overlaps(drawerBox, dock)).toBe(false);
    expect(await drawer.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await chamber.locator('[data-action="close-drawer"]').click();
    await openPanel(chamber, 'inspector');
    await chamber.locator('.inspector-guide summary').click();
    await expect(chamber.locator('.inspector-guide dl')).toBeVisible();
    await chamber.locator('.inspector-guide summary').click();
    await openPanel(chamber);
    // Scrolling reveals the final control even in a short panel.
    await chamber.locator('[data-action="restart"]').scrollIntoViewIfNeeded();
    await expect(chamber.locator('[data-action="restart"]')).toBeInViewport();
  }

  // Responsiveness follows a custom-sized component, even on a wide monitor.
  await page.setViewportSize({ width: 1920, height: 1080 });
  await chamber.evaluate(el => { el.setAttribute('width', '780'); el.setAttribute('height', '600'); });
  await expect(chamber.locator('.hud-panels')).toBeHidden();
  await openPanel(chamber, 'inspector');
  const inspector = await chamber.locator('.hud-inspector').boundingBox();
  expect(inspector.y + inspector.height).toBe(592);
  await chamber.evaluate(el => el.setAttribute('embed', ''));
  await expect(chamber.locator('.hud-sidebar')).toBeHidden();
  await expect(chamber.locator('.hud-inspector')).toBeHidden();
  await expect(chamber.locator('.hud-dock')).toBeVisible();
  await expect(chamber.locator('[data-action="toggle-panels"]')).toBeHidden();
  await expect(chamber.locator('.cosmos-canvas')).toHaveCSS('width', '1920px');
  await chamber.evaluate(el => el.setAttribute('embed', 'false'));
  await expect(chamber.locator('.hud-panels')).toBeHidden();
  await openPanel(chamber);
  await expect(chamber.locator('.hud-sidebar')).toBeVisible();
  await chamber.locator('.cosmos-canvas').focus();
  await page.keyboard.press('h');
  await expect(chamber.locator('.hud-sidebar')).toBeHidden();
  await expect(chamber.locator('.hud-inspector')).toBeHidden();
  await expect(chamber.locator('.cosmos-canvas')).toHaveCSS('width', '780px');
  await chamber.locator('[data-action="toggle-hud"]').filter({ hasText: 'SHOW HUD' }).click();
  await expect(chamber.locator('[data-action="toggle-panels"]')).toBeVisible();
  await expect(chamber.locator('.hud-panels')).toBeHidden();
});

test('compact controls support speed, pause, and global reverse', async ({ page }, testInfo) => {
  await page.goto('/?preset=causal-crystal&speed=0.5&autoplay=false');
  const chamber = page.locator('kyonami-chamber');
  await openPanel(chamber);
  const canvas = chamber.locator('.cosmos-canvas');
  const speed = chamber.getByRole('combobox', { name: 'Simulation speed' });
  const rewind = chamber.getByRole('button', { name: 'Global reverse (hold Space)' });
  await expect(speed).toHaveText('0.5×');
  await expect(chamber.locator('.hud-sidebar .hud-overview')).toHaveCount(1);
  await expect(chamber.locator('.hud-panels .hud-inspector')).toHaveCount(1);
  await expect(chamber.locator('.hud-sidebar .action-group [data-action]')).toHaveCount(4);
  await expect(chamber.locator('.hud-sidebar').getByRole('combobox', { name: 'Simulation speed' })).toHaveCount(1);
  await expect(chamber.locator('.hud-dock [data-action], .hud-dock .speed-control')).toHaveCount(0);
  await expect(chamber.locator('.hud-dock [data-mode]')).toHaveCount(4);
  await expect(chamber.locator('.brand-title, .hud-top, select')).toHaveCount(0);
  const overview = await chamber.locator('.hud-overview').boundingBox();
  expect(overview.height).toBeLessThan(150);

  await expect.poll(() => chamber.evaluate(el => Boolean(el.frame))).toBe(true);
  const preset = chamber.getByRole('combobox', { name: 'Simulation preset' });
  await preset.click();
  await expect(chamber.getByRole('option', { name: 'Mixed particles', exact: true })).toBeVisible();
  expect(await chamber.locator('.hud-sidebar').evaluate(el => el.scrollLeft)).toBe(0);
  await page.screenshot({ path: `.artifacts/preset-dropdown-${testInfo.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(preset).toHaveAttribute('aria-expanded', 'false');
  expect(await chamber.locator('.hud-sidebar').evaluate(el => el.scrollLeft)).toBe(0);
  await chooseOption(chamber, 'Simulation speed', '0.25×');
  expect(await chamber.evaluate(el => el.speed)).toBe(0.25);
  await chamber.evaluate(el => el.setAttribute('speed', '1.5'));
  await expect(speed).toHaveText('1.5×');
  await chooseOption(chamber, 'Simulation speed', '8×');

  // A shortcut from the focused canvas must run once, and preserve the chosen speed.
  await canvas.focus();
  await page.keyboard.press('p');
  await expect(chamber.locator('[data-action="play-pause"]')).toHaveText('PAUSE [P]');
  await expect.poll(() => chamber.evaluate(el => el.frame.stepIndex)).toBeGreaterThan(0);
  await page.keyboard.press('p');
  await expect(chamber.locator('[data-action="play-pause"]')).toHaveText('PLAY [P]');
  await expect(speed).toHaveText('8×');
  await expect.poll(() => chamber.evaluate(el => el.client.busy)).toBe(false);
  const pausedStep = await chamber.evaluate(el => el.frame.stepIndex);
  await page.waitForTimeout(120);
  expect(await chamber.evaluate(el => el.frame.stepIndex)).toBe(pausedStep);

  await page.keyboard.down('Space');
  await expect(rewind).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => chamber.evaluate(el => el.frame.stepIndex)).toBeGreaterThan(pausedStep);
  await page.keyboard.up('Space');
  await expect(rewind).toHaveAttribute('aria-pressed', 'false');
  await rewind.dispatchEvent('pointerdown', { pointerId: 1 });
  await expect(rewind).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(rewind).toHaveAttribute('aria-pressed', 'false');

  // Dropdown keyboard interaction must not trigger global rewind.
  await speed.focus();
  await speed.dispatchEvent('keydown', { key: ' ', code: 'Space', bubbles: true, composed: true });
  await expect(rewind).toHaveAttribute('aria-pressed', 'false');
  await speed.press('ArrowDown');
  await expect(speed).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(speed).toHaveText('0.25×');
  await speed.press('Enter');
  await page.keyboard.press('Escape');
  await expect(speed).toHaveAttribute('aria-expanded', 'false');
  await expect(speed).toBeFocused();

  for (const control of await chamber.locator('.hud-dock button:visible').all()) {
    const box = await control.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
  }
  await canvas.focus();
  await page.screenshot({ path: `.artifacts/controls-${testInfo.project.name}.png` });
  await openPanel(chamber);
  await chamber.locator('[data-action="toggle-drawer"]').click();
  await expect(chamber.locator('[data-action="theme"]')).toBeVisible();
  await expect(chamber.locator('[data-action="export-snapshot"], [data-action="import-snapshot"], textarea')).toHaveCount(0);
  await chamber.evaluate(el => { el.renderer.zoom = 2; el.renderer.panX = 100; el.renderer.panY = 50; });
  await chamber.getByRole('button', { name: 'RESET VIEW', exact: true }).click();
  expect(await chamber.evaluate(el => [el.renderer.zoom, el.renderer.panX, el.renderer.panY])).toEqual([1, 0, 0]);
  const drawer = await chamber.locator('[data-role="drawer"]').boundingBox();
  const dock = await chamber.locator('.hud-dock').boundingBox();
  if (testInfo.project.name === 'desktop') {
    expect(drawer.x + drawer.width <= dock.x || drawer.y + drawer.height <= dock.y).toBe(true);
  }
  await chamber.locator('[data-action="theme"]').click();
  await expect(chamber.locator('[data-role="theme-label"]')).toHaveText('CYBER');
});

test('EMIT popup chooses the particle type for clicks and slingshot launches', async ({ page }, testInfo) => {
  await page.goto('/?preset=blank&autoplay=false');
  const chamber = page.locator('kyonami-chamber');
  const canvas = chamber.locator('.cosmos-canvas');
  const emit = chamber.getByRole('button', { name: 'Emit particle', exact: true });
  const menu = chamber.getByRole('listbox', { name: 'Emitted particle type' });
  await expect.poll(() => chamber.evaluate(el => Boolean(el.frame))).toBe(true);
  await expect(chamber.getByRole('button', { name: '⌖ FOLLOW', exact: true })).toBeVisible();
  await openPanel(chamber);
  const globalReverse = chamber.getByRole('button', { name: 'Global reverse (hold Space)' });
  await expect(globalReverse).toHaveText('GLOBAL REV. Space');
  await expect(globalReverse.locator('svg[aria-hidden="true"]')).toBeVisible();
  await closePanels(chamber);
  await expect(chamber.locator('[data-inspector="species"]')).toHaveText('NO SELECTED SPECIES');
  await expect(chamber.locator('[data-inspector="description"]')).toContainText('Click a particle');

  const box = await canvas.boundingBox();
  const point = { x: box.width * 0.55, y: box.height * 0.57 };
  let count = 0;
  for (const [flavor, name] of ['SPINNER', 'BINDER', 'DRIFTER', 'ANCHOR', 'PHOTON'].entries()) {
    await emit.click();
    await expect(emit).toHaveAttribute('aria-expanded', 'true');
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(page.viewportSize().width);
    expect(menuBox.y).toBeGreaterThanOrEqual(0);
    expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(page.viewportSize().height);
    await chamber.getByRole('option', { name, exact: true }).click();
    await expect(emit).toHaveAttribute('aria-expanded', 'false');
    await expect(emit).toHaveAttribute('aria-pressed', 'true');
    await expect(emit).toHaveAttribute('aria-description', `Particle type: ${name}`);
    for (let repeat = 0; repeat < 2; repeat++) {
      await canvas.click({ position: point });
      await expect.poll(() => chamber.evaluate(el => el.frame.entities.length)).toBe(++count);
      expect(await chamber.evaluate(el => el.frame.selectedInspector.flavor)).toBe(flavor);
      await expect(chamber.locator('[data-inspector="title"]')).toContainText(name);
      const particle = await chamber.evaluate(el => el.frame.selectedInspector);
      expect(flavor === 0 ? [-1, 1] : [0]).toContain(particle.spin);
      await expect(chamber.locator('[data-inspector="species"]')).toHaveText(`SIMULATED SPECIES · SPIN ${particle.spin > 0 ? '+' : ''}${particle.spin}`);
      await expect(chamber.locator('[data-inspector="mass"]')).toHaveText(`RELATIVE MASS ${[1, 1, 0.5, 3, 0][flavor]}×`);
      await expect(chamber.locator('[data-inspector="description"]')).toContainText(['Randomly assigned spin', 'Brings opposite spinners together', 'lightweight particle', 'heavy particle', 'massless wave packet'][flavor]);
      await expect(chamber.locator('[data-inspector="energy"]')).toContainText(flavor === 4 ? 'PHOTON ENERGY 24.0' : 'EXCITATION 0.0');
    }
  }

  // The selected type also travels through the worker for a slingshot launch.
  await page.mouse.move(box.x + point.x, box.y + point.y);
  await page.mouse.down();
  await page.mouse.move(box.x + point.x - 30, box.y + point.y + 25, { steps: 3 });
  await page.mouse.up();
  await expect.poll(() => chamber.evaluate(el => el.frame.entities.length)).toBe(++count);
  const launched = await chamber.evaluate(el => el.frame.selectedInspector);
  expect(launched.flavor).toBe(4);
  expect(launched.vx).toBeGreaterThan(0);
  expect(launched.vy).toBeLessThan(0);

  // Escape restores focus; keyboard selection preserves global shortcut behavior.
  await emit.click();
  await page.screenshot({ path: `.artifacts/emit-menu-${testInfo.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(emit).toBeFocused();
  await expect(emit).toHaveAttribute('aria-expanded', 'false');
  await emit.press('Space');
  await expect(emit).toHaveAttribute('aria-expanded', 'true');
  expect(await chamber.evaluate(el => el.globalReverseHeld)).toBe(false);
  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await canvas.click({ position: point });
  await expect.poll(() => chamber.evaluate(el => el.frame.entities.length)).toBe(++count);
  const auto = await chamber.evaluate(el => el.frame.selectedInspector);
  expect(auto.flavor).toBe(auto.id % 5);
  expect(await chamber.evaluate(el => el.frame.stepIndex)).toBe(0);
});

test('worker reactions update the inspector and survive snapshot import', async ({ page }) => {
  await page.goto('/?preset=blank&autoplay=false');
  const chamber = page.locator('kyonami-chamber');
  await expect.poll(() => chamber.evaluate(el => Boolean(el.frame))).toBe(true);
  await chamber.evaluate(el => {
    el.client.send('spawn', { wave: { flavor: 1, x: -2, vx: 8, sigma: 1.2 } });
    el.client.send('spawn', { wave: { flavor: 1, x: 2, vx: -8, sigma: 1.2 } });
  });
  await expect.poll(() => chamber.evaluate(el => el.frame.entities.length)).toBe(2);
  await chamber.evaluate(el => el.client.send('advance', { steps: 1 }));
  await expect(chamber.locator('[data-inspector="title"]')).toContainText('COMPOSITE');
  await expect(chamber.locator('[data-inspector="mass"]')).toHaveText('RELATIVE MASS 2×');
  await expect(chamber.locator('[data-inspector="history"]')).toContainText('FUSION');
  const snapshot = await chamber.evaluate(el => el.exportSnapshot());
  await chamber.evaluate((el, snapshot) => el.importSnapshot(snapshot), snapshot);
  await expect.poll(() => chamber.evaluate(el => el.client.busy)).toBe(false);
  await chamber.evaluate(el => el.client.send('advance', { steps: 32 }));
  await expect.poll(() => chamber.evaluate(el => el.frame.stepIndex)).toBe(33);
  await chamber.evaluate(el => el.client.send('advance', { steps: 20 }));
  await expect.poll(() => chamber.evaluate(el => el.frame.metrics.fissions)).toBeGreaterThan(0);
  await expect(chamber.locator('[data-inspector="history"]')).toContainText('FISSION');
  expect(await chamber.evaluate(el => el.frame.entities.some(e => e.flavor === 4 && e.mass === 0 && e.energy > 0))).toBe(true);
});

test('entity inspector omits redundant state labels and clears in an empty chamber', async ({ page }, testInfo) => {
  await page.goto('/?preset=causal-crystal&autoplay=false');
  const chamber = page.locator('kyonami-chamber');
  await expect.poll(() => chamber.evaluate(el => Boolean(el.frame))).toBe(true);
  await expect(chamber.locator('.inspector-state, [data-inspector="state"], [data-inspector="state-description"]')).toHaveCount(0);
  const guide = chamber.locator('.inspector-guide');
  await openPanel(chamber, 'inspector');
  await guide.locator('summary').click();
  await expect(guide.locator('dd')).toHaveCount(6);
  await expect(guide.locator('dl')).toBeVisible();
  const sidebar = chamber.locator('.hud-sidebar');
  expect(await sidebar.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `.artifacts/particle-explanation-${testInfo.project.name}.png` });
  await chooseOption(chamber, 'Simulation preset', 'Diffuse waves');
  await expect(chamber.locator('[data-inspector="energy"]')).toBeAttached();
  await chooseOption(chamber, 'Simulation preset', 'Empty');
  await expect(chamber.locator('[data-inspector="species"]')).toHaveText('NO SELECTED SPECIES');
  await expect(chamber.locator('[data-inspector="description"]')).toContainText('Click a particle');
  await expect(chamber.locator('[data-inspector="energy"]')).toHaveText('ENERGY —');
});

test('inspect selects entities without advancing or modifying a paused simulation', async ({ page }) => {
  await page.goto('/?preset=causal-crystal&autoplay=false&mode=inspect');
  const chamber = page.locator('kyonami-chamber');
  const canvas = chamber.locator('.cosmos-canvas');
  await expect.poll(() => chamber.evaluate(el => Boolean(el.frame))).toBe(true);
  await expect(chamber.locator('[data-mode="inspect"]')).toHaveAttribute('aria-pressed', 'true');
  const before = await chamber.evaluate(el => el.exportSnapshot());
  const target = await chamber.evaluate(el => {
    const canvas = el.shadowRoot.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const cam = el.renderer.cameraProjection(canvas.width, canvas.height, el.settings.worldRadius);
    const entity = el.frame.entities.find(entity => {
      const [sx, sy] = cam.worldToScreen(entity.x, entity.y);
      const x = rect.left + sx / canvas.width * rect.width;
      const y = rect.top + sy / canvas.height * rect.height;
      return entity.id !== el.frame.selectedId && x > rect.width * 0.35 && x < rect.width * 0.6 && y > rect.height * 0.45 && y < rect.height * 0.7;
    });
    if (!entity) throw new Error('No exposed entity for inspection');
    const [sx, sy] = cam.worldToScreen(entity.x, entity.y);
    return { id: entity.id, x: rect.left + sx / canvas.width * rect.width, y: rect.top + sy / canvas.height * rect.height };
  });
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.waitForTimeout(350);
  expect(await chamber.evaluate(el => el.fieldAction.active)).toBe(false);
  await page.mouse.up();
  await expect.poll(() => chamber.evaluate(el => el.frame.selectedId)).toBe(target.id);
  const after = await chamber.evaluate(el => el.exportSnapshot());
  expect({ ...after, selectedId: before.selectedId }).toEqual(before);
  await canvas.focus();
  await page.keyboard.press('1');
  await expect(chamber.locator('[data-mode="reverse"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('4');
  await expect(chamber.locator('[data-mode="inspect"]')).toHaveAttribute('aria-pressed', 'true');
});

test('simulation timing honors fractional speeds and display refresh rates', async ({ page }) => {
  await page.goto('/?autoplay=false');
  const results = await page.locator('kyonami-chamber').evaluate(el => {
    const originalRAF = window.requestAnimationFrame;
    const results = [];
    try {
      for (const hz of [60, 120]) {
        for (const speed of [0.25, 0.5, 1, 2, 4, 8]) {
          let tick;
          let steps = 0;
          window.requestAnimationFrame = callback => { tick = callback; return 1; };
          const clock = {
            rafId: 0, playing: true, speed, pointerState: {},
            effectiveFieldAction: () => ({ active: false }),
            client: { busy: false, send: (_type, data) => { steps += data.steps; } }
          };
          el.startLoop.call(clock);
          tick(0);
          for (let frame = 1; frame <= hz; frame++) tick(frame * 1000 / hz);
          results.push({ hz, speed, steps });
          clock.playing = false;
          tick(2000);
          tick(3000);
          if (steps !== results.at(-1).steps) throw new Error('Paused clock advanced');
          clock.playing = true;
          tick(3000 + 1000 / hz);
          if (steps - results.at(-1).steps > Math.ceil(speed)) throw new Error('Paused time accumulated');
        }
      }
    } finally {
      window.requestAnimationFrame = originalRAF;
    }
    return results;
  });
  for (const { speed, steps } of results) expect(steps).toBe(60 * speed);
});

test('100% viewport responsive retrofuturist quantum cosmos renders, evolves, and reverses causality on press-and-hold', async ({ page }, testInfo) => {
  await page.goto('/?preset=causal-crystal&seed=1729');

  const chamber = page.locator('kyonami-chamber');
  await expect(chamber).toBeVisible();

  const canvas = chamber.locator('.cosmos-canvas');
  await expect(canvas).toBeVisible();

  // Verify 100% viewport responsiveness
  const viewport = page.viewportSize();
  const box = await chamber.boundingBox();
  expect(Math.round(box.width)).toBe(viewport.width);
  expect(Math.round(box.height)).toBe(viewport.height);

  // Wait for worker frames to populate telemetry
  await expect(chamber.locator('[data-metric="causal-depth"]')).not.toHaveText('0.8');
  const initialDepth = parseFloat(await chamber.locator('[data-metric="causal-depth"]').textContent());
  expect(initialDepth).toBeGreaterThan(2.5);

  // Capture screenshot of the causal crystal lattice
  if (testInfo.project.name === 'desktop') {
    await page.screenshot({ path: '.artifacts/cosmos-crystal.png' });
  }

  // Press and hold at canvas center while moving cursor to verify Causal Reversal never freezes
  const centerX = box.x + box.width * 0.5;
  const centerY = box.y + box.height * 0.5;
  const stepBeforeHold = await chamber.evaluate(el => el.frame?.stepIndex ?? 0);
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(centerX + Math.sin(i * 0.5) * 28, centerY + Math.cos(i * 0.5) * 28);
    await page.waitForTimeout(45);
  }
  await page.mouse.up();

  const stepAfterHold = await chamber.evaluate(el => el.frame?.stepIndex ?? 0);
  expect(stepAfterHold).toBeGreaterThan(stepBeforeHold + 10);

  const reversedDepth = parseFloat(await chamber.locator('[data-metric="causal-depth"]').textContent());
  expect(reversedDepth).toBeLessThan(initialDepth);

  // Test slingshot EMIT mode: dragging down-left flings wavepacket up-right (opposite of drag)
  await chamber.locator('[data-mode="emit"]').click();
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX - 60, centerY + 50, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  const spawned = await chamber.evaluate(el => el.frame?.selectedInspector);
  expect(spawned).toBeTruthy();
  expect(spawned.vx).toBeGreaterThan(2);
  expect(spawned.vy).toBeLessThan(-2);

  // Switch preset to Soliton Collider and capture screenshot
  await chooseOption(chamber, 'Simulation preset', 'Colliding beams');
  await page.waitForTimeout(500);

  if (testInfo.project.name === 'desktop') {
    await page.screenshot({ path: '.artifacts/cosmos-collider.png' });
  }

  // Test snapshot export & import roundtrip
  const snap1 = await chamber.evaluate(el => el.exportSnapshot());
  expect(snap1.entities.length).toBeGreaterThan(10);
  const restored = await chamber.evaluate((el, s) => el.importSnapshot(s), snap1);
  expect(restored).toBe(true);
});
