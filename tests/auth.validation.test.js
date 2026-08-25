const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRegistration } = require('../src/validations/auth.validation');
const express = require('express');
const request = require('supertest');

const app = express();
app.use(express.json());
app.post('/register', validateRegistration, (_req, res) => res.status(201).json({ ok: true }));

test('returns only password length errors when password is invalid', async () => {
    const response = await request(app)
        .post('/register')
        .send({
            phoneNumber: '+233541234567',
            email: 'test@example.com',
            firstName: 'Ada',
            lastName: 'Lovelace',
            password: 'short',
            confirmPassword: 'different',
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.message, 'Validation failed');
    assert.deepEqual(
        response.body.errors.map((error) => ({ field: error.field, message: error.message })),
        [
            { field: 'password', message: 'Password must be at least 8 characters' },
        ]
    );
});
