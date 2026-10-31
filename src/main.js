import { renderTemplate } from './template.js';
import { Dropdown } from './dropdown.js';
import { FieldRenderer } from './render/field.js';
import { WorkerClient } from './worker-client.js';
import { FLAVORS, normalizeSettings, clamp } from './presets.js';
import {
  PHYSICAL_ATTRIBUTES,
  PHYSICAL_KEYS,
  attributeValue,
  settingsFromAttributes
} from './embed-options.js';
import { validateSnapshot } from './engine.js';
import { loadFonts } from './typography.js';
import { TelemetryDOM } from './telemetry.js';

const THEMES = ['citypop', 'cyber', 'daylight'];

export class KyonamiChamber extends HTMLElement {
  get embedded() {
    return this.hasAttribute('embed') && this.getAttribute('embed') !== 'false';
  }

  static get observedAttributes() {
    return [
      ...PHYSICAL_ATTRIBUTES,
      'theme',
      'mode',
      'speed',
      'autoplay',
      'embed',
      'transparent',
      'width',
      'height',
      'autofocus'
    ];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.settings = normalizeSettings();
    this.theme = 'citypop';
    this.cursorMode = 'reverse';
    this.emitFlavor = null;
    this.playing = true;
    this.speed = 1;
    this.stepBudget = 0;
    this.frame = null;
    this.rafId = 0;
    this.pointerState = {
      down: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      worldStartX: 0,
      worldStartY: 0,
      worldX: 0,
      worldY: 0,
      moved: false,
      downTime: 0,
      panning: false,
      panOriginX: 0,
      panOriginY: 0
    };
    this.dragEmit = {
      active: false,
      startX: 0,
      startY: 0,
      curX: 0,
      curY: 0
    };
    this.fieldAction = {
      active: false,
      mode: 'reverse',
      x: 0,
      y: 0,
      global: false
    };
    this.globalReverseHeld = false;
  }

  effectiveFieldAction() {
    if (this.globalReverseHeld) {
      return {
        active: true,
        mode: 'reverse',
        x: 0,
        y: 0,
        global: true
      };
    }
    if (this.fieldAction.active) {
      return {
        active: true,
        mode: this.fieldAction.mode,
        x: this.fieldAction.x,
        y: this.fieldAction.y,
        global: false
      };
    }
    return {
      active: false,
      mode: this.cursorMode,
      x: this.fieldAction.x,
      y: this.fieldAction.y,
      global: false
    };
  }

  connectedCallback() {
    this.renderDOM();
    this.applyInitialAttributes();

    const canvas = this.shadowRoot.querySelector('.cosmos-canvas');
    this.renderer = new FieldRenderer(canvas);
    this.renderer.embedded = this.embedded;
    loadFonts().then(() => {
      if (this.isConnected) this.renderCurrentFrame();
    }).catch(() => {}); // Keep the monospace fallback when hosted fonts are unavailable.
    this.resizeCanvas();

    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(canvas);

    this.client = new WorkerClient(
      frame => this.onWorkerFrame(frame),
      err => this.showStatus(`Error: ${err.message}`)
    );

    this.client.restart('init', { settings: this.settings });
    this.bindEvents();
    this.syncControls();

    if (attributeValue('autofocus', this.getAttribute('autofocus')) === '') {
      canvas.focus();
    }

    this.startLoop();
  }

  disconnectedCallback() {
    this.stopLoop();
    this.resizeObserver?.disconnect();
    this.client?.dispose();
    this.renderer?.dispose();
    this.eventController?.abort();
    if (this.visHandler) {
      document.removeEventListener('visibilitychange', this.visHandler);
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal || !this.isConnected || !this.shell) return;
    const valid = attributeValue(name, newVal);

    if (PHYSICAL_ATTRIBUTES.includes(name) && valid !== null) {
      const prop = PHYSICAL_KEYS[name] ?? name;
      const val = name === 'preset' ? valid : Number(valid);
      this.settings =
        name === 'preset'
          ? normalizeSettings({ preset: val, seed: this.settings.seed, n: this.settings.n })
          : normalizeSettings({ ...this.settings, [prop]: val });
      this.syncControls();
      this.client?.send('update', { settings: this.settings });
      return;
    }

    if (name === 'theme' && valid !== null) {
      this.setTheme(valid === 'dark' ? 'citypop' : valid === 'light' ? 'daylight' : valid);
    } else if (name === 'mode' && valid !== null) {
      this.setCursorMode(valid);
    } else if (name === 'autoplay' && valid !== null) {
      this.setPlaying(valid === 'true');
    } else if (name === 'speed' && valid !== null) {
      this.setSpeed(Number(valid));
    } else if (name === 'width' || name === 'height') {
      this.applyDimensions();
      this.resizeCanvas();
    } else if (name === 'embed') {
      this.setPanelMenu(false, false);
      this.applyDimensions();
      if (this.renderer) {
        this.renderer.embedded = this.embedded;
        this.renderer.resetCamera();
      }
      this.resizeCanvas();
      this.renderCurrentFrame();
    } else if (name === 'transparent') {
      this.renderCurrentFrame();
    }
  }

  renderDOM() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./style.css', import.meta.url).href;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderTemplate();

    this.shadowRoot.replaceChildren(link, wrapper.firstElementChild);
    this.shell = this.shadowRoot.querySelector('.cosmos-shell');
    this.telemetry = new TelemetryDOM(this.shadowRoot);
  }

  applyInitialAttributes() {
    const attrSettings = settingsFromAttributes(this);
    this.settings = normalizeSettings(attrSettings);

    const themeAttr = attributeValue('theme', this.getAttribute('theme'));
    if (themeAttr) {
      this.theme = themeAttr === 'dark' ? 'citypop' : themeAttr === 'light' ? 'daylight' : themeAttr;
    }
    this.shell.dataset.theme = this.theme;

    const modeAttr = attributeValue('mode', this.getAttribute('mode'));
    if (modeAttr) {
      this.cursorMode = modeAttr;
    } else if (this.settings.preset === 'blank') {
      this.cursorMode = 'emit';
    }

    const speedAttr = attributeValue('speed', this.getAttribute('speed'));
    if (speedAttr) {
      this.speed = Number(speedAttr);
    }

    const autoplayAttr = attributeValue('autoplay', this.getAttribute('autoplay'));
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (autoplayAttr !== null) {
      this.playing = autoplayAttr === 'true';
    } else if (reducedMotion) {
      this.playing = false;
    } else {
      this.playing = true;
    }

    this.applyDimensions();
  }

  applyDimensions() {
    if (this.embedded) {
      this.style.width = '100%';
      this.style.height = '100%';
      return;
    }
    const w = attributeValue('width', this.getAttribute('width'));
    const h = attributeValue('height', this.getAttribute('height'));
    this.style.width = w ? `min(100%, ${w}px)` : '';
    this.style.height = h ? `min(100%, ${h}px)` : '';
  }

  resizeCanvas() {
    const canvas = this.shadowRoot.querySelector('.cosmos-canvas');
    if (!canvas) return;
    const narrow = this.getBoundingClientRect().width < 820;
    if (narrow !== this.panelMenuNarrow) {
      this.panelMenuNarrow = narrow;
      this.setPanelMenu(false, false);
    }
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      this.renderCurrentFrame();
    }
  }

  bindEvents() {
    const root = this.shadowRoot;
    const canvas = root.querySelector('.cosmos-canvas');
    this.eventController = new AbortController();
    const { signal } = this.eventController;

    this.dropdowns = {};
    this.dropdowns.speed = new Dropdown(root.querySelector('[data-dropdown="speed"]'), signal,
      value => this.setSpeed(Number(value)));
    this.dropdowns.emitFlavor = new Dropdown(root.querySelector('[data-dropdown="emit-flavor"]'), signal, value => {
      this.emitFlavor = value === 'auto' ? null : Number(value);
      this.setCursorMode('emit');
    });

    // Preset selector
    this.dropdowns.preset = new Dropdown(root.querySelector('[data-dropdown="preset"]'), signal, preset => {
      this.settings = normalizeSettings({
        preset,
        seed: this.settings.seed,
        n: this.settings.n
      });
      if (preset === 'blank') {
        this.setCursorMode('emit');
      }
      this.syncControls();
      this.client.restart('init', { settings: this.settings });
    });

    // Cursor Mode buttons
    root.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => this.setCursorMode(btn.dataset.mode));
    });

    // Action buttons
    root.querySelector('[data-action="theme"]')?.addEventListener('click', () => {
      const idx = (THEMES.indexOf(this.theme) + 1) % THEMES.length;
      this.setTheme(THEMES[idx]);
    });

    root.querySelector('[data-action="reset-camera"]')?.addEventListener('click', () => {
      this.renderer.resetCamera();
      this.renderCurrentFrame();
    });

    root.querySelectorAll('[data-action="toggle-hud"]').forEach(btn => {
      btn.addEventListener('click', () => this.toggleHUD());
    });

    root.querySelector('[data-action="toggle-panels"]').addEventListener('click', () => {
      this.setPanelMenu(!this.shell.classList.contains('panels-open'));
    });
    root.querySelectorAll('[data-action="close-panels"]').forEach(button => {
      button.addEventListener('click', () => this.setPanelMenu(false));
    });
    root.querySelectorAll('button[data-panel]').forEach(button => {
      button.addEventListener('click', () => {
        Object.values(this.dropdowns).forEach(dropdown => dropdown.close());
        this.shell.dataset.panel = button.dataset.panel;
        root.querySelectorAll('button[data-panel]').forEach(option => {
          option.setAttribute('aria-pressed', String(option === button));
        });
      });
    });
    root.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !this.panelMenuNarrow || !this.shell.classList.contains('panels-open')) return;
      event.preventDefault();
      if (!drawer.hidden) {
        drawer.hidden = true;
        root.querySelector('[data-action="toggle-drawer"]').focus();
      } else {
        this.setPanelMenu(false);
      }
    }, { signal });

    root.querySelector('[data-action="play-pause"]')?.addEventListener('click', () => {
      this.setPlaying(!this.playing);
    });

    root.querySelector('[data-action="restart"]')?.addEventListener('click', () => {
      this.client.send('restart');
    });

    const drawer = root.querySelector('[data-role="drawer"]');
    root.querySelector('[data-action="toggle-drawer"]')?.addEventListener('click', () => {
      drawer.hidden = !drawer.hidden;
      if (!drawer.hidden && this.panelMenuNarrow) root.querySelector('[data-action="close-drawer"]').focus();
    });
    root.querySelector('[data-action="close-drawer"]')?.addEventListener('click', () => {
      drawer.hidden = true;
      root.querySelector('[data-action="toggle-drawer"]').focus();
    });

    // Hold Global Reverse button
    const holdBtn = root.querySelector('[data-action="hold-global-reverse"]');
    const startGlobalReverse = e => {
      e.preventDefault();
      this.setGlobalReverse(true);
    };
    const stopGlobalReverse = () => {
      if (this.globalReverseHeld) {
        this.setGlobalReverse(false);
      }
    };
    holdBtn?.addEventListener('pointerdown', startGlobalReverse);
    window.addEventListener('pointerup', stopGlobalReverse, { signal });
    window.addEventListener('pointercancel', stopGlobalReverse, { signal });
    window.addEventListener('blur', stopGlobalReverse, { signal });

    // Parameter sliders & seed input
    root.querySelectorAll('[data-setting]').forEach(input => {
      const key = input.dataset.setting;
      const eventName = input.type === 'number' ? 'change' : 'input';
      input.addEventListener(eventName, () => {
        const val = Number(input.value);
        if (!Number.isFinite(val)) return;
        this.settings = normalizeSettings({ ...this.settings, [key]: val });
        this.syncControls();
        this.client.send('update', { settings: this.settings });
      });
    });

    // Inspector causal history click -> jump to partner entity
    root.querySelector('[data-inspector="history"]')?.addEventListener('click', e => {
      const item = e.target.closest('[data-partner-id]');
      if (item) {
        const partnerId = Number(item.dataset.partnerId);
        if (partnerId > 0) {
          this.client.send('select', { id: partnerId });
        }
      }
    });

    // Canvas pointer gestures (Press-and-Hold Causal Reversal, Observe, Emit, Select, Pan, Zoom)
    canvas.addEventListener('pointerdown', e => this.onCanvasPointerDown(e));
    canvas.addEventListener('pointermove', e => this.onCanvasPointerMove(e));
    canvas.addEventListener('pointerup', e => this.onCanvasPointerUp(e));
    canvas.addEventListener('pointercancel', e => this.onCanvasPointerUp(e));
    canvas.addEventListener(
      'wheel',
      e => {
        if (this.embedded) return;
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.89;
        this.renderer.zoom = clamp(this.renderer.zoom * factor, 0.45, 3.5);
        this.renderCurrentFrame();
      },
      { passive: false }
    );

    // Keyboard shortcuts
    window.addEventListener('keydown', e => {
      if (e.defaultPrevented || this.isFormFocused(e)
        || e.composedPath().some(el => el.matches?.('.hud-menu-toggle, .panel-menu-header'))) return;
      this.onKeyDown(e);
    }, { signal });
    window.addEventListener('keyup', e => this.onKeyUp(e), { signal });

    this.visHandler = () => {
      if (document.hidden) {
        stopGlobalReverse();
        this.stopLoop();
      } else {
        this.startLoop();
      }
    };
    document.addEventListener('visibilitychange', this.visHandler);
  }

  isFormFocused(e) {
    const path = e.composedPath?.() ?? [];
    return path.some(el => el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
      || el.matches?.('[data-dropdown]')));
  }

  onKeyDown(e) {
    if (this.isFormFocused(e) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!this.globalReverseHeld) {
        this.setGlobalReverse(true);
      }
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      this.setPlaying(!this.playing);
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      this.client.send('restart');
    } else if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      this.toggleHUD();
    } else if (e.key === '1') {
      this.setCursorMode('reverse');
    } else if (e.key === '2') {
      this.setCursorMode('observe');
    } else if (e.key === '3') {
      this.setCursorMode('emit');
    } else if (e.key === '4') {
      this.setCursorMode('inspect');
    }
  }

  onKeyUp(e) {
    if (e.code === 'Space' && this.globalReverseHeld) {
      this.setGlobalReverse(false);
    }
  }

  canvasWorldPoint(clientX, clientY) {
    const canvas = this.shadowRoot.querySelector('.cosmos-canvas');
    const rect = canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width;
    const sy = ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height;
    const cam = this.renderer.cameraProjection(
      canvas.width,
      canvas.height,
      this.settings.worldRadius
    );
    return {
      sx,
      sy,
      world: cam.screenToWorld(sx, sy)
    };
  }

  onCanvasPointerDown(e) {
    // Embedded views stay fitted; camera gestures must not move the basin.
    if (this.embedded && (e.button === 1 || e.shiftKey)) return;
    const canvas = this.shadowRoot.querySelector('.cosmos-canvas');
    canvas.setPointerCapture?.(e.pointerId);
    const { sx, sy, world } = this.canvasWorldPoint(e.clientX, e.clientY);

    const panning = e.button === 1 || e.shiftKey;
    this.pointerState = {
      down: true,
      pointerId: e.pointerId,
      startX: sx,
      startY: sy,
      worldStartX: world[0],
      worldStartY: world[1],
      worldX: world[0],
      worldY: world[1],
      moved: false,
      downTime: performance.now(),
      panning,
      panOriginX: this.renderer.panX,
      panOriginY: this.renderer.panY
    };

    if (panning) return;
    if (this.cursorMode === 'inspect') return;

    if (this.cursorMode === 'emit') {
      this.dragEmit = {
        active: true,
        startX: world[0],
        startY: world[1],
        curX: world[0],
        curY: world[1]
      };
      this.renderCurrentFrame();
    } else {
      // Activate press-and-hold field (Causal Reversal or Observer Collapse)
      this.fieldAction = {
        active: true,
        mode: this.cursorMode,
        x: world[0],
        y: world[1],
        global: false
      };
      if (this.frame?.fieldAction) {
        this.frame.fieldAction = {
          ...this.frame.fieldAction,
          ...this.effectiveFieldAction(),
          radius: 50
        };
        this.renderCurrentFrame();
      }
      if (!this.client.busy) {
        this.client.send('advance', {
          steps: 1,
          action: this.effectiveFieldAction()
        });
      }
    }
  }

  onCanvasPointerMove(e) {
    if (!this.pointerState.down || e.pointerId !== this.pointerState.pointerId) return;
    const { sx, sy, world } = this.canvasWorldPoint(e.clientX, e.clientY);

    if (Math.hypot(sx - this.pointerState.startX, sy - this.pointerState.startY) > 6) {
      this.pointerState.moved = true;
    }

    if (this.pointerState.panning) {
      this.renderer.panX = this.pointerState.panOriginX + (sx - this.pointerState.startX);
      this.renderer.panY = this.pointerState.panOriginY + (sy - this.pointerState.startY);
      this.renderCurrentFrame();
      return;
    }

    this.pointerState.worldX = world[0];
    this.pointerState.worldY = world[1];
    if (this.cursorMode === 'inspect') return;

    if (this.cursorMode === 'emit' && this.dragEmit.active) {
      this.dragEmit.curX = world[0];
      this.dragEmit.curY = world[1];
      this.renderCurrentFrame();
    } else {
      // Update cursor coordinates locally so pointer movement never floods the worker queue or blocks step advancement
      this.fieldAction.active = true;
      this.fieldAction.mode = this.cursorMode;
      this.fieldAction.x = world[0];
      this.fieldAction.y = world[1];
      if (this.frame?.fieldAction && !this.globalReverseHeld) {
        this.frame.fieldAction.active = true;
        this.frame.fieldAction.mode = this.cursorMode;
        this.frame.fieldAction.x = world[0];
        this.frame.fieldAction.y = world[1];
        this.renderCurrentFrame();
      }
    }
  }

  onCanvasPointerUp(e) {
    if (!this.pointerState.down || e.pointerId !== this.pointerState.pointerId) return;
    const heldMs = performance.now() - this.pointerState.downTime;
    const wasMoved = this.pointerState.moved;
    const wx = this.pointerState.worldX;
    const wy = this.pointerState.worldY;

    this.pointerState.down = false;

    if (this.pointerState.panning) return;
    if (this.cursorMode === 'inspect') {
      if (!wasMoved && e.type !== 'pointercancel') {
        this.client.send('select', { x: wx, y: wy, maxDist: 32 });
      }
      return;
    }

    if (this.cursorMode === 'emit' && this.dragEmit.active) {
      // Slingshot launch: fling wavepacket opposite to drag vector
      const vx = clamp((this.dragEmit.startX - this.dragEmit.curX) * 0.9, -46, 46);
      const vy = clamp((this.dragEmit.startY - this.dragEmit.curY) * 0.9, -46, 46);
      this.dragEmit.active = false;
      this.renderCurrentFrame();
      this.client.send('spawn', {
        wave: {
          x: this.dragEmit.startX,
          y: this.dragEmit.startY,
          vx,
          vy,
          flavor: this.emitFlavor
        }
      });
      return;
    }

    // Deactivate press-and-hold field
    this.fieldAction.active = false;
    if (this.frame?.fieldAction && !this.globalReverseHeld) {
      this.frame.fieldAction.active = false;
      this.renderCurrentFrame();
    }
    this.client.send('field-action', {
      action: this.effectiveFieldAction()
    });

    // Quick click/tap selects the nearest quantum entity for inspection
    if (heldMs < 240 && !wasMoved) {
      this.client.send('select', { x: wx, y: wy, maxDist: 32 });
    }
  }

  setGlobalReverse(active) {
    this.globalReverseHeld = active;
    const btn = this.shadowRoot.querySelector('[data-action="hold-global-reverse"]');
    btn?.classList.toggle('holding', active);
    btn?.setAttribute('aria-pressed', String(active));

    this.client?.send('field-action', {
      action: this.effectiveFieldAction()
    });
  }

  setTheme(theme) {
    this.theme = theme;
    this.shell.dataset.theme = theme;
    const label = this.shadowRoot.querySelector('[data-role="theme-label"]');
    if (label) label.textContent = theme.toUpperCase();
    this.renderCurrentFrame();
  }

  setCursorMode(mode) {
    if (!['reverse', 'observe', 'emit', 'inspect'].includes(mode)) return;
    if (this.cursorMode !== mode) {
      this.fieldAction.active = false;
      this.dragEmit.active = false;
      this.pointerState.down = false;
      this.client?.send('field-action', { action: this.effectiveFieldAction() });
      if (this.frame?.fieldAction && !this.globalReverseHeld) this.frame.fieldAction.active = false;
    }
    this.cursorMode = mode;
    if (mode !== 'emit') this.dropdowns?.emitFlavor.close();
    this.shadowRoot.querySelectorAll('[data-mode]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
    this.shadowRoot.querySelector('.cosmos-canvas').style.cursor = mode === 'inspect' ? 'default' : 'crosshair';
    const emit = this.shadowRoot.querySelector('[data-mode="emit"]');
    const type = this.emitFlavor === null ? 'AUTO (CYCLE)' : FLAVORS[this.emitFlavor].name;
    emit.title = `Particle type: ${type}. Choose a type, then click or drag on the canvas to emit (3)`;
    emit.setAttribute('aria-description', `Particle type: ${type}`);
    this.renderCurrentFrame();
  }

  setPlaying(playing) {
    this.playing = Boolean(playing);
    this.stepBudget = 0;
    const btn = this.shadowRoot.querySelector('[data-action="play-pause"]');
    if (btn) {
      btn.textContent = this.playing ? 'PAUSE [P]' : 'PLAY [P]';
    }
  }

  setSpeed(speed) {
    const valid = attributeValue('speed', speed);
    if (valid === null) return;
    this.speed = Number(valid);
    this.stepBudget = 0;
    this.dropdowns?.speed.setValue(String(this.speed), `${this.speed}×`);
  }

  setPanelMenu(open, restoreFocus = true) {
    this.shell.classList.toggle('panels-open', open);
    const toggle = this.shadowRoot.querySelector('[data-action="toggle-panels"]');
    toggle.setAttribute('aria-expanded', String(open));
    Object.values(this.dropdowns ?? {}).forEach(dropdown => dropdown.close());
    if (open) {
      this.shadowRoot.querySelector(`button[data-panel="${this.shell.dataset.panel}"]`).focus();
    } else {
      this.shadowRoot.querySelector('[data-role="drawer"]').hidden = true;
      if (restoreFocus && this.panelMenuNarrow) toggle.focus();
    }
  }

  toggleHUD() {
    this.setPanelMenu(false, false);
    const hidden = this.shell.classList.toggle('hud-hidden');
    Object.values(this.dropdowns ?? {}).forEach(dropdown => dropdown.close());
    const restorePill = this.shadowRoot.querySelector('.hud-restore-pill');
    if (restorePill) {
      restorePill.hidden = !hidden;
    }
  }

  syncControls() {
    const root = this.shadowRoot;
    if (!root) return;

    this.dropdowns?.preset.setValue(this.settings.preset);
    this.dropdowns?.emitFlavor.setValue(this.emitFlavor === null ? 'auto' : String(this.emitFlavor));

    for (const key of ['coupling', 'contagion', 'decay', 'sigmaMax', 'population', 'seed']) {
      const input = root.querySelector(`[data-setting="${key}"]`);
      if (input && document.activeElement !== input) {
        input.value = String(this.settings[key]);
      }
      const valEl = root.querySelector(`[data-val="${key}"]`);
      if (valEl) {
        valEl.textContent = String(this.settings[key]);
      }
    }

    this.setPlaying(this.playing);
    this.setSpeed(this.speed);
    this.setTheme(this.theme);
    this.setCursorMode(this.cursorMode);
  }

  showStatus(msg) {
    const el = this.shadowRoot.querySelector('[data-role="drawer-status"]');
    if (el) el.textContent = msg;
  }

  onWorkerFrame(frame) {
    if (this.fieldAction.active && !this.globalReverseHeld && frame.fieldAction) {
      frame.fieldAction.active = true;
      frame.fieldAction.mode = this.fieldAction.mode;
      frame.fieldAction.x = this.fieldAction.x;
      frame.fieldAction.y = this.fieldAction.y;
    }
    this.frame = frame;
    this.updateTelemetryDOM(frame);
    this.renderCurrentFrame();
  }

  renderCurrentFrame() {
    if (!this.frame || !this.renderer) return;
    this.renderer.render(this.frame, {
      theme: this.theme,
      transparent: attributeValue('transparent', this.getAttribute('transparent')) === '',
      dragEmit: this.dragEmit,
      now: performance.now()
    });
  }

  updateTelemetryDOM(frame) {
    this.telemetry?.update(frame);
  }

  startLoop() {
    if (this.rafId) return;
    let lastTime = null;
    this.stepBudget = 0;
    const tick = now => {
      this.rafId = requestAnimationFrame(tick);
      const elapsed = lastTime === null ? 0 : Math.min(100, now - lastTime);
      lastTime = now;
      if (!this.client) return;

      const holdingField = this.fieldAction?.active;
      if (!this.playing && !holdingField && !this.globalReverseHeld) {
        this.stepBudget = 0;
        return;
      }

      // Fixed simulation steps at 60 Hz, independent of display refresh rate.
      // Keep fractional steps for slow motion and cap backlog while the worker is busy.
      this.stepBudget = Math.min(32, this.stepBudget + elapsed * 0.06 * this.speed);
      const steps = Math.floor(this.stepBudget + 1e-9);
      if (!this.client.busy && steps > 0) {
        this.stepBudget = Math.max(0, this.stepBudget - steps);
        this.client.send('advance', {
          steps,
          action: this.effectiveFieldAction()
        });
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  async exportSnapshot() {
    if (!this.client) throw new Error('Component is not connected');
    return this.client.snapshot();
  }

  async importSnapshot(snapshot) {
    validateSnapshot(snapshot);
    this.settings = normalizeSettings(snapshot.settings);
    this.syncControls();
    this.client.restart('restore', { snapshot });
    return true;
  }
}

if (!customElements.get('kyonami-chamber')) {
  customElements.define('kyonami-chamber', KyonamiChamber);
}
if (!customElements.get('kyonami-cosmos')) {
  customElements.define('kyonami-cosmos', class extends KyonamiChamber {});
}
