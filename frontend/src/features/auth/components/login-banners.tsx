import { Clock } from 'lucide-react';

import { Alert } from '@/components/common/alert';

import { oauthErrorCopy, type BannerCopy } from '../oauth-errors';

/** Banners driven by the login URL: ?reason=expired, ?reset=success, ?oauthError=<CODE>. */
export function LoginBanners({ params }: { params: URLSearchParams }) {
  const banners: Array<BannerCopy & { key: string }> = [];

  if (params.get('reset') === 'success') {
    banners.push({
      key: 'reset',
      variant: 'success',
      title: 'Password updated',
      body: 'Log in with your new password.',
    });
  }
  if (params.get('reason') === 'expired') {
    banners.push({
      key: 'expired',
      variant: 'warning',
      icon: Clock,
      title: 'Your session expired',
      body: 'Please log in again to continue.',
    });
  }
  const oauthError = params.get('oauthError');
  if (oauthError) {
    banners.push({ key: 'oauth', ...oauthErrorCopy(oauthError, params.get('provider')) });
  }

  if (banners.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {banners.map(({ key, variant, title, body, icon }) => (
        <Alert key={key} variant={variant} title={title} icon={icon}>
          {body}
        </Alert>
      ))}
    </div>
  );
}
