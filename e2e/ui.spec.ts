import { expect, test, type Page } from '@playwright/test';

import { assertNoHorizontalScroll, ROLES, uiSignIn, VIEWPORTS, watchProblems } from './support/roles';

async function expectLanding(page: Page, landing: string, displayName: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: landing })).toBeVisible();
  // The shell shows the seeded display name, not a name derived from the email.
  await expect(page.locator('header').getByText(displayName, { exact: true })).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test.describe(`UI @${viewport.name} ${viewport.size.width}x${viewport.size.height}`, () => {
    test.use({ viewport: viewport.size });

    for (const r of ROLES) {
      test(`${r.role} signs in and lands on "${r.landing}"`, async ({ page }) => {
        const problems = watchProblems(page);
        await uiSignIn(page, r.email);
        await expectLanding(page, r.landing, r.displayName);
        await assertNoHorizontalScroll(page);
        await page.waitForLoadState('networkidle');
        expect(problems, `${r.role} problems`).toEqual([]);
      });

      test(`${r.role} opening /policies gets ${r.policies === 200 ? 'the editor' : 'a friendly No access'}`, async ({
        page,
      }) => {
        const problems = watchProblems(page);
        await uiSignIn(page, r.email);
        await expectLanding(page, r.landing, r.displayName);
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

    test('role homes: real cards, no stale copy, and a title for the tab', async ({ page }) => {
      const cards: Record<string, { links: Record<string, string>; soon: number }> = {
        'customer1@example.test': { links: { 'Apply for a loan': '/apply', 'My applications': '/applications' }, soon: 0 },
        'underwriter@example.test': { links: { 'Verification queue': '/verification' }, soon: 1 },
        'admin@example.test': { links: { Policies: '/policies' }, soon: 1 },
      };
      for (const [email, expected] of Object.entries(cards)) {
        await uiSignIn(page, email);
        await expect(page.getByRole('heading', { level: 1, name: /^Welcome, / })).toBeVisible();
        await expect(page).toHaveTitle('Home · TrueLend');
        await expect(page.getByText(/pick up where you left off/i)).toHaveCount(0);
        const main = page.locator('main');
        for (const [name, href] of Object.entries(expected.links)) {
          await expect(main.getByRole('link', { name: new RegExp(name, 'i') })).toHaveAttribute('href', href);
        }
        await expect(main.getByText(/coming soon/i)).toHaveCount(expected.soon);
        await page.getByRole('button', { name: /sign out/i }).click();
      }
    });

    test('the tab title follows the route', async ({ page }) => {
      await uiSignIn(page, 'policy@example.test');
      await expect(page).toHaveTitle('Policy editor · TrueLend');
      await uiSignIn(page, 'customer1@example.test');
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Apply' }).click();
      await expect(page).toHaveTitle('Apply · TrueLend');
    });

    test(`POLICY_EDITOR happy path: change a threshold, save, see the new draft`, async ({ page }) => {
      const problems = watchProblems(page);
      await uiSignIn(page, 'policy@example.test');
      await expect(page.getByRole('heading', { name: 'Policy editor' })).toBeVisible();

      // A distinct value per viewport so each run is a real change.
      const value = { desktop: '22', tablet: '23', mobile: '24' }[viewport.name];
      await page.getByLabel('Min age').first().fill(value);
      await page.getByRole('button', { name: /save/i }).click();

      await expect(page.getByRole('status')).toContainText(/draft v\d+/i);
      // The timeline names people, never raw user ids.
      await expect(page.getByText(/Approved by Arjun Mehta/).first()).toBeVisible();
      await expect(page.getByText(/Created by Meera Iyer/).first()).toBeVisible();
      await expect(page.getByText(/by user #/i)).toHaveCount(0);
      await assertNoHorizontalScroll(page);
      expect(problems, 'policy editor happy path problems').toEqual([]);
    });
  });
}
