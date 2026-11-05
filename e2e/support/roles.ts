import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** Role matrix from specs/features/F0-platform.md (permission matrix) and
 * specs/ui_spec.md section 2. The task brief says POLICY_MANAGER; the
 * system's role is POLICY_EDITOR (seed user 2). */
export type RoleName = 'ADMIN' | 'POLICY_EDITOR' | 'UNDERWRITER' | 'CUSTOMER';

export interface RoleCase {
  role: RoleName;
  email: string;
  landing: string;
  /** Expected status per endpoint. */
  products: number;
  policies: number;
  audit: number;
}

export const PASSWORD = 'Synthetic-Dev-Pass-1!';

export const ROLES: RoleCase[] = [
  { role: 'ADMIN', email: 'admin@example.test', landing: 'Portfolio dashboard', products: 200, policies: 200, audit: 200 },
  { role: 'POLICY_EDITOR', email: 'policy@example.test', landing: 'Policy editor', products: 200, policies: 200, audit: 403 },
  { role: 'UNDERWRITER', email: 'underwriter@example.test', landing: 'Work queue', products: 200, policies: 403, audit: 403 },
  { role: 'CUSTOMER', email: 'customer1@example.test', landing: 'My applications', products: 200, policies: 403, audit: 403 },
];

export const VIEWPORTS = [
  { name: 'desktop', size: { width: 1280, height: 800 } },
  { name: 'tablet', size: { width: 768, height: 1024 } },
  { name: 'mobile', size: { width: 375, height: 812 } },
] as const;

export async function apiLogin(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post('/api/auth/login', { data: { email, password: PASSWORD } });
  expect(response.status(), `login ${email}`).toBe(200);
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

export async function uiSignIn(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
}

/** Collects console errors, uncaught page errors and >=500 responses. */
export function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()} @ ${message.location().url}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.name}`));
  page.on('response', (response) => {
    if (response.status() >= 500) {
      const cid = response.headers()['x-correlation-id'] ?? 'none';
      problems.push(`HTTP ${response.status()} ${response.url()} correlation_id=${cid}`);
    }
  });
  return problems;
}

export async function assertNoHorizontalScroll(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(widths.scrollWidth, 'horizontal scroll').toBeLessThanOrEqual(widths.clientWidth);
}
