const request = require('supertest');
const app = require('../server');

describe('Health Endpoint Tests', () => {
  it('GET /health should return 200 OK with environment and apiVersion', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('apiVersion');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('uptimeSeconds');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /unknown-route should return 404 with structured error', async () => {
    const res = await request(app).get('/unknown-route');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Endpoint not found');
  });
});

