/** Keeps `document.title` in step with the current route. Call once, inside
 * the router, near the root. */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { titleFor } from '../config/routeTitles';

export function useDocumentTitle(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleFor(pathname);
  }, [pathname]);
}
