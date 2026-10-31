import { defineConfig } from '@playwright/test';

const port = 4187;

export default defineConfig({
  testDir: './browser',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: 90000,
  expect: { timeout: 10000 },
  outputDir: '.artifacts/playwright',
  reporter: [['list'], ['html', { outputFolder: '.artifacts/playwright-report', open: 'never' }]],
  use: {
    channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined),
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'desktop' },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ],
  webServer: {
    command: `node scripts/serve.js ${process.env.SITE_ROOT ?? '.'}`,
    env: { PORT: String(port) },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false
  }
});
