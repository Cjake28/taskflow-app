import type { UserDto } from '@taskflow/shared';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';

import { Sidebar } from './sidebar';

vi.mock('@/features/dashboard/hooks', () => ({ useOpenTaskCount: () => 3 }));
vi.mock('@/features/notifications/components/notification-bell', () => ({
  NotificationBell: () => <button type="button">Notifications</button>,
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

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext value={{ user } as unknown as AuthContextValue}>
        <Sidebar />
      </AuthContext>
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  it('lists the main pages only; the user card is the way to the profile', () => {
    renderAt('/dashboard');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Dashboard', 'Tasks3 open', 'Calendar', 'Activity']);
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument();

    const card = screen.getByRole('link', { name: 'Your profile: Juan Dela Cruz' });
    expect(card).toHaveAttribute('href', '/profile');
    expect(card).not.toHaveAttribute('aria-current');
  });

  it('marks the user card as the current page on the profile', () => {
    renderAt('/profile?tab=security');
    expect(screen.getByRole('link', { name: 'Your profile: Juan Dela Cruz' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
