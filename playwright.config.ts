import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build, served by `vite preview`.
// Software WebGL keeps VoiceOrb rendering the same on machines without a GPU.
const PORT = 5319;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
    // Linux headless Chromium already renders WebGL in software; forcing SwiftShader there makes every screenshot stall
    launchOptions: process.platform === 'linux' ? {} : { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /(smoke|navigation)\.spec\.ts/ },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
