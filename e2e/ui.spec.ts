import { expect, test, type Page } from '@playwright/test';

import { assertNoHorizontalScroll, ROLES, uiSignIn, VIEWPORTS, watchProblems } from './support/roles';

async function expectLanding(page: Page, landing: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: landing })).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test.describe(`UI @${viewport.name} ${viewport.size.width}x${viewport.size.height}`, () => {
    test.use({ viewport: viewport.size });

    for (const r of ROLES) {
      test(`${r.role} signs in and lands on "${r.landing}"`, async ({ page }) => {
        const problems = watchProblems(page);
        await uiSignIn(page, r.email);
        await expectLanding(page, r.landing);
        await assertNoHorizontalScroll(page);
        await page.waitForLoadState('networkidle');
        expect(problems, `${r.role} problems`).toEqual([]);
      });

      test(`${r.role} opening /policies gets ${r.policies === 200 ? 'the editor' : 'a friendly No access'}`, async ({
        page,
      }) => {
        const problems = watchProblems(page);
        await uiSignIn(page, r.email);
        await expectLanding(page, r.landing);
        // Client-side navigation: a full page.goto would drop the in-memory token.
        await page.evaluate(() => {
          window.history.pushState({}, '', '/policies');
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        if (r.policies === 200) {
          await expect(page.getByRole('heading', { name: 'Policy editor' })).toBeVisible();
        } else {
          await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
        }
        await assertNoHorizontalScroll(page);
        await page.waitForLoadState('networkidle');
        expect(problems, `${r.role} /policies problems`).toEqual([]);
      });
    }

    test(`POLICY_EDITOR happy path: change a threshold, save, see the new draft`, async ({ page }) => {
      const problems = watchProblems(page);
      await uiSignIn(page, 'policy@example.test');
      await expect(page.getByRole('heading', { name: 'Policy editor' })).toBeVisible();

      // A distinct value per viewport so each run is a real change.
      await page.getByLabel('Min age').first().fill(viewport.name === 'desktop' ? '22' : '23');
      await page.getByRole('button', { name: /save/i }).click();

      await expect(page.getByRole('status')).toContainText(/draft v\d+/i);
      await assertNoHorizontalScroll(page);
      expect(problems, 'policy editor happy path problems').toEqual([]);
    });
  });
}
