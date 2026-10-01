import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api-client';

import { notificationsApi } from '../api';
import { UnsubscribePage } from './unsubscribe-page';

vi.mock('../api', () => ({ notificationsApi: { unsubscribe: vi.fn() } }));

const TOKEN = 'a'.repeat(40);

function renderPage(search: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/unsubscribe${search}`]}>
        <UnsubscribePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('UnsubscribePage', () => {
  beforeEach(() => {
    vi.mocked(notificationsApi.unsubscribe)
      .mockReset()
      .mockResolvedValue({ type: 'DAILY_DIGEST', email: 'j***@example.com' });
  });

  it('turns the email off once and confirms it', async () => {
    renderPage(`?token=${TOKEN}`);
    expect(screen.getByRole('status')).toHaveTextContent('Updating your email settings');
    expect(await screen.findByRole('heading', { name: "You're unsubscribed" })).toBeInTheDocument();
    expect(screen.getByText(/daily summary emails at/)).toHaveTextContent(
      "You won't get daily summary emails at j***@example.com anymore.",
    );
    expect(screen.getByRole('link', { name: 'Manage notifications' })).toHaveAttribute(
      'href',
      '/profile?tab=notifications',
    );
    expect(notificationsApi.unsubscribe).toHaveBeenCalledTimes(1);
    expect(notificationsApi.unsubscribe).toHaveBeenCalledWith(TOKEN);
  });

  it('explains an invalid link', async () => {
    vi.mocked(notificationsApi.unsubscribe).mockRejectedValue(
      new ApiError({
        status: 400,
        code: 'BAD_REQUEST',
        message: 'This unsubscribe link is invalid or has expired.',
      }),
    );
    renderPage(`?token=${TOKEN}`);
    expect(
      await screen.findByRole('heading', {
        name: 'This unsubscribe link is invalid or has expired',
      }),
    ).toBeInTheDocument();
  });

  it('does not call the server without a token', () => {
    renderPage('');
    expect(
      screen.getByRole('heading', { name: 'This unsubscribe link is invalid or has expired' }),
    ).toBeInTheDocument();
    expect(notificationsApi.unsubscribe).not.toHaveBeenCalled();
  });

  it('offers a retry when the server is down', async () => {
    vi.mocked(notificationsApi.unsubscribe).mockRejectedValue(
      new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: 'Down' }),
    );
    renderPage(`?token=${TOKEN}`);
    expect(await screen.findByText("We couldn't update your email settings")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
