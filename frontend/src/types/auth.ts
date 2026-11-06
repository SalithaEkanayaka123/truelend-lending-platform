export type Role = 'CUSTOMER' | 'UNDERWRITER' | 'POLICY_EDITOR' | 'ADMIN';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  role: Role;
  /** Name shown in the app shell; null when the user has none. */
  display_name?: string | null;
}
