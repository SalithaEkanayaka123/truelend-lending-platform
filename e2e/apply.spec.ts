import { expect, test, type Page } from '@playwright/test';

import { assertNoHorizontalScroll, gotoClient, uiSignIn, watchProblems } from './support/roles';

const CUSTOMER = 'customer1@example.test';

async function openApply(page: Page): Promise<void> {
  await uiSignIn(page, CUSTOMER);
  await expect(page.getByRole('heading', { level: 1, name: /^Welcome, / })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Apply' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Apply for a loan' })).toBeVisible();
}

async function chooseProduct(page: Page): Promise<void> {
  await page.getByRole('radio', { name: /personal/i }).first().check();
  await page.getByRole('button', { name: 'Continue' }).click();
}

test.describe('Apply wizard (E2-S4)', () => {
  test('QA-VM-035: at 375x812 one step shows at a time with a progress indicator and no h-scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const problems = watchProblems(page);
    await openApply(page);

    const progress = page.getByRole('navigation', { name: 'Application progress' });
    await expect(progress).toContainText('Step 1 of 3');
    await expect(page.getByText('Choose a loan product')).toBeVisible();
    await expect(page.getByLabel('Tenure (months)')).toHaveCount(0);
    await assertNoHorizontalScroll(page);

    await chooseProduct(page);
    await expect(progress).toContainText('Step 2 of 3');
    await expect(page.getByLabel('Tenure (months)')).toBeVisible();
    await expect(page.getByText('Choose a loan product')).toHaveCount(0);
    await assertNoHorizontalScroll(page);
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  test('QA-VM-036: tenure 72 for PERSONAL shows the inline 12-60 months error before Continue', async ({ page }) => {
    await openApply(page);
    await chooseProduct(page);

    const tenure = page.getByLabel('Tenure (months)');
    await tenure.fill('72');
    await tenure.blur();
    await expect(page.getByRole('alert').filter({ hasText: '12-60 months' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await tenure.fill('24');
    await expect(page.getByRole('alert').filter({ hasText: '12-60 months' })).toHaveCount(0);
  });

  test('customer1 applies, uploads the documents and sees the tracker', async ({ page }) => {
    const problems = watchProblems(page);
    await openApply(page);
    await chooseProduct(page);

    await page.getByLabel('Loan amount (INR)').fill('200000');
    await page.getByLabel('Tenure (months)').fill('24');
    await page.getByLabel('Age (years)').fill('30');
    await page.getByLabel('Monthly income (INR)').fill('60000');
    await page.getByLabel('PAN').fill('ABCDE1234F');
    await page.getByLabel('Aadhaar').fill('123456789012');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Upload your documents' })).toBeVisible();
    const submit = page.getByRole('button', { name: 'Submit application' });
    await expect(submit).toBeDisabled();
    for (const name of ['Id proof', 'Address proof', 'Salary slip']) {
      await page.getByRole('button', { name: `Upload ${name}` }).click();
      await expect(page.getByRole('button', { name: `Upload ${name}` })).toHaveCount(0);
    }
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByRole('heading', { level: 1, name: /^Application #\d+$/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Application status' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    const id = /\/applications\/(\d+)/.exec(page.url())?.[1];
    expect(id).toBeDefined();

    // The new application shows up in My applications.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My applications' }).click();
    await expect(page.locator(`a[href="/applications/${id}"]`)).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(problems).toEqual([]);
  });

  test('role access per page: only the right roles open each applicant and verifier page', async ({ page }) => {
    await uiSignIn(page, 'underwriter@example.test');
    await expect(page.getByRole('heading', { level: 1, name: /^Welcome, / })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Verification' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Apply' })).toHaveCount(0);
    for (const path of ['/apply', '/applications']) {
      await gotoClient(page, path);
      await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
    }
    await gotoClient(page, '/verification');
    await expect(page.getByRole('heading', { level: 1, name: 'Verification queue' })).toBeVisible();
  });

  test('a customer cannot open the verification queue', async ({ page }) => {
    await uiSignIn(page, CUSTOMER);
    await expect(page.getByRole('heading', { level: 1, name: /^Welcome, / })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Verification' })).toHaveCount(0);
    await gotoClient(page, '/verification');
    await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
    await gotoClient(page, '/apply');
    await expect(page.getByRole('heading', { level: 1, name: 'Apply for a loan' })).toBeVisible();
  });

  test('admin cannot open the applicant or verifier pages', async ({ page }) => {
    await uiSignIn(page, 'admin@example.test');
    await expect(page.getByRole('heading', { level: 1, name: /^Welcome, / })).toBeVisible();
    for (const path of ['/apply', '/applications', '/verification']) {
      await gotoClient(page, path);
      await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
    }
  });
});
