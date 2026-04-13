import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '@arena/shared';
import { authHeader, createTestContext } from './helpers.js';

describe('kyc routes', () => {
  it('POST /kyc/verify forwards documents to the KYC service', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .post('/kyc/verify')
      .set('Authorization', authHeader())
      .send({
        documents: {
          name: 'Player One',
          dateOfBirth: '2000-01-01',
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      level: 2,
      reason: null,
    });
    expect(context.kycService.verifyIdentity).toHaveBeenCalledWith('user-1', {
      name: 'Player One',
      dateOfBirth: '2000-01-01',
    });
  });

  it('GET /kyc/status returns the current verification level', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .get('/kyc/status')
      .set('Authorization', authHeader());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ level: 2 });
  });

  it('POST /kyc/verify validates the request body', async () => {
    const context = createTestContext();

    const response = await request(context.app)
      .post('/kyc/verify')
      .set('Authorization', authHeader())
      .send({ documents: 'not-an-object' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
  });

  it('POST /kyc/verify maps ValidationError from the service', async () => {
    const context = createTestContext();
    context.kycService.verifyIdentity = context.kycService.verifyIdentity
      .mockRejectedValue(new ValidationError('bad documents'));

    const response = await request(context.app)
      .post('/kyc/verify')
      .set('Authorization', authHeader())
      .send({
        documents: {
          name: 'Player One',
          dateOfBirth: '2000-01-01',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'VALIDATION_ERROR',
      message: 'bad documents',
    });
  });
});
