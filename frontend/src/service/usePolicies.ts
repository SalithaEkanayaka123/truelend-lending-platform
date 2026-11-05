/** Loads the product catalog and policy-version list, and creates new
 * drafts (E4-S2). `listPolicies` is caught non-fatally: `GET /api/policies`
 * is documented but not yet implemented end to end by E4-S1, so a failed
 * fetch leaves the version panel empty instead of failing the whole page.
 * A failed products load exposes its error code and correlation id, and
 * `reload` fetches again. */

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { ApiError } from '../repository/apiClient';
import * as policiesRepo from '../repository/policiesRepo';
import type { CreatePolicyRequest, PolicyVersion, PolicyVersionPage, ProductRule } from '../types/policy';

const EMPTY_PAGE: PolicyVersionPage = { items: [], total: 0, limit: 20, offset: 0 };

export interface LoadError {
  code: string;
  correlationId: string | null;
}

export interface UsePoliciesResult {
  products: ProductRule[];
  versions: PolicyVersion[];
  baseVersion: number | null;
  loading: boolean;
  error: string | null;
  loadError: LoadError | null;
  reload: () => void;
  createDraft: (changes: CreatePolicyRequest['changes']) => Promise<PolicyVersion>;
}

interface Catalog {
  products: ProductRule[];
  versions: PolicyVersion[];
}

interface LoadState {
  loading: boolean;
  error: string | null;
  loadError: LoadError | null;
}

interface CatalogLoaderResult extends LoadState {
  products: ProductRule[];
  versions: PolicyVersion[];
  baseVersion: number | null;
  reload: () => void;
  setVersions: Dispatch<SetStateAction<PolicyVersion[]>>;
  setBaseVersion: Dispatch<SetStateAction<number | null>>;
}

const LOADING: LoadState = { loading: true, error: null, loadError: null };
const LOADED: LoadState = { loading: false, error: null, loadError: null };

async function fetchCatalog(): Promise<Catalog> {
  const [products, versionPage] = await Promise.all([
    policiesRepo.listProducts(),
    policiesRepo.listPolicies().catch(() => EMPTY_PAGE),
  ]);
  return { products, versions: versionPage.items };
}

function failedLoad(err: unknown): LoadState {
  const error = err instanceof Error ? err.message : 'Failed to load the policy catalog.';
  const loadError: LoadError =
    err instanceof ApiError
      ? { code: err.code, correlationId: err.correlationId ?? null }
      : { code: 'UNKNOWN', correlationId: null };
  return { loading: false, error, loadError };
}

/** Fetches the catalog on mount and on `reload`; returns loaded state plus
 * the two setters `createDraft` needs to update in place after a save. */
function useCatalogLoader(): CatalogLoaderResult {
  const [products, setProducts] = useState<ProductRule[]>([]);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [load, setLoad] = useState<LoadState>(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoad(LOADING);
    fetchCatalog()
      .then((catalog) => {
        if (!active) return;
        setProducts(catalog.products);
        setVersions(catalog.versions);
        setBaseVersion(catalog.products[0]?.policy_version ?? null);
        setLoad(LOADED);
      })
      .catch((err: unknown) => {
        if (active) setLoad(failedLoad(err));
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const reload = useCallback((): void => setAttempt((n) => n + 1), []);
  return { products, versions, baseVersion, ...load, reload, setVersions, setBaseVersion };
}

export function usePolicies(): UsePoliciesResult {
  const { setVersions, setBaseVersion, ...loaded } = useCatalogLoader();
  const { baseVersion } = loaded;

  const createDraft = useCallback(
    async (changes: CreatePolicyRequest['changes']): Promise<PolicyVersion> => {
      if (baseVersion === null) throw new Error('No base policy version loaded yet.');
      const created = await policiesRepo.createPolicy({ base_version: baseVersion, changes });
      setVersions((prev) => [created, ...prev]);
      setBaseVersion(created.version);
      return created;
    },
    [baseVersion, setVersions, setBaseVersion],
  );

  return { ...loaded, createDraft };
}
