const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const OTP = require('../src/models/OTP');
const emailService = require('../src/services/email.service');

test('only one concurrent request can consume the same valid OTP', async (t) => {
    const code = '123456';
    const record = {
        _id: 'otp-1',
        codeHash: await bcrypt.hash(code, 4),
        payload: { email: 'user@example.com' },
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
    };
    let consumed = false;

    t.mock.method(OTP, 'findOne', () => ({
        select: async () => record,
    }));
    t.mock.method(OTP, 'findOneAndDelete', () => ({
        select: async () => {
            if (consumed) return null;
            consumed = true;
            return record;
        },
    }));

    const results = await Promise.allSettled([
        emailService.consumeOTP({ email: record.payload.email, purpose: 'email_verification', code }),
        emailService.consumeOTP({ email: record.payload.email, purpose: 'email_verification', code }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.deepEqual(results.find((result) => result.status === 'fulfilled').value, record.payload);
    assert.equal(results.find((result) => result.status === 'rejected').reason.statusCode, 400);
});
