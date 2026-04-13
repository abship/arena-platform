import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createTestContext } from './helpers.js';

describe('request context middleware', () => {
  it('rejects GPS coordinates outside valid ranges', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .get('/health')
      .set('x-gps-latitude', '91')
      .set('x-gps-longitude', '0');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.message).toBe('GPS coordinates out of range');
  });
});

describe('health and not-found routes', () => {
  it('GET /health returns ok with an ISO timestamp', async () => {
    const context = createTestContext();

    const response = await request(context.app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });

  it('returns 404 for unknown routes', async () => {
    const context = createTestContext();

    const response = await request(context.app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: 'NOT_FOUND',
      message: 'Route not found',
    });
  });
});
