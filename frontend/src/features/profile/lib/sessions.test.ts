import type { SessionDto } from '@taskflow/shared';
import { describe, expect, it } from 'vitest';

import { avatarFileProblem } from './avatar-file';
import { deviceKind, lastActiveLabel, sortSessions } from './sessions';

const now = new Date('2026-10-01T10:00:00.000Z');

function session(overrides: Partial<SessionDto>): SessionDto {
  return {
    id: 'id',
    device: 'Chrome on Windows',
    ipAddress: '127.0.0.1',
    createdAt: '2026-09-20T10:00:00.000Z',
    lastUsedAt: '2026-10-01T09:58:00.000Z',
    current: false,
    ...overrides,
  };
}

describe('sessions', () => {
  it('lists the current session first, then the most recently used', () => {
    const sorted = sortSessions([
      session({ id: 'old', lastUsedAt: '2026-09-25T10:00:00.000Z' }),
      session({ id: 'recent', lastUsedAt: '2026-09-30T10:00:00.000Z' }),
      session({ id: 'mine', current: true, lastUsedAt: '2026-09-01T10:00:00.000Z' }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['mine', 'recent', 'old']);
  });

  it('describes activity', () => {
    expect(lastActiveLabel(session({}), now)).toBe('Active now');
    expect(lastActiveLabel(session({ lastUsedAt: '2026-09-29T10:00:00.000Z' }), now)).toBe(
      'Last active 2 days ago',
    );
    expect(
      lastActiveLabel(session({ current: true, lastUsedAt: '2026-09-01T10:00:00.000Z' }), now),
    ).toBe('Active now');
  });

  it('picks a device icon from the friendly name', () => {
    expect(deviceKind('Chrome on Windows')).toBe('desktop');
    expect(deviceKind('Safari on iOS')).toBe('phone');
    expect(deviceKind('Chrome on Android')).toBe('phone');
    expect(deviceKind('Safari on iPad')).toBe('tablet');
    expect(deviceKind('Unknown device')).toBe('desktop');
  });
});

describe('avatarFileProblem', () => {
  it('accepts supported images within the size limit', () => {
    expect(avatarFileProblem({ type: 'image/png', size: 200_000 })).toBeNull();
    expect(avatarFileProblem({ type: 'image/jpeg', size: 5 * 1024 * 1024 })).toBeNull();
  });

  it('rejects other types and oversized files', () => {
    expect(avatarFileProblem({ type: 'application/pdf', size: 1000 })).toMatch(/JPEG, PNG/);
    expect(avatarFileProblem({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/);
  });
});
