const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const OTP = require('../src/models/OTP');
const transporter = require('../src/config/mail');
const env = require('../src/config/env');
const emailService = require('../src/services/email.service');

test('email-change OTP is keyed to the account, hashed, and delivered to the proposed email', async (t) => {
    const previous = { resendApiKey: env.resendApiKey, mailFrom: env.mailFrom };
    Object.assign(env, { mailFrom: 'test@example.com', resendApiKey: 'test-only' });
    t.after(() => Object.assign(env, previous));
    let stored;
    let message;
    t.mock.method(OTP, 'findOneAndUpdate', async (filter, update) => { stored = { filter, update }; });
    t.mock.method(transporter, 'sendMail', async (mail) => { message = mail; });
    await emailService.issueOTP({
        email: 'old@example.com', recipient: 'new@example.com', purpose: 'email_change',
        payload: { userId: 'user-1', email: 'new@example.com' },
    });
    assert.deepEqual(stored.filter, { email: 'old@example.com', purpose: 'email_change' });
    assert.equal(message.to, 'new@example.com');
    assert.equal(message.subject, 'Your code to verify your new email');
    const code = message.text.match(/\b\d{6}\b/)[0];
    assert.notEqual(stored.update.codeHash, code);
    assert.equal(await bcrypt.compare(code, stored.update.codeHash), true);
    assert.ok(stored.update.expiresAt > new Date());
    assert.equal(stored.update.attempts, 0);
});

for (const code of [401, 429, 500]) {
    test(`Resend ${code} returns a safe 503 and removes the undelivered OTP`, async (t) => {
        const previous = { resendApiKey: env.resendApiKey, mailFrom: env.mailFrom };
        Object.assign(env, { mailFrom: 'test@example.com', resendApiKey: 'test-only' });
        t.after(() => Object.assign(env, previous));
        let removed;
        t.mock.method(OTP, 'findOneAndUpdate', async () => null);
        t.mock.method(OTP, 'deleteOne', async (filter) => { removed = filter; });
        t.mock.method(transporter, 'sendMail', async () => {
            throw Object.assign(new Error('private provider details'), { status: code });
        });
        const log = t.mock.method(console, 'error', () => {});
        await assert.rejects(emailService.issueOTP({
            email: 'old@example.com', recipient: 'new@example.com', purpose: 'email_change',
            payload: { userId: 'user-1', email: 'new@example.com' },
        }), (error) => {
            assert.equal(error.statusCode, 503);
            assert.equal(error.message, 'Unable to send verification email. Please try again later');
            return true;
        });
        assert.deepEqual(removed, { email: 'old@example.com', purpose: 'email_change' });
        assert.deepEqual(log.mock.calls[0].arguments, [
            'Email delivery failed', { provider: 'resend', status: code },
        ]);
    });
}
