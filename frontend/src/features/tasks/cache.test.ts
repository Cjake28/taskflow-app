import { QueryClient } from '@tanstack/react-query';
import type { ImageDto, TaskDetailsDto, TaskDto, TaskStatus } from '@taskflow/shared';
import { describe, expect, it } from 'vitest';

import { queryKeys } from '@/lib/query-keys';

import type { TaskListResult } from './api';
import {
  removeTaskFromCaches,
  restoreTaskCaches,
  setTaskImages,
  snapshotTaskCaches,
  updateTaskInCaches,
  withStatus,
} from './cache';
import { DEFAULT_TASK_SEARCH, toBoardColumnQuery, toListQuery } from './url-state';

function task(id: string, status: TaskStatus, extra: Partial<TaskDto> = {}): TaskDto {
  return {
    id,
    title: id,
    description: null,
    status,
    priority: 'MEDIUM',
    dueDate: null,
    hasDueTime: false,
    completedAt: null,
    position: 0,
    isOverdue: false,
    imageCount: 0,
    coverThumbUrl: null,
    reminderCount: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...extra,
  };
}

const list = (items: TaskDto[]): TaskListResult => ({
  items,
  meta: { page: 1, pageSize: 10, total: items.length, totalPages: 1 },
});

const column = (status: TaskStatus) =>
  queryKeys.tasks.list(toBoardColumnQuery(DEFAULT_TASK_SEARCH, status));

function seed() {
  const client = new QueryClient();
  const all = queryKeys.tasks.list(toListQuery(DEFAULT_TASK_SEARCH));
  const open = queryKeys.tasks.list({ status: 'TODO,IN_PROGRESS', pageSize: 10 });
  client.setQueryData(all, list([task('a', 'TODO'), task('b', 'IN_PROGRESS')]));
  client.setQueryData(open, list([task('a', 'TODO'), task('b', 'IN_PROGRESS')]));
  client.setQueryData(column('TODO'), list([task('a', 'TODO')]));
  client.setQueryData(column('IN_PROGRESS'), list([task('b', 'IN_PROGRESS')]));
  client.setQueryData(column('COMPLETED'), list([task('c', 'COMPLETED')]));
  return { client, all, open };
}

const itemsOf = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryData<TaskListResult>(key)?.items.map((t) => `${t.id}:${t.status}`);

describe('updateTaskInCaches', () => {
  it('moves a completed task between board columns and out of filtered lists', () => {
    const { client, all, open } = seed();
    updateTaskInCaches(client, 'a', (t) => withStatus(t, 'COMPLETED', new Date('2026-10-02')));

    expect(itemsOf(client, all)).toEqual(['a:COMPLETED', 'b:IN_PROGRESS']);
    expect(itemsOf(client, open)).toEqual(['b:IN_PROGRESS']);
    expect(client.getQueryData<TaskListResult>(open)?.meta.total).toBe(1);
    expect(itemsOf(client, column('TODO'))).toEqual([]);
    expect(itemsOf(client, column('COMPLETED'))).toEqual(['a:COMPLETED', 'c:COMPLETED']);
    expect(client.getQueryData<TaskListResult>(column('COMPLETED'))?.meta.total).toBe(2);
  });

  it('also updates lists cached as raw { data, meta } envelopes (the dashboard)', () => {
    const { client } = seed();
    const dueSoon = queryKeys.tasks.list({
      status: 'TODO,IN_PROGRESS',
      dueTo: '2026-10-08T00:00:00.000Z',
      pageSize: 6,
    });
    client.setQueryData(dueSoon, {
      data: [task('a', 'TODO'), task('b', 'IN_PROGRESS')],
      meta: { page: 1, pageSize: 6, total: 2, totalPages: 1 },
    });

    updateTaskInCaches(client, 'a', (t) => withStatus(t, 'COMPLETED'));
    expect(client.getQueryData(dueSoon)).toMatchObject({
      data: [{ id: 'b' }],
      meta: { total: 1 },
    });

    removeTaskFromCaches(client, 'b');
    expect(client.getQueryData(dueSoon)).toMatchObject({ data: [], meta: { total: 0 } });
  });

  it('keeps derived fields consistent', () => {
    const now = new Date('2026-10-05T10:00:00.000Z');
    const late = task('x', 'TODO', { dueDate: '2026-10-01T00:00:00.000Z', isOverdue: true });
    const done = withStatus(late, 'COMPLETED', now);
    expect(done).toMatchObject({ isOverdue: false, completedAt: now.toISOString() });
    expect(withStatus(done, 'TODO', now)).toMatchObject({ isOverdue: true, completedAt: null });
  });

  it('can be rolled back from a snapshot', () => {
    const { client, all } = seed();
    const snapshot = snapshotTaskCaches(client);
    updateTaskInCaches(client, 'b', (t) => ({ ...t, priority: 'HIGH' }));
    removeTaskFromCaches(client, 'a');
    expect(itemsOf(client, all)).toEqual(['b:IN_PROGRESS']);
    restoreTaskCaches(client, snapshot);
    expect(itemsOf(client, all)).toEqual(['a:TODO', 'b:IN_PROGRESS']);
    expect(client.getQueryData<TaskListResult>(all)?.items[1]?.priority).toBe('MEDIUM');
  });
});

describe('setTaskImages', () => {
  const image = (id: string, createdAt: string): ImageDto => ({
    id,
    url: `/api/v1/images/${id}`,
    thumbUrl: `/api/v1/images/${id}?variant=thumb`,
    width: 10,
    height: 10,
    sizeBytes: 100,
    originalName: `${id}.png`,
    createdAt,
  });

  it('updates the details and the count and cover in lists', () => {
    const { client, all } = seed();
    const detail: TaskDetailsDto = { ...task('a', 'TODO'), images: [], reminders: [] };
    client.setQueryData(queryKeys.tasks.detail('a'), detail);

    setTaskImages(client, 'a', (current) => [
      ...current,
      image('i2', '2026-10-01T00:00:02.000Z'),
      image('i1', '2026-10-01T00:00:01.000Z'),
    ]);

    const updated = client.getQueryData<TaskDetailsDto>(queryKeys.tasks.detail('a'));
    expect(updated?.images.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(updated?.imageCount).toBe(2);
    const row = client.getQueryData<TaskListResult>(all)?.items[0];
    expect(row).toMatchObject({ imageCount: 2, coverThumbUrl: '/api/v1/images/i1?variant=thumb' });

    setTaskImages(client, 'a', (current) => current.filter((i) => i.id !== 'i1'));
    expect(client.getQueryData<TaskListResult>(all)?.items[0]).toMatchObject({
      imageCount: 1,
      coverThumbUrl: '/api/v1/images/i2?variant=thumb',
    });
  });
});
