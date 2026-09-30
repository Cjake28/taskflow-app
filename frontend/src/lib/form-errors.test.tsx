import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { ApiError, ClientErrorCode } from './api-client';
import { applyServerErrors } from './form-errors';

function setup() {
  return renderHook(() => {
    const form = useForm({ defaultValues: { username: '', email: '', password: '' } });
    // formState is a subscription proxy: read `errors` during render, as a real form does.
    void form.formState.errors;
    return form;
  }).result;
}

describe('applyServerErrors', () => {
  it('maps API details onto the matching fields', () => {
    const form = setup();
    const error = new ApiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Please fix the highlighted fields.',
      details: [
        { field: 'email', message: 'Enter a valid email address' },
        { field: 'password', message: 'Password must include a symbol' },
      ],
    });

    let result = false;
    act(() => {
      result = applyServerErrors(form.current, error);
    });

    expect(result).toBe(true);
    expect(form.current.formState.errors.email).toMatchObject({
      type: 'server',
      message: 'Enter a valid email address',
    });
    expect(form.current.formState.errors.password?.message).toBe('Password must include a symbol');
    expect(form.current.formState.errors.root?.server).toBeUndefined();
  });

  it('falls back to a field for conflict codes without details', () => {
    const form = setup();
    const error = new ApiError({
      status: 409,
      code: 'USERNAME_TAKEN',
      message: 'Username is already taken',
    });

    act(() => {
      applyServerErrors(form.current, error, { codeFields: { USERNAME_TAKEN: 'username' } });
    });

    expect(form.current.formState.errors.username?.message).toBe('Username is already taken');
  });

  it('puts non-field errors on the root', () => {
    const form = setup();
    const error = new ApiError({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email/username or password.',
    });

    let result = true;
    act(() => {
      result = applyServerErrors(form.current, error);
    });

    expect(result).toBe(false);
    expect(form.current.formState.errors.root?.server).toMatchObject({
      type: 'INVALID_CREDENTIALS',
      message: 'Invalid email/username or password.',
    });
  });

  it('collects details for unknown fields into the root error', () => {
    const form = setup();
    const error = new ApiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Please fix the highlighted fields.',
      details: [
        { field: 'email', message: 'Enter a valid email address' },
        { field: 'token', message: 'Reset token is invalid' },
      ],
    });

    act(() => {
      applyServerErrors(form.current, error);
    });

    expect(form.current.formState.errors.email?.message).toBe('Enter a valid email address');
    expect(form.current.formState.errors.root?.server?.message).toBe('Reset token is invalid');
  });

  it('uses friendly copy for network and unknown failures', () => {
    const form = setup();
    act(() => {
      applyServerErrors(
        form.current,
        new ApiError({
          status: 0,
          code: ClientErrorCode.NETWORK_ERROR,
          message: 'Failed to fetch',
        }),
      );
    });
    expect(form.current.formState.errors.root?.server?.message).toMatch(/can't reach the server/i);

    act(() => {
      applyServerErrors(form.current, new Error('boom'));
    });
    expect(form.current.formState.errors.root?.server?.message).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('focuses the first invalid field on screen, whatever the order of the details', async () => {
    type Values = { username: string; email: string };
    let api: UseFormReturn<Values> | undefined;
    function SignUp() {
      const form = useForm<Values>({ defaultValues: { username: '', email: '' } });
      api = form;
      return (
        <form>
          <label>
            Username
            <input {...form.register('username')} />
          </label>
          <label>
            Email
            <input {...form.register('email')} />
          </label>
        </form>
      );
    }
    render(<SignUp />);

    act(() => {
      applyServerErrors(
        api!,
        new ApiError({
          status: 409,
          code: 'EMAIL_TAKEN',
          message: 'Email is already registered',
          details: [
            { field: 'email', message: 'Email is already registered' },
            { field: 'username', message: 'Username is already taken' },
          ],
        }),
      );
    });

    // React Hook Form focuses on the next tick.
    await waitFor(() => expect(screen.getByLabelText('Username')).toHaveFocus());
  });
});
