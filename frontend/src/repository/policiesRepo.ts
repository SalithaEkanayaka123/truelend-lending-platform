/** Typed client for the product catalog and policy-version endpoints
 * (E4-S1/E4-S2). Nothing outside `repository/` calls `apiClient` for these
 * resources. */

import type { CreatePolicyRequest, PolicyVersion, PolicyVersionPage, ProductRule } from '../types/policy';
import { apiRequest } from './apiClient';

export function listProducts(): Promise<ProductRule[]> {
  return apiRequest<ProductRule[]>('/api/products');
}

export function listPolicies(): Promise<PolicyVersionPage> {
  return apiRequest<PolicyVersionPage>('/api/policies');
}

export function createPolicy(request: CreatePolicyRequest): Promise<PolicyVersion> {
  return apiRequest<PolicyVersion>('/api/policies', { method: 'POST', body: request });
}
