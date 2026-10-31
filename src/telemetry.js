import { FLAVORS } from './presets.js';

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

// The template is stable between connections. Resolve its telemetry nodes once,
// then update values without repeatedly querying or replacing unchanged lists.
export class TelemetryDOM {
  constructor(root) {
    this.metrics = Object.fromEntries([...root.querySelectorAll('[data-metric]')]
      .map(element => [element.dataset.metric, element]));
    this.inspector = Object.fromEntries([...root.querySelectorAll('[data-inspector]')]
      .map(element => [element.dataset.inspector, element]));
    this.coherenceBar = root.querySelector('[data-role="coherence-bar"]');
    this.historyHTML = null;
  }

  setHistory(html) {
    if (!this.inspector.history || html === this.historyHTML) return;
    this.inspector.history.innerHTML = html;
    this.historyHTML = html;
  }

  update(frame) {
    if (!frame.metrics) return;
    const m = frame.metrics;
    const cohPct = Math.round(m.meanCoherence * 100);
    const clsPct = 100 - cohPct;
    const metrics = this.metrics;
    const inspector = this.inspector;

    setText(metrics.coherence, `${cohPct}%`);
    setText(metrics.classicality, `${clsPct}%`);
    setText(metrics['causal-depth'], m.meanCausalDepth.toFixed(2));
    setText(metrics.bonds, String(m.activeBonds));

    const width = `${cohPct}%`;
    if (this.coherenceBar && this.coherenceBar.style.width !== width) {
      this.coherenceBar.style.width = width;
    }

    const insp = frame.selectedInspector;
    if (insp) {
      setText(inspector.title, `#${insp.id} ${insp.flavorName}`);
      const flavor = FLAVORS.find(flavor => flavor.id === insp.flavor);
      setText(inspector.species, `SIMULATED SPECIES · SPIN ${insp.spin > 0 ? '+' : ''}${insp.spin}`);
      setText(inspector.mass, `RELATIVE MASS ${insp.mass}×`);
      const isComposite = insp.constituents.length > 1;
      setText(inspector.description, isComposite
        ? `Fused matter · ${insp.constituents.length} constituents. Absorbed photon energy can split this composite.`
        : flavor?.description ?? 'Click a particle to learn what it does.');
      setText(inspector.energy, `${insp.mass === 0 ? 'PHOTON ENERGY' : 'EXCITATION'} ${insp.energy.toFixed(1)}${insp.mass > 0 && (isComposite || insp.flavor === 3) ? ` / ${(insp.mass * 8).toFixed(1)} TO SPLIT` : ''}`);
      setText(inspector.coherence, `${Math.round(insp.coherence * 100)}%`);
      setText(inspector.sigma, insp.sigma.toFixed(2));
      setText(inspector.depth, insp.causalDepth.toFixed(2));
      setText(inspector.events, String(insp.interactionCount));

      if (inspector.history) {
        if (!insp.history.length) {
          this.setHistory(`<li class="chain-empty">No causal collapses recorded yet.</li>`);
        } else {
          this.setHistory(insp.history
            .map(ev => {
              const reaction = ['fusion', 'fission', 'absorb'].includes(ev.kind);
              const targetLabel = ev.kind === 'observe' ? 'OBSERVER LENS'
                : reaction ? `${ev.kind.toUpperCase()} #${ev.partnerId}` : `⇄ #${ev.partnerId}`;
              const partnerExists = frame.entities.some(entity => entity.id === ev.partnerId);
              return `<li class="chain-item" ${partnerExists ? `data-partner-id="${ev.partnerId}" title="Click to inspect partner"` : ''}>
                <span>${targetLabel}</span>
                <span>${reaction ? `E:${ev.energy.toFixed(1)}` : `σ:${ev.newSigma.toFixed(1)} C:${ev.newDepth.toFixed(1)}`}</span>
              </li>`;
            })
            .join(''));
        }
      }
    } else {
      setText(inspector.title, 'NO ENTITY');
      setText(inspector.species, 'NO SELECTED SPECIES');
      setText(inspector.mass, 'RELATIVE MASS —');
      setText(inspector.description, 'Click a particle to learn what it does.');
      setText(inspector.energy, 'ENERGY —');
      setText(inspector.coherence, '—');
      setText(inspector.sigma, '—');
      setText(inspector.depth, '—');
      setText(inspector.events, '0');
      this.setHistory(`<li class="chain-empty">Vacuum chamber — drag with EMIT to launch wavepackets.</li>`);
    }
  }
}
