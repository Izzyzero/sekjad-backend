const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const {
    validateAddWishlistProduct,
    validateWishlistProductId,
} = require('../src/validations/wishlist.validation');

const app = express();
app.use(express.json());
app.post('/wishlist/items', validateAddWishlistProduct, (req, res) => res.status(200).json(req.body));
app.delete('/wishlist/items/:productId', validateWishlistProductId, (_req, res) => res.sendStatus(204));

test('accepts a valid wishlist product and removes unknown body fields', async () => {
    const response = await request(app)
        .post('/wishlist/items')
        .send({ productId: '507f1f77bcf86cd799439011', ignored: true });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { productId: '507f1f77bcf86cd799439011' });
});

test('requires a product ID when adding to the wishlist', async () => {
    const response = await request(app).post('/wishlist/items').send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.errors[0].message, 'Product ID is required');
});

test('rejects an invalid wishlist product route ID', async () => {
    const response = await request(app).delete('/wishlist/items/not-an-id');

    assert.equal(response.status, 400);
    assert.equal(response.body.errors[0].message, 'Invalid product ID');
});
