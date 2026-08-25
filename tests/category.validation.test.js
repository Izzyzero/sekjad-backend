const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { validateCreateCategory, validateUpdateCategory } = require('../src/validations/category.validation');

const app = express();
app.use(express.json());
app.post('/categories', validateCreateCategory, (req, res) => res.status(201).json(req.body));
app.patch('/categories/:id', validateUpdateCategory, (req, res) => res.status(200).json(req.body));

test('creating a category retains only its name', async () => {
    const response = await request(app)
        .post('/categories')
        .send({ name: ' Handbags ', description: 'ignored', isActive: false });

    assert.equal(response.status, 201);
    assert.deepEqual(response.body, { name: 'Handbags' });
});

test('updating a category requires a name', async () => {
    const response = await request(app)
        .patch('/categories/507f1f77bcf86cd799439011')
        .send({ description: 'not supported' });

    assert.equal(response.status, 400);
    assert.equal(response.body.errors[0].message, 'Provide at least one category field to update');
});
