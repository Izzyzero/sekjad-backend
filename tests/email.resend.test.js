const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
const sendEmail = require('../src/utils/sendEmail');
const message = { to: 'customer@example.com', subject: 'Verify email', text: '123456', html: '<p>123456</p>' };
function configure(t) {
    const previous = { resendApiKey: env.resendApiKey, mailFrom: env.mailFrom };
    Object.assign(env, { resendApiKey: 're_test', mailFrom: 'Sekjad <mail@example.com>' });
    t.after(() => Object.assign(env, previous));
}
test('Resend request includes credentials, sender, content and an abort signal', async (t) => {
    configure(t);
    t.mock.method(global, 'fetch', async (url, options) => {
        assert.equal(url, 'https://api.resend.com/emails');
        assert.equal(options.method, 'POST');
        assert.equal(options.headers.Authorization, 'Bearer re_test');
        assert.ok(options.signal instanceof AbortSignal);
        assert.deepEqual(JSON.parse(options.body), { ...message, to: [message.to], from: env.mailFrom });
        return { ok: true, json: async () => ({ id: 'email-123' }) };
    });
    assert.deepEqual(await sendEmail(message), { id: 'email-123' });
});
test('missing Resend settings never trigger a network call', async (t) => {
    configure(t);
    env.resendApiKey = '';
    const fetch = t.mock.method(global, 'fetch', async () => {});
    await assert.rejects(sendEmail(message), { statusCode: 503 });
    assert.equal(fetch.mock.callCount(), 0);
});
for (const failure of [401, 403, 429, 500, 'timeout', 'network', 'invalid-json', 'missing-id']) {
    test(`Resend ${failure} yields a sanitized 503`, async (t) => {
        configure(t);
        t.mock.method(console, 'error', () => {});
        t.mock.method(global, 'fetch', async () => {
            if (failure === 'timeout' || failure === 'network') throw new Error('private provider details');
            return { ok: typeof failure !== 'number', status: failure, json: async () => {
                if (failure === 'invalid-json') throw new Error('private provider details');
                return {};
            } };
        });
        await assert.rejects(sendEmail(message), {
            statusCode: 503, message: 'Unable to send verification email. Please try again later',
        });
    });
}
