const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const backend = createRequire('C:/Users/hp/Desktop/sekjad-backend/package.json');
const express = backend('express');
const request = backend('supertest');
const env = backend('./src/config/env');
const transport = backend('./src/config/mail');
const routePath = backend.resolve('./src/routes/contact.routes');
function setup(t) {
  const previous = { ...env };
  Object.assign(env, { resendApiKey: 'test-only', mailFrom: 'Sekjad Enterprise <onboarding@resend.dev>', contactTo: 'adebanjoisrael940@gmail.com' });
  t.after(() => Object.assign(env, previous));
  delete require.cache[routePath];
  return express().use(express.json()).use('/contact', backend(routePath));
}
const message = { name: 'Test Visitor', email: 'visitor@example.com', message: 'A question about fabrics.' };
test('public contact uses configured recipient and visitor reply-to, ignoring injected recipient', async t => {
  const app = setup(t);
  let payload;
  t.mock.method(global, 'fetch', async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ id: 'test-email' }) };
  });
  const response = await request(app).post('/contact').send({ ...message, to: 'attacker@example.com' });
  assert.equal(response.status, 200);
  assert.deepEqual(payload.to, ['adebanjoisrael940@gmail.com']);
  assert.equal(payload.reply_to, message.email);
  assert.equal(payload.from, env.mailFrom);
  assert.match(payload.text, /A question about fabrics/);
});
test('invalid input never sends mail', async t => {
  const app = setup(t);
  const send = t.mock.method(transport, 'sendMail', async () => ({ id: 'unused' }));
  for (const bad of [{ ...message, email: 'bad' }, { ...message, message: ' ' }, { ...message, subject: 'bad\nheader' }]) {
    assert.equal((await request(app).post('/contact').send(bad)).status, 400);
  }
  assert.equal(send.mock.callCount(), 0);
});
test('provider failure returns sanitized error rather than success', async t => {
  const app = setup(t);
  t.mock.method(console, 'error', () => {});
  t.mock.method(transport, 'sendMail', async () => { throw new Error('private provider details'); });
  const response = await request(app).post('/contact').send(message);
  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
  assert.doesNotMatch(JSON.stringify(response.body), /private provider/);
});
test('contact mail is rate limited', async t => {
  const app = setup(t);
  const send = t.mock.method(transport, 'sendMail', async () => ({ id: 'test' }));
  for (let i = 0; i < 3; i++) assert.equal((await request(app).post('/contact').send(message)).status, 200);
  assert.equal((await request(app).post('/contact').send(message)).status, 429);
  assert.equal(send.mock.callCount(), 3);
});
