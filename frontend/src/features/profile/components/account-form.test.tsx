import type { UserDto } from '@taskflow/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api-client';

import { profileApi } from '../api';
import { AccountForm } from './account-form';

vi.mock('../api', () => ({
  profileApi: {
    update: vi.fn(),
    pendingEmailChange: vi.fn(),
    startEmailChange: vi.fn(),
    verifyEmailChange: vi.fn(),
    resendEmailChange: vi.fn(),
    cancelEmailChange: vi.fn(),
  },
}));

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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthContext value={auth}>
          <AccountForm user={current} />
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { updateUser };
}

describe('AccountForm', () => {
  beforeEach(() => {
    vi.mocked(profileApi.update).mockReset();
    vi.mocked(profileApi.pendingEmailChange).mockResolvedValue(null);
    vi.mocked(profileApi.startEmailChange).mockReset();
    vi.mocked(profileApi.verifyEmailChange).mockReset();
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
    await events.click(save);

    await waitFor(() => expect(profileApi.update).toHaveBeenCalledWith({ firstName: 'Juana' }));
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Juana' }));
  });

  it('changes the email only after the code sent to the new address is entered', async () => {
    const events = userEvent.setup();
    vi.mocked(profileApi.startEmailChange).mockResolvedValue({
      email: 'new@example.com',
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
      resendAvailableAt: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.mocked(profileApi.verifyEmailChange).mockResolvedValue({
      ...user,
      email: 'new@example.com',
    });
    const { updateUser } = renderForm();

    expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument();
    await events.click(screen.getByRole('button', { name: 'Change email' }));

    const dialog = await screen.findByRole('dialog', { name: 'Change your email' });
    await events.click(within(dialog).getByRole('button', { name: 'Send code' }));
    expect(
      await within(dialog).findByText('Enter your current password to change your email'),
    ).toBeInTheDocument();
    expect(profileApi.startEmailChange).not.toHaveBeenCalled();

    await events.type(
      within(dialog).getByRole('textbox', { name: 'New email' }),
      'New@Example.com',
    );
    await events.type(within(dialog).getByLabelText(/Current password/), 'Secret#123');
    await events.click(within(dialog).getByRole('button', { name: 'Send code' }));
    await waitFor(() =>
      expect(profileApi.startEmailChange).toHaveBeenCalledWith({
        email: 'new@example.com',
        currentPassword: 'Secret#123',
      }),
    );

    await screen.findByRole('dialog', { name: 'Check your new inbox' });
    expect(updateUser).not.toHaveBeenCalled();
    await events.keyboard('482913');

    await waitFor(() => expect(profileApi.verifyEmailChange).toHaveBeenCalledWith('482913'));
    expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@example.com' }));
    expect(profileApi.update).not.toHaveBeenCalled();
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
    expect(screen.queryByRole('button', { name: 'Change email' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set a password' })).toHaveAttribute(
      'href',
      '/profile?tab=security',
    );
  });
});
