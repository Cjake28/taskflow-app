import type { TaskDto, TaskStatus } from '@taskflow/shared';
import { describe, expect, it } from 'vitest';

import {
  dropIndex,
  emptyColumns,
  findColumn,
  moveCard,
  neighboursOf,
  resolveMove,
  type BoardColumns,
} from './board';

function task(id: string, status: TaskStatus): TaskDto {
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
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function board(): BoardColumns {
  return {
    TODO: [task('a', 'TODO'), task('b', 'TODO'), task('c', 'TODO')],
    IN_PROGRESS: [task('d', 'IN_PROGRESS')],
    COMPLETED: [],
  };
}

const ids = (columns: BoardColumns) => ({
  TODO: columns.TODO.map((t) => t.id),
  IN_PROGRESS: columns.IN_PROGRESS.map((t) => t.id),
  COMPLETED: columns.COMPLETED.map((t) => t.id),
});

describe('moveCard', () => {
  it('moves a card into another column at an index', () => {
    const next = moveCard(board(), 'b', 'IN_PROGRESS', 0);
    expect(ids(next)).toEqual({ TODO: ['a', 'c'], IN_PROGRESS: ['b', 'd'], COMPLETED: [] });
  });

  it('clamps the index and supports empty columns', () => {
    expect(ids(moveCard(board(), 'a', 'COMPLETED', 9)).COMPLETED).toEqual(['a']);
    expect(ids(moveCard(board(), 'a', 'IN_PROGRESS', 9)).IN_PROGRESS).toEqual(['d', 'a']);
  });

  it('reorders within a column and leaves the input untouched', () => {
    const before = board();
    const next = moveCard(before, 'a', 'TODO', 2);
    expect(ids(next).TODO).toEqual(['b', 'c', 'a']);
    expect(ids(before).TODO).toEqual(['a', 'b', 'c']);
  });

  it('ignores unknown cards', () => {
    const before = board();
    expect(moveCard(before, 'zzz', 'TODO', 0)).toBe(before);
    expect(findColumn(before, 'd')).toBe('IN_PROGRESS');
    expect(findColumn(emptyColumns(), 'd')).toBeNull();
  });
});

describe('neighboursOf', () => {
  it('returns the cards above and below', () => {
    const column = [task('a', 'TODO'), task('b', 'TODO'), task('c', 'TODO')];
    expect(neighboursOf(column, 'a')).toEqual({ prevId: null, nextId: 'b' });
    expect(neighboursOf(column, 'b')).toEqual({ prevId: 'a', nextId: 'c' });
    expect(neighboursOf(column, 'c')).toEqual({ prevId: 'b', nextId: null });
    expect(neighboursOf([task('x', 'TODO')], 'x')).toEqual({ prevId: null, nextId: null });
    expect(neighboursOf(column, 'missing')).toEqual({ prevId: null, nextId: null });
  });
});

describe('resolveMove', () => {
  it('describes a move to another column with its neighbours', () => {
    const before = board();
    const after = moveCard(before, 'c', 'IN_PROGRESS', 1);
    expect(resolveMove(before, after, 'c')).toEqual({
      taskId: 'c',
      fromStatus: 'TODO',
      status: 'IN_PROGRESS',
      index: 1,
      prevId: 'd',
      nextId: null,
    });
  });

  it('describes a reorder within a column', () => {
    const before = board();
    const after = moveCard(before, 'c', 'TODO', 0);
    expect(resolveMove(before, after, 'c')).toMatchObject({
      status: 'TODO',
      fromStatus: 'TODO',
      prevId: null,
      nextId: 'a',
    });
  });

  it('returns null when the card did not move', () => {
    const before = board();
    expect(resolveMove(before, moveCard(before, 'b', 'TODO', 1), 'b')).toBeNull();
    expect(resolveMove(before, before, 'zzz')).toBeNull();
  });

  it('drops into an empty column with no neighbours', () => {
    const before = board();
    expect(resolveMove(before, moveCard(before, 'a', 'COMPLETED', 0), 'a')).toMatchObject({
      status: 'COMPLETED',
      prevId: null,
      nextId: null,
    });
  });
});

describe('dropIndex', () => {
  const column = [task('a', 'TODO'), task('b', 'TODO')];
  it('drops above or below the hovered card', () => {
    expect(dropIndex(column, 'b', false)).toBe(1);
    expect(dropIndex(column, 'b', true)).toBe(2);
    expect(dropIndex(column, 'a', false)).toBe(0);
  });
  it('drops at the end when hovering the column itself', () => {
    expect(dropIndex(column, 'TODO', false)).toBe(2);
  });
});
