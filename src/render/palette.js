export function palette(theme = 'citypop') {
  if (theme === 'light' || theme === 'daylight') {
    return {
      name: 'daylight',
      bgTop: '#f8f0ff',
      bgMid: '#efe4ff',
      bgBottom: '#ffe4f2',
      text: '#1c0d36',
      muted: '#6c5396',
      grid: 'rgba(132, 66, 204, 0.16)',
      gridHorizon: 'rgba(230, 25, 128, 0.25)',
      accent: '#00969c',
      magenta: '#e61980',
      amber: '#d97706',
      lavender: '#7c3aed',
      baseRGB: [245, 236, 255],
      flavors: [
        { hex: '#00969c', rgb: [0, 150, 156], glow: 'rgba(0, 150, 156, 0.45)' },
        { hex: '#d97706', rgb: [217, 119, 6], glow: 'rgba(217, 119, 6, 0.45)' },
        { hex: '#168544', rgb: [22, 133, 68], glow: 'rgba(22, 133, 68, 0.45)' },
        { hex: '#7c3aed', rgb: [124, 58, 237], glow: 'rgba(124, 58, 237, 0.45)' },
        { hex: '#e61980', rgb: [230, 25, 128], glow: 'rgba(230, 25, 128, 0.45)' }
      ]
    };
  }

  if (theme === 'cyber') {
    return {
      name: 'cyber',
      bgTop: '#03020a',
      bgMid: '#070516',
      bgBottom: '#100726',
      text: '#e4fbff',
      muted: '#7098b8',
      grid: 'rgba(0, 245, 212, 0.14)',
      gridHorizon: 'rgba(167, 123, 255, 0.24)',
      accent: '#00f5d4',
      magenta: '#ff2e97',
      amber: '#ffe66d',
      lavender: '#a77bff',
      baseRGB: [5, 3, 14],
      flavors: [
        { hex: '#00f5d4', rgb: [0, 245, 212], glow: 'rgba(0, 245, 212, 0.6)' },
        { hex: '#ffe66d', rgb: [255, 230, 109], glow: 'rgba(255, 230, 109, 0.6)' },
        { hex: '#8aff80', rgb: [138, 255, 128], glow: 'rgba(138, 255, 128, 0.6)' },
        { hex: '#a77bff', rgb: [167, 123, 255], glow: 'rgba(167, 123, 255, 0.6)' },
        { hex: '#ff2e97', rgb: [255, 46, 151], glow: 'rgba(255, 46, 151, 0.6)' }
      ]
    };
  }

  // Default: 'citypop' / 'dark' — Retrofuturism Vaporwave City-Pop Midnight Sunset
  return {
    name: 'citypop',
    bgTop: '#080316',
    bgMid: '#15072e',
    bgBottom: '#2b0b45',
    text: '#f5edff',
    muted: '#b39ddb',
    grid: 'rgba(255, 46, 151, 0.18)',
    gridHorizon: 'rgba(0, 245, 212, 0.22)',
    accent: '#00f5d4',
    magenta: '#ff2e97',
    amber: '#ffb84d',
    lavender: '#d4a5ff',
    baseRGB: [11, 5, 26],
    flavors: [
      { hex: '#00f5d4', rgb: [0, 245, 212], glow: 'rgba(0, 245, 212, 0.65)' },
      { hex: '#ffb84d', rgb: [255, 184, 77], glow: 'rgba(255, 184, 77, 0.65)' },
      { hex: '#8aff80', rgb: [138, 255, 128], glow: 'rgba(138, 255, 128, 0.65)' },
      { hex: '#d4a5ff', rgb: [212, 165, 255], glow: 'rgba(212, 165, 255, 0.65)' },
      { hex: '#ff2e97', rgb: [255, 46, 151], glow: 'rgba(255, 46, 151, 0.65)' }
    ]
  };
}

const PHASE_STOPS = [
  [0, 245, 212],   // Electric Cyan
  [126, 140, 255], // Periwinkle Synth
  [255, 46, 151],  // Sunset Coral-Pink
  [255, 184, 77],  // City-Pop Gold
  [186, 118, 255], // Chrome Lavender
  [0, 245, 212]    // Loop back to Cyan
];

export function phaseRGB(phi) {
  const norm = ((((phi + Math.PI) / (2 * Math.PI)) % 1) + 1) % 1;
  const h = norm * (PHASE_STOPS.length - 1);
  const i = Math.floor(h);
  const t = h - i;
  const a = PHASE_STOPS[i];
  const b = PHASE_STOPS[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}
