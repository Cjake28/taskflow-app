import type { UserDto } from '@taskflow/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';

import { profileApi } from '../api';
import { AccountForm } from './account-form';

vi.mock('../api', () => ({ profileApi: { update: vi.fn() } }));

const user: UserDto = {
  id: 'user-1',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  username: 'juan',
  email: 'juan@example.com',
  avatarUrl: null,
  hasPassword: true,
  emailVerified: true,
  createdAt: '2026-09-29T00:00:00.000Z',
};

function renderForm(overrides: Partial<UserDto> = {}) {
  const current = { ...user, ...overrides };
  const updateUser = vi.fn();
  const auth = { user: current, updateUser } as unknown as AuthContextValue;
  render(
    <MemoryRouter>
      <AuthContext value={auth}>
        <AccountForm user={current} />
      </AuthContext>
    </MemoryRouter>,
  );
  return { updateUser };
}

describe('AccountForm', () => {
  beforeEach(() => {
    vi.mocked(profileApi.update).mockReset();
  });

  it('keeps Save disabled until something changes and sends only changed fields', async () => {
    const events = userEvent.setup();
    vi.mocked(profileApi.update).mockResolvedValue({ ...user, firstName: 'Juana' });
    const { updateUser } = renderForm();

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    const firstName = screen.getByRole('textbox', { name: 'First name' });
    await events.clear(firstName);
    await events.type(firstName, 'Juana');
    expect(save).toBeEnabled();
    expect(screen.queryByLabelText(/Current password/)).not.toBeInTheDocument();

    await events.click(save);

    await waitFor(() => expect(profileApi.update).toHaveBeenCalledWith({ firstName: 'Juana' }));
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Juana' }));
  });

  it('asks for the current password only while the email is being changed', async () => {
    const events = userEvent.setup();
    vi.mocked(profileApi.update).mockResolvedValue({ ...user, email: 'new@example.com' });
    renderForm();

    const email = screen.getByRole('textbox', { name: 'Email' });
    await events.clear(email);
    await events.type(email, 'New@Example.com');
    const password = screen.getByLabelText(/Current password/);

    await events.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Enter your current password to change your email'),
    ).toBeInTheDocument();
    expect(profileApi.update).not.toHaveBeenCalled();

    await events.type(password, 'Secret#123');
    await events.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(profileApi.update).toHaveBeenCalledWith({
        email: 'new@example.com',
        currentPassword: 'Secret#123',
      }),
    );

    // Typing the original address back hides the field again.
    await events.clear(email);
    await events.type(email, 'juan@example.com');
    expect(screen.queryByLabelText(/Current password/)).not.toBeInTheDocument();
  });

  it('shows "already taken" on the username field', async () => {
    const events = userEvent.setup();
    vi.mocked(profileApi.update).mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'USERNAME_TAKEN',
        message: 'Username is already taken',
        details: [{ field: 'username', message: 'Username is already taken' }],
      }),
    );
    renderForm();

    const username = screen.getByRole('textbox', { name: 'Username' });
    await events.clear(username);
    await events.type(username, 'maria');
    await events.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Username is already taken')).toBeInTheDocument();
    expect(username).toHaveAttribute('aria-invalid', 'true');
  });

  it('locks the email for accounts without a password and points to Security', () => {
    renderForm({ hasPassword: false });
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('readonly');
    expect(screen.getByRole('link', { name: 'Set a password' })).toHaveAttribute(
      'href',
      '/profile?tab=security',
    );
  });
});
