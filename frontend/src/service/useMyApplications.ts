/** "My applications" (S-A-1). The API has no list endpoint yet (E5-S1), so
 * this loads each application whose id this browser remembers. Ids the
 * current user cannot read (another account's) are dropped silently. */

import { useCallback } from 'react';

import { readApplicationIds } from '../repository/applicationIdsStore';
import * as reviewRepo from '../repository/reviewRepo';
import type { ApplicationDetail } from '../types/review';
import { useLoad, type UseLoadResult } from './useLoad';

async function loadOwn(): Promise<ApplicationDetail[]> {
  const results = await Promise.allSettled(readApplicationIds().map((id) => reviewRepo.getApplication(id)));
  return results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}

export function useMyApplications(): UseLoadResult<ApplicationDetail[]> {
  const load = useCallback(loadOwn, []);
  return useLoad(load);
}
