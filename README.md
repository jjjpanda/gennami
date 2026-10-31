# Kyonami

An interactive quantum-to-classical simulation. Waves interfere, interactions form particles, and holding the canvas reverses their causal bonds. Native web components, Canvas 2D, and a Web Worker; no runtime dependencies.

[Open the app](https://jjjpanda.github.io/kyonami/) · [Embed view](https://jjjpanda.github.io/kyonami/embed/)

## Iframe

```html
<iframe
  src="https://jjjpanda.github.io/kyonami/embed/?preset=causal-crystal&amp;theme=citypop"
  title="Kyonami simulation"
  width="800"
  height="450"
  loading="lazy"
  style="border: 0"
></iframe>
```

The regular view at `/` includes controls and the inspector. `/embed/` fills its container with the bottom panel for Reverse, Observe, Emit, and Follow. Its camera stays fitted: wheel zoom and pan gestures are disabled. Embed components ignore their own `width` and `height` attributes; size the parent container instead. Use the regular URL in an iframe to keep the full interface.

The basin stays circular on all screen sizes. The field, guides, and pointer coordinates use the same projection.

Above 1100px of chamber width, the overview and playback controls occupy a 244px left panel while the entity inspector fills a 260px right panel. Both extend from the top inset to the bottom inset, with the cursor dock between them. Playback controls sit at the bottom of their panel, one per row. From 820px to 1100px, Controls and Inspector share a full-height right panel with tabs, and the simulation fits beside it. Below 820px, a hamburger opens the tabbed panel as a full-height drawer; close it with the close button, Escape or a tap outside. The canvas stays full width in this layout. Hiding the HUD also restores full canvas width, as used in embeds. Panels scroll internally and the causal log expands into spare height. Layout responds to the component's own dimensions, including custom-sized containers.

## Particle types and typography

Emit offers five fictional simulation types: Spinner (random spin +1 or −1, 1× mass), Binder (joins groups, 1×), Drifter (weak bonds, 0.5×), Anchor (attracts groups, 3×), and Photon (massless energy packet). Spin is assigned deterministically from the seed and saved per particle. Opposite Spinner spins attract; matching spins repel. There is no separate electric charge or electromagnetic force model. Each type has its own color and core shape. Mixed particles, Particle lattice, and Diffuse waves include all five; beams, clusters and rings use Spinners and Binders.

Close, localized matter collisions can **fuse** into a composite. Combined mass and constituent spins are retained; relative collision energy becomes excitation (75%) and two emitted photons (25%). Composites appear as larger hexagons. **Photons** start as coherent wave packets and contribute to the interference field. Observe and overlapping matter interactions decohere and localize them; isolation, Reverse, and wave bursts restore their spread. They travel at a fixed 80 simulation units/second, reflect off the basin wall, do not form bonds, and transfer their energy to matter on contact. Manually emitted photons carry 24 energy units.

At 8 excitation units per relative mass, **fission** splits a composite into two constituent groups, or an Anchor into two Binder/Drifter fragments (1.5× each). Excitation becomes fragment motion (75%) and two photons (25%). A short reaction cooldown prevents immediate fusion/fission loops, and reactions defer when the entity limit has no room. The inspector displays spin, combined mass, energy, the splitting threshold, and reaction history. Try Empty → emit an Anchor → launch a Photon into it, or collide localized matter using Observe and slingshot emission.

These are illustrative reaction rules, not a nuclear or relativistic physics solver. Reactions conserve matter mass and account for energy, but the surrounding simulation includes damping, speed limits and quantum noise. Photons do not contribute radiation pressure. Old v2 snapshots migrate the two Spinner species to one with their previous spins; subsequent evolution uses the new rules.

Controls and canvas labels use IBM Plex Mono, loaded from Google Fonts with a monospace fallback. No font assets or new packages are bundled. Embedding pages with a content security policy must allow `fonts.googleapis.com` styles and `fonts.gstatic.com` fonts to display it.

Both URLs accept `preset`, `theme` (`citypop`, `cyber`, `daylight`), `speed` (0.25–8), `seed`, and `autoplay=false`. Add `transparent=true` for a transparent background. Set iframe dimensions in the parent page.

## Web component

Serve the built `src/` directory alongside your page, then import the component:

```html
<script type="module" src="./src/main.js"></script>
<div style="height: 450px">
  <kyonami-chamber embed preset="causal-crystal" theme="citypop"></kyonami-chamber>
</div>
```

Omit `embed` to show the full interface. Attributes can also be changed with `setAttribute()`.

## Development

Requires Node 22 or newer.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4186`. Run `npm test`, `npm run build`, and `npm run check:http` to verify the static build in `dist/`.

For browser checks, run `npx playwright install chromium`, then `npm run check:browser` (uses Edge on Windows; set `PLAYWRIGHT_CHANNEL=chromium` to use installed Chromium).

GitHub Actions runs tests and checks the built app on pull requests and pushes to `master`, then deploys successful `master` builds to GitHub Pages. Before the first deployment, select **GitHub Actions** under **Settings → Pages → Build and deployment**.
