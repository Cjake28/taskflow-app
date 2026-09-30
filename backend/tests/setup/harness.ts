import type { Express } from 'express';
import supertest from 'supertest';
import { createApp } from '../../src/app';
import { createContainer, type Container, type ContainerOverrides } from '../../src/container';
import { TestClock } from './clock';
import { truncateAll } from './database';
import { MemoryMailTransport } from './fakes';

export const TEST_ORIGIN = 'http://localhost:5173';

export interface Harness {
  container: Container;
  app: Express;
  clock: TestClock;
  mail: MemoryMailTransport;
  get(url: string): supertest.Test;
  post(url: string): supertest.Test;
  patch(url: string): supertest.Test;
  put(url: string): supertest.Test;
  del(url: string): supertest.Test;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export async function createHarness(
  overrides: Omit<ContainerOverrides, 'clock' | 'mailTransport'> = {},
): Promise<Harness> {
  const clock = new TestClock();
  const mail = new MemoryMailTransport();
  const container = await createContainer({
    jobs: 'inline',
    ...overrides,
    clock,
    mailTransport: mail,
  });
  const app = createApp(container);
  const agent = supertest(app);

  return {
    container,
    app,
    clock,
    mail,
    get: (url) => agent.get(url),
    post: (url) => agent.post(url).set('Origin', TEST_ORIGIN),
    patch: (url) => agent.patch(url).set('Origin', TEST_ORIGIN),
    put: (url) => agent.put(url).set('Origin', TEST_ORIGIN),
    del: (url) => agent.delete(url).set('Origin', TEST_ORIGIN),
    async reset() {
      await truncateAll(container.prisma);
      await container.redis.flushdb();
      const keys: string[] = [];
      for await (const object of container.storage.list('images/')) keys.push(object.key);
      await container.storage.delete(keys);
      mail.clear();
      clock.reset();
    },
    close: () => container.close(),
  };
}
