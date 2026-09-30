const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { createRateLimiter } = require('../src/middleware/rateLimiter.middleware');

test('returns a consistent 429 response after the request limit is reached', async () => {
    const app = express();
    const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        limit: 2,
        message: 'Request limit reached',
    });
    app.get('/limited', limiter, (_req, res) => res.json({ success: true }));

    assert.equal((await request(app).get('/limited')).status, 200);
    assert.equal((await request(app).get('/limited')).status, 200);

    const blocked = await request(app).get('/limited');
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.body, { success: false, message: 'Request limit reached' });
    assert.ok(blocked.headers.ratelimit);
});

test('successful requests can be excluded from the failure quota', async () => {
    const app = express();
    const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        limit: 1,
        skipSuccessfulRequests: true,
        message: 'Too many failures',
    });
    app.get('/login', limiter, (_req, res) => res.sendStatus(200));

    assert.equal((await request(app).get('/login')).status, 200);
    assert.equal((await request(app).get('/login')).status, 200);
});
