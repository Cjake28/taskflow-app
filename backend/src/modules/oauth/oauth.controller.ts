import { OAUTH_PROVIDERS, OAuthErrorCode, type OAuthProviderId } from '@taskflow/shared';
import type { CookieOptions, Request, Response } from 'express';
import { sessionMeta } from '../../common/http/request-meta';
import { noContent, ok } from '../../common/http/respond';
import { requireUser } from '../../common/middleware/authenticate';
import { setAuthCookies } from '../../common/security/cookies';
import type { Clock } from '../../common/utils/clock';
import type { Logger } from '../../common/utils/logger';
import type { Env } from '../../config/env';
import { OAuthFlowError, type OAuthMode, type OAuthService } from './oauth.service';

export const OAUTH_STATE_COOKIE = 'tf_oauth_state';
const STATE_COOKIE_PATH = '/api/v1/auth/oauth';
const STATE_TTL_MS = 10 * 60 * 1000;

const asProvider = (value: unknown): OAuthProviderId | null =>
  OAUTH_PROVIDERS.includes(value as OAuthProviderId) ? (value as OAuthProviderId) : null;

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= 2048 ? value : undefined;

export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly env: Env,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  providers = (_req: Request, res: Response) => {
    ok(res, this.oauth.enabledProviders());
  };

  /** Browser navigation: always answers with a redirect, never JSON. */
  start = async (req: Request, res: Response) => {
    const mode: OAuthMode = req.query.mode === 'link' ? 'link' : 'login';
    const provider = asProvider(req.params.provider);
    if (!provider) {
      this.redirectError(res, mode, OAuthErrorCode.OAUTH_PROVIDER_DISABLED);
      return;
    }
    try {
      const { url, state } = await this.oauth.begin(provider, mode, req.user?.id ?? null);
      // Lax, not Strict: the return from the provider is a cross-site navigation.
      res.cookie(OAUTH_STATE_COOKIE, state, { ...this.stateCookie(), maxAge: STATE_TTL_MS });
      res.redirect(302, url.toString());
    } catch (err) {
      if (!(err instanceof OAuthFlowError)) throw err;
      this.redirectError(res, err.mode, err.code);
    }
  };

  callback = async (req: Request, res: Response) => {
    const cookieState: unknown = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, this.stateCookie());

    const provider = asProvider(req.params.provider);
    if (!provider) {
      this.redirectError(res, 'login', OAuthErrorCode.OAUTH_PROVIDER_DISABLED);
      return;
    }
    try {
      const outcome = await this.oauth.complete(
        provider,
        {
          code: queryString(req.query.code),
          state: queryString(req.query.state),
          error: queryString(req.query.error),
          cookieState: typeof cookieState === 'string' ? cookieState : undefined,
        },
        sessionMeta(req),
      );
      if (outcome.mode === 'link') {
        this.redirect(res, `/profile?tab=connected&linked=${outcome.provider}`);
        return;
      }
      setAuthCookies(res, this.env, outcome.session, this.clock.now());
      this.redirect(res, '/dashboard');
    } catch (err) {
      if (err instanceof OAuthFlowError) {
        this.redirectError(res, err.mode, err.code);
        return;
      }
      this.logger.error({ err, provider }, 'OAuth callback failed');
      this.redirectError(res, 'login', OAuthErrorCode.OAUTH_FAILED);
    }
  };

  accounts = async (req: Request, res: Response) => {
    ok(res, await this.oauth.listAccounts(requireUser(req).id));
  };

  unlink = async (req: Request, res: Response) => {
    const { provider } = req.valid.params as { provider: OAuthProviderId };
    await this.oauth.unlink(requireUser(req).id, provider);
    noContent(res);
  };

  private stateCookie(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.COOKIE_SECURE,
      path: STATE_COOKIE_PATH,
    };
  }

  private redirect(res: Response, path: string): void {
    res.redirect(302, new URL(path, this.env.FRONTEND_URL).toString());
  }

  private redirectError(res: Response, mode: OAuthMode, code: OAuthErrorCode): void {
    this.redirect(
      res,
      mode === 'link' ? `/profile?tab=connected&oauthError=${code}` : `/login?oauthError=${code}`,
    );
  }
}
