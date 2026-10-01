import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';

import { LogoutButton } from './logout-button';

describe('LogoutButton', () => {
  it('logs out once and shows progress while it does', async () => {
    const events = userEvent.setup();
    const logout = vi.fn(() => new Promise<void>(() => {}));
    render(
      <AuthContext value={{ logout } as unknown as AuthContextValue}>
        <LogoutButton />
      </AuthContext>,
    );

    await events.click(screen.getByRole('button', { name: 'Log out' }));
    const busy = screen.getByRole('button', { name: 'Logging out…' });
    expect(busy).toBeDisabled();
    await events.click(busy);
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
