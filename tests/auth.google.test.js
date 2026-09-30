const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GOOGLE_CLIENT_ID = 'test-client';
process.env.SALT = '4';
process.env.ACCESS_TOKEN_SECRET = 'test-access';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh';
const google = require('../src/config/google');
const User = require('../src/models/User');
const service = require('../src/services/auth.service');
const express = require('express');
const request = require('supertest');
const routes = require('../src/routes/auth.routes');
const app = express();
app.use(express.json());
app.use('/auth', routes);
app.use(require('../src/middleware/error.middleware'));
const identity = { sub: 'google-123', email: 'ada@gmail.com', email_verified: true, given_name: 'Ada' };

test('Google verifier passes configured audience and rejects invalid/unverified tokens', async (t) => {
    t.mock.method(google.googleClient, 'verifyIdToken', async (options) => {
        assert.equal(options.audience, 'test-client');
        assert.equal(options.idToken, 'credential');
        return { getPayload: () => identity };
    });
    assert.deepEqual(await google.verifyGoogleCredential('credential'), identity);
    google.googleClient.verifyIdToken.mock.mockImplementation(async () => { throw new Error('expired'); });
    await assert.rejects(google.verifyGoogleCredential('credential'), { statusCode: 401 });
    google.googleClient.verifyIdToken.mock.mockImplementation(async () => ({ getPayload: () => ({ ...identity, email_verified: false }) }));
    await assert.rejects(google.verifyGoogleCredential('credential'), { statusCode: 401 });
});

test('new Google account needs no phone/password and returns a session', async (t) => {
    t.mock.method(google, 'verifyGoogleCredential', async () => identity);
    t.mock.method(User, 'findOne', () => ({ select: async () => null }));
    t.mock.method(User, 'create', async (data) => {
        const user = new User(data);
        await user.validate();
        user.save = async () => user;
        return user;
    });
    const store = t.mock.method(service, 'storeRefreshToken', async () => {});
    const res = await request(app).post('/auth/google').send({ credential: 'token', role: 'admin' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.role, 'user');
    assert.equal(res.body.data.isNewUser, true);
    assert.ok(res.body.data.accessToken);
    assert.equal(res.body.data.user.googleId, undefined);
    assert.match(res.headers['set-cookie'][0], /HttpOnly/);
    assert.equal(store.mock.callCount(), 1);
});

test('returning Google identity is resolved by sub and disabled users are rejected', async (t) => {
    t.mock.method(google, 'verifyGoogleCredential', async () => identity);
    const user = new User({ googleId: identity.sub, email: 'changed@example.com' });
    user.save = async () => user;
    t.mock.method(User, 'findOne', (filter) => {
        assert.deepEqual(filter, { googleId: identity.sub });
        return { select: async () => user };
    });
    const result = await service.googleSignIn({ credential: 'token' });
    assert.equal(result.isNewUser, false);
    assert.equal(result.user.email, 'changed@example.com');
    user.isActive = false;
    await assert.rejects(service.googleSignIn({ credential: 'token' }), { statusCode: 401 });
});

test('existing Gmail account links atomically; third-party emails cannot auto-link', async (t) => {
    const user = new User({ email: identity.email, firstName: 'Ada', lastName: 'L', password: 'hashed-password', phoneNumber: '+233541234567' });
    user.save = async () => user;
    const verify = t.mock.method(google, 'verifyGoogleCredential', async () => identity);
    t.mock.method(User, 'findOne', (filter) => ({ select: async () => filter.googleId ? null : user }));
    const link = t.mock.method(User, 'findOneAndUpdate', async (filter, update) => {
        assert.equal(filter.isActive, true);
        assert.ok(filter.$or);
        assert.equal(update.$set.googleId, identity.sub);
        return user;
    });
    assert.equal((await service.googleSignIn({ credential: 'token' })).isNewUser, false);
    assert.equal(link.mock.callCount(), 1);
    verify.mock.mockImplementation(async () => ({ ...identity, email: 'ada@example.com' }));
    await assert.rejects(service.googleSignIn({ credential: 'token' }), { statusCode: 409 });
    assert.equal(link.mock.callCount(), 1);
});

test('malformed Google requests are rejected before verification', async (t) => {
    const verify = t.mock.method(google, 'verifyGoogleCredential', async () => identity);
    for (const credential of [undefined, '', {}, 'x'.repeat(16385)]) {
        assert.equal((await request(app).post('/auth/google').send({ credential })).status, 400);
    }
    assert.equal(verify.mock.callCount(), 0);
});

test('password login rejects Google-only accounts cleanly', async (t) => {
    t.mock.method(User, 'findOne', () => ({ select: async () => new User({ googleId: identity.sub, email: identity.email }) }));
    await assert.rejects(service.login({ email: identity.email, password: 'anything' }), { statusCode: 401 });
});

test('Google-only accounts can set a password through verified email reset', async (t) => {
    const user = new User({ googleId: identity.sub, email: identity.email });
    t.mock.method(User, 'findOne', () => ({ select: async (selection) => {
        assert.match(selection, /\+googleId/);
        return user;
    } }));
    user.save = async () => user.validate();
    t.mock.method(require('../src/services/email.service'), 'consumeOTP', async () => ({}));
    const revoke = t.mock.method(require('../src/models/RefreshSession'), 'updateMany', async () => ({}));
    await service.resetPassword({ email: identity.email, code: '123456', password: 'new-password' });
    assert.ok(await require('bcrypt').compare('new-password', user.password));
    assert.equal(revoke.mock.callCount(), 1);
});
