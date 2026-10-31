export const FONT_FAMILY = '"IBM Plex Mono", monospace';

let fontsReady;

// Share document fonts between shadow DOM controls and Canvas 2D labels.
export function loadFonts() {
  fontsReady ??= new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap';
    link.onload = () => Promise.all([400, 600, 700].map(weight =>
      document.fonts.load(`${weight} 14px "IBM Plex Mono"`)
    )).then(resolve, reject);
    link.onerror = reject;
    document.head.append(link);
  });
  return fontsReady;
}
