/** Loads the product catalog and policy-version list, and creates new
 * drafts (E4-S2). `listPolicies` is caught non-fatally: `GET /api/policies`
 * is documented but not yet implemented end to end by E4-S1, so a failed
 * fetch leaves the version panel empty instead of failing the whole page. */

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import * as policiesRepo from '../repository/policiesRepo';
import type { CreatePolicyRequest, PolicyVersion, PolicyVersionPage, ProductRule } from '../types/policy';

const EMPTY_PAGE: PolicyVersionPage = { items: [], total: 0, limit: 20, offset: 0 };

export interface UsePoliciesResult {
  products: ProductRule[];
  versions: PolicyVersion[];
  baseVersion: number | null;
  loading: boolean;
  error: string | null;
  createDraft: (changes: CreatePolicyRequest['changes']) => Promise<PolicyVersion>;
}

interface Catalog {
  products: ProductRule[];
  versions: PolicyVersion[];
}

interface CatalogLoaderResult {
  products: ProductRule[];
  versions: PolicyVersion[];
  baseVersion: number | null;
  loading: boolean;
  error: string | null;
  setVersions: Dispatch<SetStateAction<PolicyVersion[]>>;
  setBaseVersion: Dispatch<SetStateAction<number | null>>;
}

async function fetchCatalog(): Promise<Catalog> {
  const [products, versionPage] = await Promise.all([
    policiesRepo.listProducts(),
    policiesRepo.listPolicies().catch(() => EMPTY_PAGE),
  ]);
  return { products, versions: versionPage.items };
}

/** Fetches the catalog once on mount; returns loaded state plus the two
 * setters `createDraft` needs to update in place after a save. */
function useCatalogLoader(): CatalogLoaderResult {
  const [products, setProducts] = useState<ProductRule[]>([]);
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchCatalog()
      .then((catalog) => {
        if (!active) return;
        setProducts(catalog.products);
        setVersions(catalog.versions);
        setBaseVersion(catalog.products[0]?.policy_version ?? null);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load the policy catalog.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { products, versions, baseVersion, loading, error, setVersions, setBaseVersion };
}

export function usePolicies(): UsePoliciesResult {
  const { products, versions, baseVersion, loading, error, setVersions, setBaseVersion } = useCatalogLoader();

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

  return { products, versions, baseVersion, loading, error, createDraft };
}
