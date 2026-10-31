import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const server = spawn(process.execPath, ['scripts/serve.js', 'dist'], {
  env: { ...process.env, PORT: '0' },
  windowsHide: true,
  stdio: 'pipe'
});

try {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('HTTP server did not start')), 5000);
    server.on('error', reject);
    server.stdout.on('data', data => {
      const matchedUrl = data.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (matchedUrl) {
        clearTimeout(timer);
        resolve(matchedUrl);
      }
    });
  });

  const endpoints = [
    '/',
    '/embed/',
    '/src/main.js',
    '/src/embed.js',
    '/src/worker.js',
    '/src/style.css',
    '/src/engine.js',
    '/src/presets.js',
    '/src/embed-options.js',
    '/src/template.js',
    '/src/typography.js',
    '/src/telemetry.js',
    '/src/dropdown.js',
    '/src/worker-client.js',
    '/src/sim/simulation.js',
    '/src/sim/reactions.js',
    '/src/sim/motion.js',
    '/src/sim/snapshot.js',
    '/src/sim/random.js',
    '/src/render/field.js',
    '/src/render/palette.js',
    '/src/render/density.js',
    '/src/render/quanta.js'
  ];

  for (const path of endpoints) {
    const response = await fetch(url + path);
    assert.equal(response.status, 200, `Expected 200 for ${path}`);
    const text = await response.text();
    assert.ok(text.length > 0, `Expected non-empty body for ${path}`);
    if (path.endsWith('.js')) {
      assert.match(response.headers.get('content-type'), /javascript/);
    } else if (path.endsWith('/')) {
      assert.match(response.headers.get('content-type'), /html/);
    } else if (path.endsWith('.css')) {
      assert.match(response.headers.get('content-type'), /css/);
    }
  }

  const redirect = await fetch(url + '/embed?preset=blank&autoplay=false', { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/embed/?preset=blank&autoplay=false');

  const missingResponse = await fetch(url + '/missing-module.js');
  assert.equal(missingResponse.status, 404);

  console.log('Built standalone, embed, module worker, stylesheet and engine assets: HTTP 200; JS MIME correct; missing files: 404.');
} finally {
  server.kill();
}
