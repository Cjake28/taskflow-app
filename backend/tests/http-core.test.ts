import express from 'express';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../src/common/middleware/error-handler';
import { validate } from '../src/common/middleware/validate';
import { createHarness, type Harness } from './setup/harness';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});

afterAll(() => h.close());

describe('health', () => {
  it('reports database and redis status', async () => {
    const res = await h.get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok', db: 'ok', redis: 'ok' } });
  });
});

describe('error envelope', () => {
  it('returns NOT_FOUND for unknown routes with a matching request id', async () => {
    const res = await h.get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Route not found' });
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('returns INVALID_JSON for malformed bodies', async () => {
    const res = await h
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('returns PAYLOAD_TOO_LARGE for bodies over 10 kB', async () => {
    const res = await h.post('/api/v1/health').send({ text: 'x'.repeat(20_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('never exposes internal error details', async () => {
    const app = express();
    app.get('/boom', () => {
      throw new Error('database password is hunter2');
    });
    app.use(errorHandler);

    const res = await supertest(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(res.body.error).not.toHaveProperty('stack');
  });
});

describe('validate middleware', () => {
  it('collects field errors from params and body', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.valid = {};
      next();
    });
    app.post(
      '/items/:id',
      validate({
        params: z.object({ id: z.uuid('Invalid id') }),
        body: z.strictObject({ name: z.string().min(1, 'Name is required') }),
      }),
      (req, res) => {
        res.json(req.valid);
      },
    );
    app.use(errorHandler);

    const res = await supertest(app).post('/items/abc').send({ name: '', extra: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { field: 'id', message: 'Invalid id' },
        { field: 'name', message: 'Name is required' },
        { field: 'extra', message: 'Unknown field' },
      ]),
    );
  });
});
