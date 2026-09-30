const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { validateRegistration, validateResetPassword, validateLogin } = require('../src/validations/auth.validation');
const { validatePasswordChange } = require('../src/validations/profile.validation');
const app = express();
app.use(express.json());
for (const [route, validation] of Object.entries({ register: validateRegistration, reset: validateResetPassword, change: validatePasswordChange, login: validateLogin })) {
    app.post(`/${route}`, validation, (req, res) => res.json(req.body));
}
const input = (password) => ({
    firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phoneNumber: '+233541234567',
    code: '123456', currentPassword: 'existing-password', password, newPassword: password, confirmPassword: password,
});

for (const route of ['register', 'reset', 'change']) {
    test(`${route} enforces every password requirement`, async () => {
        for (const [password, message] of [
            ['Aa1!', 'at least 8 characters'],
            ['abcdef1!', 'uppercase'],
            ['ABCDEF1!', 'lowercase'],
            ['Abcdefg!', 'number'],
            ['Abcdef12', 'special character'],
            ['Abcdef1 ', 'special character'],
            [12345678, 'string'],
        ]) {
            const res = await request(app).post(`/${route}`).send(input(password));
            assert.equal(res.status, 400);
            assert.ok(res.body.errors.some((error) => error.message.includes(message)), JSON.stringify(res.body));
        }
    });
    test(`${route} accepts strong passwords and preserves whitespace`, async () => {
        for (const password of ['Abcdef1!', ' Abcdef1! ']) {
            const res = await request(app).post(`/${route}`).send(input(password));
            assert.equal(res.status, 200);
            assert.equal(res.body[route === 'change' ? 'newPassword' : 'password'], password);
        }
    });
}

test('login continues accepting existing passwords without new complexity requirements', async () => {
    const res = await request(app).post('/login').send({ email: 'ada@example.com', password: 'old-password' });
    assert.equal(res.status, 200);
});
