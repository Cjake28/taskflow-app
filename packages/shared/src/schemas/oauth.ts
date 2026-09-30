import { z } from 'zod';
import { OAUTH_PROVIDERS } from '../constants/oauth';

export const oauthProviderParamSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS, { error: 'Unknown sign-in provider' }),
});
