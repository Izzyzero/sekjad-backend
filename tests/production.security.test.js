const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const authService = require('../src/services/auth.service');
const Product = require('../src/models/Product');
const Cart = require('../src/models/Cart');
const cartService = require('../src/services/cart.service');

test('production login issues a Secure, HttpOnly refresh cookie', async (t) => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const controllerPath = require.resolve('../src/controllers/auth.controller');
    delete require.cache[controllerPath];
    const controller = require(controllerPath);
    t.after(() => { process.env.NODE_ENV = previous; delete require.cache[controllerPath]; });
    t.mock.method(authService, 'login', async () => ({ _id: '507f1f77bcf86cd799439011', role: 'user' }));
    t.mock.method(authService, 'storeRefreshToken', async () => {});
    const app = express().use(express.json()).post('/login', controller.login);
    const response = await request(app).post('/login').send({ email: 'test@example.com', password: 'unused' });
    assert.equal(response.status, 200);
    assert.match(response.headers['set-cookie'][0], /; Secure/);
    assert.match(response.headers['set-cookie'][0], /; HttpOnly/);
    assert.match(response.headers['set-cookie'][0], /; SameSite=Lax/);
    assert.equal(response.body.data.refreshToken, undefined);
});

for (const status of ['draft', 'archived']) {
    test(`cart refuses ${status} products before modifying the cart`, async (t) => {
        t.mock.method(Product, 'findById', async () => ({ status }));
        t.mock.method(Cart, 'findOne', () => assert.fail('Cart must not be modified'));
        await assert.rejects(cartService.addItem('user', '507f1f77bcf86cd799439011', 1), { statusCode: 404 });
        await assert.rejects(cartService.updateItemQuantity('user', '507f1f77bcf86cd799439011', 1), { statusCode: 404 });
    });
}
