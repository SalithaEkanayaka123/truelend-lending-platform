import { expect, test } from '@playwright/test';

const POLICY_EDITOR_EMAIL = 'policy@example.test';
const POLICY_EDITOR_PASSWORD = 'Synthetic-Dev-Pass-1!';

async function signInAsPolicyEditor(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(POLICY_EDITOR_EMAIL);
  await page.getByLabel('Password').fill(POLICY_EDITOR_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Policy editor' })).toBeVisible();
}

test.describe('Policy editor', () => {
  test('VM-071: stacks the product forms in one column with no horizontal scroll at 375x812 (E4-S2-AC1)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signInAsPolicyEditor(page);

    const personalHeading = page.getByRole('heading', { name: 'Personal' });
    const vehicleHeading = page.getByRole('heading', { name: 'Vehicle' });
    const personalBox = await personalHeading.boundingBox();
    const vehicleBox = await vehicleHeading.boundingBox();
    expect(personalBox).not.toBeNull();
    expect(vehicleBox).not.toBeNull();
    expect(vehicleBox!.y).toBeGreaterThan(personalBox!.y);

    const scrollWidths = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidths.scrollWidth).toBeLessThanOrEqual(scrollWidths.clientWidth);
  });

  test('VM-072: an inline error appears and Save is disabled for an invalid age range (E4-S2-AC2)', async ({ page }) => {
    await signInAsPolicyEditor(page);

    await page.getByLabel('Min age').first().fill('70');
    await page.getByLabel('Max age').first().fill('60');

    await expect(page.getByText(/min age must be less than max age/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  test('VM-073: a valid change shows Draft v2 and the new version in the list (E4-S2-AC3)', async ({ page }) => {
    await signInAsPolicyEditor(page);

    await page.getByLabel('Min age').first().fill('22');
    await page.getByRole('button', { name: /save/i }).click();

    await expect(page.getByText(/draft v2/i)).toBeVisible();
    await expect(page.getByText('v2', { exact: true })).toBeVisible();
  });
});
