const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { validateUpdateUserRole } = require('../src/validations/user.validation');

const app = express();
app.use(express.json());
app.patch('/users/:id/role', validateUpdateUserRole, (req, res) => {
    res.status(200).json({ body: req.body });
});

test('accepts a supported user role', async () => {
    const response = await request(app)
        .patch('/users/507f1f77bcf86cd799439011/role')
        .send({ role: 'admin', ignored: true });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.body, { role: 'admin' });
});

test('rejects an unsupported user role', async () => {
    const response = await request(app)
        .patch('/users/507f1f77bcf86cd799439011/role')
        .send({ role: 'superadmin' });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
        { field: 'role', message: 'Role must be user or admin' },
    ]);
});

test('rejects an invalid user ID', async () => {
    const response = await request(app)
        .patch('/users/not-an-id/role')
        .send({ role: 'admin' });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
        { field: 'id', message: 'Invalid user ID' },
    ]);
});
