const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { getTrustProxy, configureProxy } = require('../src/config/proxy');
const { createRateLimiter } = require('../src/middleware/rateLimiter.middleware');

test('proxy defaults and explicit overrides are bounded numeric settings', () => {
    assert.equal(getTrustProxy({}), 0);
    assert.equal(getTrustProxy({ RENDER: 'true' }), 1);
    assert.equal(getTrustProxy({ RENDER: 'true', TRUST_PROXY_HOPS: '0' }), 0);
    assert.equal(getTrustProxy({ TRUST_PROXY_HOPS: '2' }), 2);
    for (const value of ['true', '-1', '1.5', '11', '', '1oops']) {
        assert.throws(() => getTrustProxy({ TRUST_PROXY_HOPS: value }), { code: 'INVALID_CONFIG' });
    }
});

test('forwarded clients get separate quotas and spoofed leftmost entries cannot reset a quota', async () => {
    const app = express();
    configureProxy(app, { RENDER: 'true' });
    app.get('/', createRateLimiter({ windowMs: 60000, limit: 1, message: 'Limited' }),
        (req, res) => res.json({ ip: req.ip }));
    const first = await request(app).get('/').set('X-Forwarded-For', '198.51.100.1');
    assert.equal(first.status, 200);
    assert.equal(first.body.ip, '198.51.100.1');
    assert.equal((await request(app).get('/').set('X-Forwarded-For', '198.51.100.1')).status, 429);
    assert.equal((await request(app).get('/').set('X-Forwarded-For', '198.51.100.2')).status, 200);
    assert.equal((await request(app).get('/').set('X-Forwarded-For', '203.0.113.55, 198.51.100.1')).status, 429);
});

test('direct local connections ignore forwarded IP headers', async () => {
    const app = express();
    configureProxy(app, {});
    app.get('/', (req, res) => res.json({ ip: req.ip }));
    const normal = await request(app).get('/');
    const forged = await request(app).get('/').set('X-Forwarded-For', '198.51.100.99');
    assert.equal(forged.body.ip, normal.body.ip);
});
