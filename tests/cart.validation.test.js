const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const {
    validateAddCartItem,
    validateUpdateCartItem,
} = require('../src/validations/cart.validation');

const app = express();
app.use(express.json());
app.post('/cart/items', validateAddCartItem, (req, res) => res.status(200).json(req.body));
app.patch('/cart/items/:cartItemId', validateUpdateCartItem, (req, res) => res.status(200).json(req.body));

test('accepts a product with the default cart quantity', async () => {
    const response = await request(app)
        .post('/cart/items')
        .send({ productId: '507f1f77bcf86cd799439011' });

    assert.equal(response.status, 200);
    assert.equal(response.body.productId, '507f1f77bcf86cd799439011');
});

test('sanitizes an explicit cart quantity', async () => {
    const response = await request(app)
        .post('/cart/items')
        .send({ productId: '507f1f77bcf86cd799439011', quantity: '3', ignored: true });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { productId: '507f1f77bcf86cd799439011', quantity: 3 });
});

test('rejects zero as an updated cart quantity', async () => {
    const response = await request(app)
        .patch('/cart/items/507f1f77bcf86cd799439011')
        .send({ quantity: 0 });

    assert.equal(response.status, 400);
    assert.equal(response.body.errors[0].message, 'Quantity must be a whole number between 1 and 1000');
});

test('rejects excessive cart quantity with a clear limit', async () => {
    const response = await request(app)
        .post('/cart/items')
        .send({ productId: '507f1f77bcf86cd799439011', quantity: 1001 });

    assert.equal(response.status, 400);
    assert.equal(response.body.errors[0].message, 'Quantity must be a whole number between 1 and 1000');
});
