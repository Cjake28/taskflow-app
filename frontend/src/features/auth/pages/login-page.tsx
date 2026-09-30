import { zodResolver } from '@hookform/resolvers/zod';
import { ErrorCode, loginSchema } from '@taskflow/shared';
import { AtSign, Clock } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';

import { Alert } from '@/components/common/alert';
import { FormField } from '@/components/common/form-field';
import { PasswordInput } from '@/components/common/password-input';
import { AuthHeading, AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { applyServerErrors } from '@/lib/form-errors';

import { LoginFloats } from '../components/brand-visuals';
import { LoginBanners } from '../components/login-banners';
import { OAuthButtons } from '../components/oauth-buttons';
import { sanitizeRedirect, withRedirect } from '../redirect';
import { useAuth } from '../use-auth';

export function LoginPage() {
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const redirect = sanitizeRedirect(searchParams.get('redirect'));

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '', rememberMe: false },
  });
  const { errors, isSubmitting } = form.formState;
  const serverError = errors.root?.server;

  // On success the PublicOnlyRoute guard sends the user on (to `redirect` or /dashboard).
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login(values);
    } catch (error) {
      applyServerErrors(form, error);
    }
  });

  return (
    <AuthLayout
      heading="Plan it. Track it. Get it done."
      text="Your tasks, deadlines and progress in one calm place, secured with rotating sessions and zero plain-text passwords."
      visual={<LoginFloats />}
    >
      <title>Log in · TaskFlow</title>
      <AuthHeading title="Welcome back 👋" subtitle="Log in to continue to your tasks." />

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Log in">
        <LoginBanners params={searchParams} />

        {serverError ? (
          <Alert
            variant={serverError.type === ErrorCode.RATE_LIMITED ? 'warning' : 'danger'}
            icon={serverError.type === ErrorCode.RATE_LIMITED ? Clock : undefined}
          >
            {serverError.message}
          </Alert>
        ) : null}

        <FormField label="Email or username" error={errors.identifier?.message}>
          <Input
            startIcon={<AtSign />}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            {...form.register('identifier')}
          />
        </FormField>

        <FormField
          label="Password"
          error={errors.password?.message}
          labelAside={
            <Link
              to="/forgot-password"
              className="rounded-sm text-[13px] font-bold text-primary hover:underline"
            >
              Forgot password?
            </Link>
          }
        >
          <PasswordInput
            autoComplete="current-password"
            placeholder="Your password"
            {...form.register('password')}
          />
        </FormField>

        <div className="flex items-center gap-2.5">
          <Controller
            control={form.control}
            name="rememberMe"
            render={({ field }) => (
              <Checkbox
                id="remember-me"
                name={field.name}
                checked={field.value === true}
                onCheckedChange={(checked) => field.onChange(checked === true)}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
          <Label htmlFor="remember-me" className="cursor-pointer text-[13.5px] font-semibold">
            Remember me for 30 days
          </Label>
        </div>

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Log in
        </Button>

        <OAuthButtons />

        <p className="mt-1 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            to={withRedirect('/register', redirect)}
            className="rounded-sm font-bold text-primary hover:underline"
          >
            Sign up
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
