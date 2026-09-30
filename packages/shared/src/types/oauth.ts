import type { OAuthProviderId } from '../constants/oauth';

export interface LinkedAccountDto {
  provider: OAuthProviderId;
  email: string | null;
  connectedAt: string;
}

export interface LinkedAccountsDto {
  hasPassword: boolean;
  providers: LinkedAccountDto[];
}
