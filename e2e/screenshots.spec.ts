import path from 'node:path';

import { expect, test } from '@playwright/test';

import { ROLES, uiSignIn, VIEWPORTS } from './support/roles';

// Full-page PNGs per role and viewport -> e2e/screenshots/. Skipped on CI.
test.skip(Boolean(process.env.CI), 'screenshots are a local artefact');

const outDir = path.join(__dirname, 'screenshots');

for (const viewport of VIEWPORTS) {
  for (const r of ROLES) {
    test(`screenshot ${r.role} @${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport.size);
      await uiSignIn(page, r.email);
      await expect(page.getByRole('heading', { level: 1, name: r.landing })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        path: path.join(outDir, `${r.role.toLowerCase()}-${viewport.name}.png`),
        fullPage: true,
      });
    });
  }
}
