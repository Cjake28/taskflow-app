import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './setup/harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(() => h.close());

describe('API docs', () => {
  it('serves an OpenAPI 3.1 document built from the shared schemas', async () => {
    const res = await h.get('/api/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/auth/login',
        '/tasks',
        '/tasks/{id}/images',
        '/dashboard/stats',
        '/notifications',
        '/notifications/preferences',
      ]),
    );
    const createTask = res.body.paths['/tasks'].post.requestBody.content['application/json'].schema;
    expect(createTask.required).toEqual(['title']);
    expect(createTask.properties.title).toMatchObject({ type: 'string', maxLength: 200 });
    expect(createTask.additionalProperties).toBe(false);
    expect(createTask.properties.reminders).toMatchObject({ type: 'array', maxItems: 5 });
  });

  it('serves Swagger UI', async () => {
    const res = await h.get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('swagger-ui');
  });
});
