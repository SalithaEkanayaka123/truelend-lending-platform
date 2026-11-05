import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

// Ports default to values that do not collide with a developer's running
// stack (backend 8000, Vite 5173). Override with E2E_BACKEND_PORT /
// E2E_FRONTEND_PORT (the baseURL is http://localhost:<E2E_FRONTEND_PORT>;
// with the default 5173 it is the documented http://localhost:5173).
const BACKEND_PORT = process.env.E2E_BACKEND_PORT ?? '8100';
const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT ?? '5173';

const repoRoot = path.resolve(__dirname, '..');
const tmpDir = path.join(__dirname, '.tmp');
const prepare = path.join(__dirname, 'scripts', 'prepare-backend.js');

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // One worker: the specs share one seeded DB, and the policy specs append
  // append-only policy versions.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // cwd backend/; seeded on startup by the app lifespan (migrations + users + policy v1).
      command: `node "${prepare}" && uv run uvicorn truelend.api.main:create_app --factory --app-dir src --host 127.0.0.1 --port ${BACKEND_PORT}`,
      cwd: path.join(repoRoot, 'backend'),
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        TRUELEND_ENV: 'test',
        TRUELEND_DB_PATH: path.join(tmpDir, 'e2e.db'),
        TRUELEND_POLICIES_DIR: path.join(tmpDir, 'policies'),
      },
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT} --strictPort`,
      cwd: path.join(repoRoot, 'frontend'),
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_PROXY_TARGET: `http://127.0.0.1:${BACKEND_PORT}` },
    },
  ],
});
