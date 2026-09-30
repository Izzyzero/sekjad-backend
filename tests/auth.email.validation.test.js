const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const {
    validateEmailCode,
    validateForgotPassword,
    validateResetPassword,
} = require('../src/validations/auth.validation');

const app = express();
app.use(express.json());
app.post('/verify-email', validateEmailCode, (req, res) => res.json(req.body));
app.post('/forgot-password', validateForgotPassword, (req, res) => res.json(req.body));
app.post('/reset-password', validateResetPassword, (req, res) => res.json(req.body));

test('email verification requires a six-digit code', async () => {
    const response = await request(app).post('/verify-email').send({ email: 'USER@example.com', code: '123' });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [{ field: 'code', message: 'Code must be 6 digits' }]);
});

test('forgot password normalizes the email address', async () => {
    const response = await request(app).post('/forgot-password').send({ email: 'USER@EXAMPLE.COM' });
    assert.equal(response.status, 200);
    assert.equal(response.body.email, 'user@example.com');
});

test('reset password requires matching passwords', async () => {
    const response = await request(app).post('/reset-password').send({
        email: 'user@example.com',
        code: '123456',
        password: 'New-password1!',
        confirmPassword: 'different-password',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [{ field: 'confirmPassword', message: 'Passwords do not match' }]);
});
