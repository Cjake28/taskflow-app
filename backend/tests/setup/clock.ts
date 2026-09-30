import type { Clock } from '../../src/common/utils/clock';

export class TestClock implements Clock {
  private current: number;

  constructor(start: Date = new Date()) {
    this.current = start.getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current += ms;
  }

  /** Back to real time (called between tests). */
  reset(): void {
    this.current = Date.now();
  }
}
