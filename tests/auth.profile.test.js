const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SALT = '4';
process.env.ACCESS_TOKEN_SECRET = 'profile-test-access-secret';
process.env.REFRESH_TOKEN_SECRET = 'profile-test-refresh-secret';
const bcrypt = require('bcrypt');
const express = require('express');
const request = require('supertest');
const User = require('../src/models/User');
const RefreshSession = require('../src/models/RefreshSession');
const emailService = require('../src/services/email.service');
const { generateAccessToken } = require('../src/utils/generateToken');
const authRoutes = require('../src/routes/auth.routes');
const errorHandler = require('../src/middleware/error.middleware');

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json());
app.use('/api/v1/auth', authRoutes);
app.use(errorHandler);
let clientNumber = 0;

async function fixture(t) {
    const user = new User({
        _id: '507f1f77bcf86cd799439011', firstName: 'Ada', lastName: 'Lovelace',
        email: 'ada@example.com', phoneNumber: '+233541234567',
        password: await bcrypt.hash('old-password', 4), role: 'user', isActive: true,
    });
    const state = { duplicate: null, writes: [], issued: [], consumed: [], revocations: [], pending: null };
    t.mock.method(User, 'findById', async () => user);
    t.mock.method(User, 'findOne', (filter) => ({
        select: async () => user,
        lean: async () => { state.uniquenessFilter = filter; return state.duplicate; },
    }));
    t.mock.method(User, 'findOneAndUpdate', async (filter, update, options) => {
        state.writes.push({ filter, update, options });
        if (state.writeError) throw state.writeError;
        if (state.noMatch) return null;
        user.set(update.$set);
        await user.validate();
        return user;
    });
    t.mock.method(User, 'updateOne', async (filter, update) => {
        state.writes.push({ filter, update });
        if (state.noMatch) return { matchedCount: 0 };
        user.set(update.$set);
        return { matchedCount: 1 };
    });
    t.mock.method(emailService, 'issueOTP', async (args) => {
        if (state.mailError) throw state.mailError;
        state.issued.push(args);
        state.pending = args.payload;
    });
    t.mock.method(emailService, 'consumeOTP', async (args) => {
        state.consumed.push(args);
        if (state.otpError) throw state.otpError;
        const pending = state.pending;
        state.pending = null;
        return pending;
    });
    t.mock.method(RefreshSession, 'updateMany', async (filter, update) => {
        state.revocations.push({ filter, update });
        return { modifiedCount: 2 };
    });
    const token = generateAccessToken(user);
    const clientIp = `192.0.2.${++clientNumber}`;
    const call = (method, path, body, authenticated = true) => {
        const req = request(app)[method](`/api/v1/auth${path}`).set('X-Forwarded-For', clientIp);
        if (authenticated) req.set('Authorization', `Bearer ${token}`);
        return body === undefined ? req : req.send(body);
    };
    return { user, state, call };
}

test('GET me returns all profile fields without the password', async (t) => {
    const { call } = await fixture(t);
    const res = await call('get', '/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.firstName, 'Ada');
    assert.equal(res.body.data.user.lastName, 'Lovelace');
    assert.equal(res.body.data.user.email, 'ada@example.com');
    assert.equal(res.body.data.user.phoneNumber, '+233541234567');
    assert.equal(res.body.data.user.password, undefined);
});

test('PATCH me trims fields, maps phone, preserves omitted fields and ignores privileged input', async (t) => {
    const { call, state, user } = await fixture(t);
    const res = await call('patch', '/me', {
        firstName: ' Grace ', phone: '+233551234567', role: 'admin', isActive: false,
        _id: '507f1f77bcf86cd799439012', password: 'injected-password',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.firstName, 'Grace');
    assert.equal(res.body.data.user.lastName, 'Lovelace');
    assert.equal(res.body.data.user.phoneNumber, '+233551234567');
    assert.equal(res.body.data.user.role, 'user');
    assert.equal(res.body.data.user.isActive, true);
    assert.equal(res.body.data.user.password, undefined);
    assert.deepEqual(state.writes[0].update, { $set: { firstName: 'Grace', phoneNumber: '+233551234567' } });
    assert.equal(String(state.writes[0].filter._id), String(user._id));
});

test('existing phoneNumber field is accepted and unchanged email needs no password or OTP', async (t) => {
    const { call, state } = await fixture(t);
    const res = await call('patch', '/me', { phoneNumber: '+233551234567', email: ' ADA@EXAMPLE.COM ' });
    assert.equal(res.status, 200);
    assert.equal(state.issued.length, 0);
});

for (const body of [{}, { role: 'admin' }, { firstName: '' }, { lastName: 'a'.repeat(51) },
    { firstName: {} }, { email: 'bad' }, { email: null }, { phone: '123' },
    { phone: '+233541234567', phoneNumber: '+233551234567' }]) {
    test(`profile validation rejects ${JSON.stringify(body)}`, async (t) => {
        const { call, state } = await fixture(t);
        const res = await call('patch', '/me', body);
        assert.equal(res.status, 400);
        assert.equal(res.body.message, 'Validation failed');
        assert.ok(res.body.errors.length);
        assert.equal(state.writes.length, 0);
    });
}

test('email change requires current password and rejects incorrect credentials', async (t) => {
    const { call, state } = await fixture(t);
    for (const currentPassword of [undefined, 'wrong-password']) {
        const res = await call('patch', '/me', { email: 'new@example.com', currentPassword });
        assert.equal(res.status, 400);
    }
    assert.equal(state.issued.length, 0);
    assert.equal(state.writes.length, 0);
});

test('duplicate email and phone return 409 without issuing verification or writing', async (t) => {
    const { call, state } = await fixture(t);
    state.duplicate = { email: 'taken@example.com', phoneNumber: '+233551234567' };
    for (const body of [{ email: 'taken@example.com', currentPassword: 'old-password' }, { phone: '+233551234567' }]) {
        const res = await call('patch', '/me', body);
        assert.equal(res.status, 409);
        assert.equal(res.body.success, false);
    }
    assert.equal(state.issued.length, 0);
    assert.equal(state.writes.length, 0);
});

test('email change uses account-bound OTP, leaves old email active, and confirms only once', async (t) => {
    const { call, state, user } = await fixture(t);
    const res = await call('patch', '/me', {
        firstName: 'Grace', email: 'NEW@EXAMPLE.COM', currentPassword: 'old-password',
    });
    assert.equal(res.status, 202);
    assert.equal(res.body.data.user.firstName, 'Grace');
    assert.equal(res.body.data.user.email, 'ada@example.com');
    assert.equal(res.body.data.user.password, undefined);
    assert.equal(res.body.data.emailVerificationRequired, true);
    assert.equal(res.body.data.pendingEmail, 'new@example.com');
    assert.deepEqual(state.issued[0], {
        email: 'ada@example.com', recipient: 'new@example.com', purpose: 'email_change',
        payload: { userId: String(user._id), email: 'new@example.com' },
    });
    const verify = await call('post', '/me/verify-email', { email: 'new@example.com', code: '123456' });
    assert.equal(verify.status, 200);
    assert.equal(verify.body.data.user.email, 'new@example.com');
    assert.equal(verify.body.data.user.password, undefined);
    assert.deepEqual(state.consumed[0], { email: 'ada@example.com', purpose: 'email_change', code: '123456' });
    const replay = await call('post', '/me/verify-email', { email: 'new@example.com', code: '123456' });
    assert.equal(replay.status, 400);
});

test('verification rejects another account or target, and invalid or expired codes', async (t) => {
    const { call, state, user } = await fixture(t);
    for (const pending of [null, { userId: 'another-user', email: 'new@example.com' },
        { userId: String(user._id), email: 'different@example.com' }]) {
        state.pending = pending;
        const res = await call('post', '/me/verify-email', { email: 'new@example.com', code: '123456' });
        assert.equal(res.status, 400);
    }
    state.otpError = Object.assign(new Error('Invalid or expired verification code'), { statusCode: 400 });
    const res = await call('post', '/me/verify-email', { email: 'new@example.com', code: '654321' });
    assert.equal(res.status, 400);
    assert.equal(state.writes.length, 0);
});

test('email uniqueness is checked again at verification', async (t) => {
    const { call, state } = await fixture(t);
    await call('patch', '/me', { email: 'new@example.com', currentPassword: 'old-password' });
    state.duplicate = { email: 'new@example.com' };
    const res = await call('post', '/me/verify-email', { email: 'new@example.com', code: '123456' });
    assert.equal(res.status, 409);
    assert.equal(state.writes.length, 0);
});

test('database uniqueness races return 409 for update and email verification', async (t) => {
    const { call, state, user } = await fixture(t);
    state.writeError = Object.assign(new Error('duplicate'), { code: 11000 });
    assert.equal((await call('patch', '/me', { phone: '+233551234567' })).status, 409);
    state.pending = { userId: String(user._id), email: 'new@example.com' };
    assert.equal((await call('post', '/me/verify-email', { email: 'new@example.com', code: '123456' })).status, 409);
});

test('password change hashes password, revokes all sessions and expires refresh cookie', async (t) => {
    const { call, state, user } = await fixture(t);
    const previousHash = user.password;
    const res = await call('post', '/change-password', {
        currentPassword: 'old-password', newPassword: ' New-password1! ', confirmPassword: ' New-password1! ',
        userId: 'another-user', role: 'admin',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.requiresLogin, true);
    assert.equal(await bcrypt.compare(' New-password1! ', user.password), true);
    assert.equal(await bcrypt.compare('old-password', user.password), false);
    assert.deepEqual(state.writes[0].filter, { _id: user._id, password: previousHash, isActive: true });
    assert.deepEqual(state.revocations[0].filter, { user: user._id, revokedAt: null });
    assert.match(res.headers['set-cookie'][0], /refreshToken=;.*Expires=Thu, 01 Jan 1970/);
    assert.equal(JSON.stringify(res.body).includes('New-password1!'), false);
});

test('incorrect current password does not modify password or revoke sessions', async (t) => {
    const { call, state } = await fixture(t);
    const res = await call('post', '/change-password', {
        currentPassword: 'wrong-password', newPassword: 'New-password1!', confirmPassword: 'New-password1!',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Current password is incorrect');
    assert.equal(state.writes.length, 0);
    assert.equal(state.revocations.length, 0);
});

for (const body of [{}, { currentPassword: 'old-password', newPassword: 'short', confirmPassword: 'short' },
    { currentPassword: 'old-password', newPassword: 'New-password1!', confirmPassword: 'mismatch' },
    { currentPassword: {}, newPassword: ['New-password1!'], confirmPassword: null }]) {
    test(`password validation rejects ${JSON.stringify(body)} without exposing submitted values`, async (t) => {
        const { call, state } = await fixture(t);
        const res = await call('post', '/change-password', body);
        assert.equal(res.status, 400);
        assert.equal(res.body.message, 'Validation failed');
        assert.ok(res.body.errors.every((error) => !Object.hasOwn(error, 'value')));
        assert.equal(state.writes.length, 0);
    });
}

test('password compare-and-set rejects a concurrent password change', async (t) => {
    const { call, state } = await fixture(t);
    state.noMatch = true;
    const res = await call('post', '/change-password', {
        currentPassword: 'old-password', newPassword: 'New-password1!', confirmPassword: 'New-password1!',
    });
    assert.equal(res.status, 409);
    assert.equal(state.revocations.length, 0);
});

test('all profile endpoints require authentication; inactive accounts are rejected', async (t) => {
    const { call, state, user } = await fixture(t);
    for (const [method, path] of [['get', '/me'], ['patch', '/me'], ['post', '/me/verify-email'], ['post', '/change-password']]) {
        assert.equal((await call(method, path, {}, false)).status, 401);
    }
    user.isActive = false;
    assert.equal((await call('patch', '/me', { firstName: 'Grace' })).status, 401);
    assert.equal(state.writes.length, 0);
});

test('password change attempts are rate limited', async (t) => {
    const { call, state } = await fixture(t);
    for (let attempt = 0; attempt < 10; attempt++) {
        assert.equal((await call('post', '/change-password', {})).status, 400);
    }
    const res = await call('post', '/change-password', {});
    assert.equal(res.status, 429);
    assert.equal(res.body.success, false);
    assert.equal(state.writes.length, 0);
});

test('mail failure leaves personal information and email unchanged', async (t) => {
    const { call, state, user } = await fixture(t);
    state.mailError = Object.assign(new Error('Email service is not configured'), { statusCode: 503 });
    const res = await call('patch', '/me', {
        firstName: 'Grace', email: 'new@example.com', currentPassword: 'old-password',
    });
    assert.equal(res.status, 503);
    assert.equal(user.firstName, 'Ada');
    assert.equal(user.email, 'ada@example.com');
    assert.equal(state.writes.length, 0);
});

test('email verification validates code and email before consuming OTP', async (t) => {
    const { call, state } = await fixture(t);
    const res = await call('post', '/me/verify-email', { email: 'bad-email', code: '123' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.errors.map((error) => error.field), ['email', 'code']);
    assert.equal(state.consumed.length, 0);
});

test('profile updates including email requests are rate limited', async (t) => {
    const { call } = await fixture(t);
    for (let attempt = 0; attempt < 10; attempt++) {
        assert.equal((await call('patch', '/me', { firstName: 'Grace' })).status, 200);
    }
    assert.equal((await call('patch', '/me', { email: 'new@example.com', currentPassword: 'old-password' })).status, 429);
});
