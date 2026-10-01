import { zodResolver } from '@hookform/resolvers/zod';
import { ErrorCode, registerSchema } from '@taskflow/shared';
import { AtSign, Mail } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { Alert } from '@/components/common/alert';
import { FormField } from '@/components/common/form-field';
import { PasswordInput } from '@/components/common/password-input';
import { PasswordStrength } from '@/components/common/password-strength';
import { AuthHeading, AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { applyServerErrors } from '@/lib/form-errors';

import { RegisterFloats } from '../components/brand-visuals';
import { OAuthButtons } from '../components/oauth-buttons';
import { savePendingSignup } from '../pending-signup';
import { sanitizeRedirect, withRedirect } from '../redirect';
import { useAuth } from '../use-auth';

export function RegisterPage() {
  const { register: createAccount } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirect = sanitizeRedirect(searchParams.get('redirect'));

  const form = useForm({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
    defaultValues: {
      firstName: '',
      lastName: '',
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });
  const { errors, isSubmitting } = form.formState;
  const password = useWatch({ control: form.control, name: 'password' });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      // The server checks everything, then emails a code; the account is created after it.
      const pending = await createAccount(values);
      savePendingSignup({ ...pending, firstName: values.firstName });
      await navigate(withRedirect('/register/verify', redirect));
    } catch (error) {
      applyServerErrors(form, error, {
        codeFields: { [ErrorCode.EMAIL_TAKEN]: 'email', [ErrorCode.USERNAME_TAKEN]: 'username' },
      });
    }
  });

  return (
    <AuthLayout
      heading="Start organizing in under a minute."
      text="Create an account, add your first task, and watch your dashboard come alive."
      visual={<RegisterFloats />}
    >
      <title>Create account · TaskFlow</title>
      <AuthHeading title="Create your account" subtitle="It's free and takes less than a minute." />

      <form
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
        aria-label="Create account"
      >
        {errors.root?.server ? (
          <Alert
            variant={errors.root.server.type === ErrorCode.RATE_LIMITED ? 'warning' : 'danger'}
          >
            {errors.root.server.message}
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="First name" error={errors.firstName?.message}>
            <Input autoComplete="given-name" {...form.register('firstName')} />
          </FormField>
          <FormField label="Last name" error={errors.lastName?.message}>
            <Input autoComplete="family-name" {...form.register('lastName')} />
          </FormField>
        </div>

        <FormField label="Username" error={errors.username?.message}>
          <Input
            startIcon={<AtSign />}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            {...form.register('username')}
          />
        </FormField>

        <FormField label="Email" error={errors.email?.message}>
          <Input
            type="email"
            startIcon={<Mail />}
            autoComplete="email"
            spellCheck={false}
            {...form.register('email')}
          />
        </FormField>

        <FormField
          label="Password"
          error={errors.password?.message}
          describedBy="register-password-strength"
          after={<PasswordStrength id="register-password-strength" password={password ?? ''} />}
        >
          <PasswordInput autoComplete="new-password" {...form.register('password')} />
        </FormField>

        <FormField label="Confirm password" error={errors.confirmPassword?.message}>
          <PasswordInput autoComplete="new-password" {...form.register('confirmPassword')} />
        </FormField>

        <Button type="submit" size="lg" className="mt-1 w-full" loading={isSubmitting}>
          Create account
        </Button>

        <OAuthButtons dividerLabel="or sign up with" />

        <p className="mt-1 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            to={withRedirect('/login', redirect)}
            className="rounded-sm font-bold text-primary hover:underline"
          >
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
