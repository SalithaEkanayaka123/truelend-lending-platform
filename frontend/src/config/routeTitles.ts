/** Browser-tab title per route, "<Page> · TrueLend". Presentation only. */

const PRODUCT = 'TrueLend';

const PAGE_TITLES: Record<string, string> = {
  '/sign-in': 'Sign in',
  '/home': 'Home',
  '/policies': 'Policy editor',
  '/apply': 'Apply',
  '/applications': 'My applications',
  '/verification': 'Verification queue',
};

const APPLICATION_PATH = /^\/applications\/[^/]+$/;

export function titleFor(pathname: string): string {
  const page = APPLICATION_PATH.test(pathname) ? 'Application' : PAGE_TITLES[pathname];
  return page === undefined ? PRODUCT : `${page} · ${PRODUCT}`;
}
