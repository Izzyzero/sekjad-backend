const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { EventEmitter } = require('node:events');
const validateEnv = require('../src/config/validateEnv');
const { createHealthHandler } = require('../src/health');
const { startServer } = require('../src/lifecycle');
const { startupErrorMessage } = require('../src/lifecycle');
test('startup diagnostics identify failures without including provider messages or credentials', () => {
    const secret = 'mongodb://user:secret@private-host';
    assert.match(startupErrorMessage({ code: 'EADDRINUSE', message: secret }, 'listener', 4000), /port 4000 is already in use/);
    assert.match(startupErrorMessage({ code: 18, message: secret }, 'database'), /authentication failed/);
    assert.match(startupErrorMessage({ code: 'ENOTFOUND', message: secret }, 'database'), /DNS lookup failed/);
    const nested = { message: secret, reason: { servers: new Map([['host', { error: { cause: { code: 'EACCES' } } }]]) } };
    const message = startupErrorMessage(nested, 'database');
    assert.match(message, /network access was denied/);
    assert.equal(message.includes(secret), false);
    assert.equal(startupErrorMessage({ message: secret }, 'database').includes(secret), false);
});
const valid = {
    MONGO_URI: 'mongodb://localhost/test', ACCESS_TOKEN_SECRET: 'a'.repeat(32), REFRESH_TOKEN_SECRET: 'b'.repeat(32),
    SALT: '10', BASE_URL: 'https://store.example.com', CLOUD_NAME: 'test', CLOUD_API_KEY: 'test',
    CLOUD_API_SECRET: 'test', MAIL_FROM: 'test@example.com', RESEND_API_KEY: 'test', WHATSAPP_ORDER_NUMBER: '+233541234567',
};
test('configuration validation handles required, malformed and conditional settings without leaking values', () => {
    assert.doesNotThrow(() => validateEnv(valid));
    for (const override of [
        { MONGO_URI: '' }, { SALT: '10garbage' }, { PORT: 'invalid' }, { ACCESS_TOKEN_EXPIRES_IN: '0s' },
        { PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: '' }, { RESEND_API_KEY: '' }, { MAIL_FROM: 'invalid' },
        { NODE_ENV: 'production', BASE_URL: 'http://store.example.com' }, { REFRESH_TOKEN_SECRET: valid.ACCESS_TOKEN_SECRET },
    ]) assert.throws(() => validateEnv({ ...valid, ...override }), { code: 'INVALID_CONFIG' });
    assert.throws(() => validateEnv({ ...valid, MONGO_URI: 'secret-value' }), (error) => !error.message.includes('secret-value'));
    assert.doesNotThrow(() => validateEnv({ ...valid, PAYSTACK_ENABLED: 'true', PAYSTACK_SECRET_KEY: 'test', WHATSAPP_ORDER_NUMBER: '' }));
});

test('health checks ping MongoDB and return 503 on disconnect, failure, timeout or shutdown', async () => {
    let shuttingDown = false;
    let ping = async () => ({ ok: 1 });
    const connection = { readyState: 1, db: { admin: () => ({ ping: (...args) => ping(...args) }) } };
    const app = express();
    app.get('/health', createHealthHandler(connection, () => shuttingDown, 20));
    const healthy = await request(app).get('/health');
    assert.equal(healthy.status, 200);
    assert.equal(healthy.headers['cache-control'], 'no-store');
    connection.readyState = 0;
    assert.equal((await request(app).get('/health')).status, 503);
    connection.readyState = 1;
    ping = async () => { throw new Error('database-secret'); };
    const failed = await request(app).get('/health');
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.body, { status: 'unavailable' });
    ping = () => new Promise(() => {});
    assert.equal((await request(app).get('/health')).status, 503);
    ping = async () => ({ ok: 1 });
    shuttingDown = true;
    assert.equal((await request(app).get('/health')).status, 503);
});

test('server waits for database and drains an active request before disconnecting', async () => {
    const events = [];
    const app = express();
    let finishRequest;
    let requestStarted;
    const started = new Promise((resolve) => { requestStarted = resolve; });
    app.get('/slow', (_req, res) => { finishRequest = () => res.send('done'); requestStarted(); });
    let connected;
    const connection = new Promise((resolve) => { connected = resolve; });
    const signals = new EventEmitter();
    const starting = startServer({ app, port: 0, signals, validate: () => events.push('validate'),
        connect: () => connection, disconnect: async () => events.push('disconnect'),
        exit: (code) => events.push(code), logger: { log() {}, error() {} } });
    assert.deepEqual(events, ['validate']);
    connected();
    const running = await starting;
    const pending = request(running.server).get('/slow').then((res) => assert.equal(res.status, 200));
    await started;
    signals.emit('SIGTERM');
    assert.equal(app.locals.shuttingDown, true);
    assert.equal(events.includes('disconnect'), false);
    finishRequest();
    await pending;
    await running.shutdown('SIGINT');
    assert.deepEqual(events, ['validate', 'disconnect', 0]);
    assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('failed configuration or database connection never opens a listener', async () => {
    for (const failValidation of [true, false]) {
        const app = express();
        app.listen = () => { throw new Error('must not listen'); };
        const exits = [];
        const logs = [];
        let connections = 0;
        await startServer({ app, port: 0, signals: new EventEmitter(),
            validate: () => { if (failValidation) validateEnv({}); },
            connect: async () => { connections++; throw new Error('database-secret'); },
            disconnect: async () => {}, exit: (code) => exits.push(code),
            logger: { log() {}, error: (message) => logs.push(message) } });
        assert.equal(connections, failValidation ? 0 : 1);
        assert.deepEqual(exits, [1]);
        assert.equal(logs.join('').includes('database-secret'), false);
    }
});

test('shutdown deadline forces exit when cleanup hangs', async () => {
    const exits = [];
    const running = await startServer({ app: express(), port: 0, signals: new EventEmitter(),
        validate() {}, connect: async () => {}, disconnect: () => new Promise(() => {}),
        exit: (code) => exits.push(code), logger: { log() {}, error() {} }, shutdownTimeoutMs: 20 });
    void running.shutdown('SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(exits, [1]);
});
