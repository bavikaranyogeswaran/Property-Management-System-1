import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../server.js';
import db from '../config/db.js';

// Mock the database to avoid real connections during tests
vi.mock('../config/db.js', () => ({
  default: {
    query: vi.fn(),
  },
}));

// Mock Redis to avoid hangs during tests
vi.mock('../config/redis.js', () => ({
  default: {
    on: vi.fn(),
    call: vi.fn().mockResolvedValue('OK'),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  redisConfig: {
    host: 'mock-redis',
    port: 6379,
  },
}));

// Mock rate limiters to avoid Redis calls during app initialization
vi.mock('../utils/rateLimiters.js', () => {
  const mockLimiter = (req, res, next) => next();
  return {
    apiLimiter: mockLimiter,
    loginLimiter: mockLimiter,
    sensitiveActionLimiter: mockLimiter,
    publicPortalLimiter: mockLimiter,
    default: {
      apiLimiter: mockLimiter,
      loginLimiter: mockLimiter,
      sensitiveActionLimiter: mockLimiter,
      publicPortalLimiter: mockLimiter,
    },
  };
});

describe('API Health & Stability', () => {
  it('should return 200 and connected status when database is online', async () => {
    // Mock successful DB response
    db.query.mockResolvedValueOnce([[{ 1: 1 }]]);

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('app', 'up');
    expect(res.body).toHaveProperty('database', 'connected');
    expect(db.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('should return 503 and disconnected status when database is offline', async () => {
    // Mock DB failure
    db.query.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await request(app).get('/api/health');

    expect(res.statusCode).toBe(503);
    expect(res.body).toHaveProperty('app', 'up');
    expect(res.body).toHaveProperty('database', 'disconnected');
    expect(res.body).toHaveProperty('error', 'Connection refused');
  });
});
