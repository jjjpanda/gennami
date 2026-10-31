import { embedAttributes } from './embed-options.js';

const chamber = document.querySelector('kyonami-chamber');
if (chamber) {
  const isEmbedPath = /\/embed(?:\/|$)/.test(location.pathname);
  const attributes = embedAttributes(location.search, isEmbedPath);
  for (const [name, value] of Object.entries(attributes)) {
    chamber.setAttribute(name, value);
  }
  document.documentElement.style.background = attributes.transparent === '' ? 'transparent' : '#080316';
  document.body.style.background = 'transparent';
}

// Apply URL options before the component starts its worker and animation loop.
await import('./main.js');
