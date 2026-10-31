import { PRESETS, BOUNDS, isNumeric, clamp } from './presets.js';

export const PHYSICAL_KEYS = {
  'sigma-min': 'sigmaMin',
  'sigma-max': 'sigmaMax',
  'world-radius': 'worldRadius'
};

export const PHYSICAL_ATTRIBUTES = [
  'preset',
  'seed',
  'population',
  'coupling',
  'contagion',
  'decay',
  'sigma-min',
  'sigma-max',
  'world-radius',
  'dt',
  'n'
];

const RANGES = {
  ...BOUNDS,
  'sigma-min': BOUNDS.sigmaMin,
  'sigma-max': BOUNDS.sigmaMax,
  'world-radius': BOUNDS.worldRadius,
  speed: [0.25, 8],
  width: [160, 4096],
  height: [160, 2160]
};

const ROUNDED = ['seed', 'population', 'width', 'height'];

export function attributeValue(name, value) {
  if (value === null || value === undefined) return null;

  if (name === 'preset') {
    return Object.hasOwn(PRESETS, value) ? value : null;
  }

  if (name === 'theme') {
    return ['citypop', 'cyber', 'daylight', 'dark', 'light'].includes(value) ? value : null;
  }

  if (name === 'mode') {
    return ['reverse', 'observe', 'emit', 'inspect'].includes(value) ? value : null;
  }

  if (name === 'n') {
    return [64, 128].includes(Number(value)) ? String(value) : null;
  }

  if (RANGES[name]) {
    if (!isNumeric(value)) return null;
    const num = ROUNDED.includes(name) ? Math.round(Number(value)) : Number(value);
    return String(clamp(num, ...RANGES[name]));
  }

  if (['embed', 'transparent', 'autofocus'].includes(name)) {
    return value === '' || value === 'true' ? '' : value === 'false' ? 'false' : null;
  }

  if (name === 'autoplay') {
    return ['true', 'false'].includes(value) ? value : null;
  }

  return null;
}

export function embedAttributes(search, embed = true) {
  const params = new URLSearchParams(search);
  const attributes = embed ? { embed: '' } : {};
  const seen = new Set();

  for (const [key, rawValue] of params) {
    if (!seen.has(key)) {
      seen.add(key);
      const value = attributeValue(key, rawValue);
      if (value !== null) {
        attributes[key] = value;
      }
    }
  }

  if (embed) {
    attributes.embed = '';
  }
  return attributes;
}

export function settingsFromAttributes(element) {
  const settings = {};
  for (const attr of PHYSICAL_ATTRIBUTES) {
    const raw = element.getAttribute(attr);
    const valid = attributeValue(attr, raw);
    if (valid !== null) {
      const prop = PHYSICAL_KEYS[attr] ?? attr;
      settings[prop] = attr === 'preset' ? valid : Number(valid);
    }
  }
  return settings;
}
