import { FLAVORS, PRESETS } from './presets.js';
import { DROPDOWN_CHEVRON, renderDropdown } from './dropdown.js';

export function renderTemplate() {
  const presetOptions = Object.entries(PRESETS)
    .map(([value, preset]) => ({ value, label: preset.label }));

  return `
    <div class="cosmos-shell" data-theme="citypop" data-panel="controls">
      <canvas class="cosmos-canvas" aria-label="Quantum-to-classical simulation space" tabindex="0"></canvas>
      <div class="crt-overlay" aria-hidden="true"></div>

      <div class="hud-layout">
      <button type="button" class="retro-btn hud-menu-toggle" data-action="toggle-panels" aria-label="Open panels" aria-expanded="false" aria-controls="hud-panels">
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 5h14M3 10h14M3 15h14"/></svg>
      </button>
      <div class="panel-backdrop" data-action="close-panels" aria-hidden="true"></div>
      <div class="hud-panels" id="hud-panels" role="region" aria-label="Simulation panels">
      <div class="panel-menu-header">
        <div role="group" aria-label="Panel selection">
          <button type="button" class="retro-btn" data-panel="controls" aria-pressed="true" aria-controls="controls-panel">CONTROLS</button>
          <button type="button" class="retro-btn" data-panel="inspector" aria-pressed="false" aria-controls="inspector-panel">INSPECTOR</button>
        </div>
        <button type="button" class="retro-btn" data-action="close-panels" aria-label="Close panels">✕</button>
      </div>
      <aside class="hud-card hud-sidebar" id="controls-panel" aria-label="Simulation overview and controls">
        <section class="hud-overview" aria-label="Simulation overview and preset">
          <div class="preset-control">
            <span class="panel-label">PRESET</span>
            ${renderDropdown('preset', 'Simulation preset', presetOptions, 'primordial-soup')}
          </div>

          <div class="continuum-meter" title="Quantum Wave Coherence vs Classical Particle Condensation">
            <div class="continuum-labels">
              <span>WAVE <strong data-metric="coherence">82%</strong></span>
              <span>PARTICLE <strong data-metric="classicality">18%</strong></span>
            </div>
            <div class="continuum-track">
              <div class="continuum-fill" data-role="coherence-bar" style="width: 82%"></div>
            </div>
          </div>

          <div class="telemetry-grid">
            <div class="telemetry-cell">
              <span class="telemetry-label">CAUSAL DEPTH</span>
              <strong class="telemetry-val" data-metric="causal-depth">0.8</strong>
            </div>
            <div class="telemetry-cell">
              <span class="telemetry-label">BONDS</span>
              <strong class="telemetry-val" data-metric="bonds">0</strong>
            </div>
          </div>
        </section>
        <section class="sidebar-controls" role="group" aria-label="Simulation playback and settings">
          <span class="panel-label">SIMULATION CONTROLS</span>
          <div class="action-group">
            <button type="button" class="retro-btn accent-amber" data-action="hold-global-reverse" aria-label="Global reverse (hold Space)" aria-pressed="false" title="Hold this button or Space to reverse causality everywhere">
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2v12L0 8zm8 0v12L8 8z"/></svg>GLOBAL REV. <kbd>Space</kbd>
            </button>
            <button type="button" class="retro-btn" data-action="play-pause" title="Pause or resume time evolution (P)">
              PAUSE [P]
            </button>
            <div class="speed-control">
              <span>SPEED</span>
              ${renderDropdown('speed', 'Simulation speed', [0.25, 0.5, 1, 2, 4, 8].map(speed => ({ value: String(speed), label: `${speed}×` })), '1')}
            </div>
            <button type="button" class="retro-btn" data-action="restart" title="Restart current preset (R)">
              RESET [R]
            </button>
            <button type="button" class="retro-btn" data-action="toggle-drawer" title="Open physics parameters">
              TUNING ⚙
            </button>
          </div>
        </section>
      </aside>
      <aside class="hud-card hud-inspector" id="inspector-panel" data-role="inspector" aria-label="Selected entity causal chain">
        <div class="inspector-header">
          <div>
            <span class="inspector-kicker">ENTITY INSPECTOR</span>
            <h2 class="inspector-title" data-inspector="title">#1 ${FLAVORS[0].name}</h2>
          </div>
        </div>

        <div class="inspector-explanation">
          <span class="panel-label" data-inspector="species">SIMULATED SPECIES · SPIN +1</span>
          <p data-inspector="mass">RELATIVE MASS 1×</p>
          <p data-inspector="description">${FLAVORS[0].description}</p>
          <p data-inspector="energy">EXCITATION 0.0</p>
        </div>

        <div class="inspector-stats">
          <div><span>COHERENCE</span><strong data-inspector="coherence">94%</strong></div>
          <div><span>SPREAD σ</span><strong data-inspector="sigma">10.8</strong></div>
          <div><span>CAUSAL DEPTH</span><strong data-inspector="depth">0.2</strong></div>
          <div><span>EVENTS</span><strong data-inspector="events">0</strong></div>
        </div>

        <details class="inspector-guide">
          <summary>METRIC DEFINITIONS</summary>
          <dl>
            <dt>Mass &amp; spin</dt><dd>Mass sets inertia; composites add their masses. Spinner spin: ±1, assigned at random. No charge.</dd>
            <dt>Reactions &amp; energy</dt><dd>Fusion joins matter and releases photons. Absorbed photons add energy; enough energy splits Anchors and composites.</dd>
            <dt>Coherence</dt><dd>0% = particle; 100% = wave.</dd>
            <dt>Spread σ</dt><dd>Wave width. Smaller = more localized.</dd>
            <dt>Causal depth</dt><dd>Interaction buildup. Rises with contact; falls with isolation or reversal.</dd>
            <dt>Events &amp; chain</dt><dd>Recent interactions. Select a partner to view its history.</dd>
          </dl>
        </details>

        <div class="inspector-chain-box">
          <div class="chain-header">CAUSAL CHAIN LOG</div>
          <ul class="chain-list" data-inspector="history">
            <li class="chain-empty">Delocalized wave — awaiting causal interaction.</li>
          </ul>
        </div>
      </aside>
      </div>

      <section class="hud-card hud-drawer" data-role="drawer" hidden aria-label="Physics tuning">
        <div class="drawer-header">
          <h2>QUANTUM PARAMETERS</h2>
          <button type="button" class="retro-btn small" data-action="close-drawer">CLOSE ✕</button>
        </div>

        <div class="sliders-grid">
          <label class="slider-row">
            <span>INTERACTION COUPLING (κ) <strong data-val="coupling">0.95</strong></span>
            <input type="range" min="0" max="4" step="0.05" value="0.95" data-setting="coupling">
          </label>
          <label class="slider-row">
            <span>CAUSAL CONTAGION (β) <strong data-val="contagion">0.45</strong></span>
            <input type="range" min="0" max="2" step="0.05" value="0.45" data-setting="contagion">
          </label>
          <label class="slider-row">
            <span>ISOLATION DECAY (γ) <strong data-val="decay">0.32</strong></span>
            <input type="range" min="0" max="2" step="0.02" value="0.32" data-setting="decay">
          </label>
          <label class="slider-row">
            <span>MAX WAVE SPREAD (σ) <strong data-val="sigmaMax">11.5</strong></span>
            <input type="range" min="5" max="18" step="0.5" value="11.5" data-setting="sigmaMax">
          </label>
          <label class="slider-row">
            <span>POPULATION (N) <strong data-val="population">52</strong></span>
            <input type="range" min="0" max="120" step="2" value="52" data-setting="population">
          </label>
          <label class="slider-row">
            <span>SEED</span>
            <input type="number" class="retro-input" min="1" max="999999999" value="1729" data-setting="seed">
          </label>
        </div>

        <div class="drawer-actions">
          <button type="button" class="retro-btn small" data-action="theme" title="Cycle visual palette">
            THEME: <span data-role="theme-label">CITYPOP</span>
          </button>
          <button type="button" class="retro-btn small" data-action="reset-camera" title="Reset pan and zoom to the default view">RESET VIEW</button>
          <button type="button" class="retro-btn small" data-action="toggle-hud" title="Hide controls (H)">HIDE HUD</button>
        </div>

        <p class="drawer-status" data-role="drawer-status" role="status"></p>
      </section>

      <!-- Bottom Control Dock -->
      <footer class="hud-bottom">
        <div class="hud-card hud-dock" role="toolbar" aria-label="Simulation controls">
          <div class="mode-group" role="group" aria-label="Cursor interaction mode">
            <span class="dock-section-label">CURSOR:</span>
            <button type="button" class="mode-btn active" data-mode="reverse" title="Hold on the canvas to expand particles back into waves (1)">
              ◀◀ REVERSE
            </button>
            <button type="button" class="mode-btn" data-mode="observe" title="Hold on the canvas to collapse waves into particles (2)">
              ◎ OBSERVE
            </button>
            <div class="dropdown emit-control" data-dropdown="emit-flavor">
              <button type="button" class="mode-btn dropdown-trigger" data-mode="emit" aria-label="Emit particle"
                aria-haspopup="listbox" aria-expanded="false" aria-controls="emit-flavor-options"
                title="Choose a particle type, then click or drag on the canvas to emit (3)">
                <span>↗ EMIT</span>${DROPDOWN_CHEVRON}
              </button>
              <div class="dropdown-menu" id="emit-flavor-options" role="listbox" aria-label="Emitted particle type" popover="auto">
                <button type="button" class="dropdown-option" role="option" tabindex="-1" data-value="auto" aria-selected="true">AUTO (CYCLE)</button>
                ${FLAVORS.map(flavor => `<button type="button" class="dropdown-option" role="option" tabindex="-1"
                  data-value="${flavor.id}" aria-selected="false" title="${flavor.description} Relative mass ${flavor.mass}×"
                  aria-description="Relative mass ${flavor.mass}×. ${flavor.description}">${flavor.name}</button>`).join('')}
              </div>
            </div>
            <button type="button" class="mode-btn" data-mode="inspect" title="Select an entity without changing its state (4)">
              ⌖ FOLLOW
            </button>
          </div>

        </div>
      </footer>
      </div>

      <button type="button" class="hud-restore-pill" data-action="toggle-hud" hidden title="Show HUD (H)">
        SHOW HUD [H]
      </button>
    </div>
  `;
}
