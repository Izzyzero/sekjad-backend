const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const productService = require('../src/services/product.service');
const User = require('../src/models/User');
const { generateAccessToken } = require('../src/utils/generateToken');

const app = express();
app.use(express.json());
app.use('/api/v1/products', require('../src/routes/product.routes'));
app.use('/api/v1/cart', require('../src/routes/cart.routes'));
app.use('/api/v1/wishlist', require('../src/routes/wishlist.routes'));
app.use('/api/v1/orders', require('../src/routes/order.routes'));
app.use('/api/v1/payments', require('../src/routes/payment.routes'));
app.use(require('../src/middleware/error.middleware'));
const productId = '507f1f77bcf86cd799439011';

test('guest previews use fixed filters and expose only card fields', async (t) => {
    const queries = [
        { page: '1', limit: '6', isFeatured: 'true', sort: 'newest' },
        { page: '1', limit: '6', sort: 'newest' },
    ];
    let receivedQuery;
    t.mock.method(productService, 'getAllProducts', async (query) => {
        receivedQuery = { ...query };
        return { products: [{ _id: productId, description: 'Private details', createdBy: 'admin', gallery: [], image: { url: 'https://example.com/card.jpg', publicId: 'private' } }], pagination: { page: 1 } };
    });
    for (const [index, name] of ['featured', 'latest'].entries()) {
        const response = await request(app).get(`/api/v1/products/preview/${name}`)
            .query({ page: '2', limit: '100', isFeatured: 'false', search: 'anything', sort: 'oldest' });
        assert.equal(response.status, 200);
        assert.deepEqual(receivedQuery, queries[index]);
        assert.equal(response.body.data[0]._id, productId);
        assert.equal(response.body.data[0].description, undefined);
        assert.equal(response.body.data[0].createdBy, undefined);
        assert.equal(response.body.data[0].gallery, undefined);
        assert.equal(response.body.data[0].image.publicId, undefined);
        assert.equal(response.body.pagination, undefined);
    }
});

test('catalog and details require login and authenticated reads still work', async (t) => {
    const user = { _id: productId, role: 'user', isActive: true };
    t.mock.method(User, 'findById', async () => user);
    const token = generateAccessToken(user);
    t.mock.method(productService, 'getAllProducts', async () => ({ products: [], pagination: { page: 1 } }));
    assert.equal((await request(app).get('/api/v1/products')).status, 401);
    assert.equal((await request(app).get(`/api/v1/products/${productId}`)).status, 401);
    assert.equal((await request(app).get('/api/v1/products').set('Authorization', `Bearer ${token}`)).status, 200);
    const read = t.mock.method(productService, 'getProductById', async (id) => ({ _id: id }));
    const response = await request(app).get(`/api/v1/products/${productId}`).set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.data._id, productId);
    assert.equal((await request(app).get('/api/v1/products/invalid').set('Authorization', `Bearer ${token}`)).status, 400);
    assert.equal(read.mock.callCount(), 1);
});

test('guests cannot use cart, wishlist, checkout or payments', async () => {
    for (const [method, path] of [
        ['get', '/cart'], ['post', '/cart/items'],
        ['patch', `/cart/items/${productId}`], ['delete', `/cart/items/${productId}`],
        ['delete', '/cart'], ['get', '/wishlist'], ['post', '/wishlist/items'],
        ['delete', `/wishlist/items/${productId}`], ['delete', '/wishlist'],
        ['post', '/orders/whatsapp'], ['get', '/orders'], ['get', `/orders/${productId}`],
        ['post', '/payments/initialize'], ['get', '/payments/verify/example'],
    ]) {
        const response = await request(app)[method](`/api/v1${path}`);
        assert.equal(response.status, 401, `${method.toUpperCase()} ${path}`);
    }
});

test('product mutations still reject guests and non-admin users', async (t) => {
    const user = { _id: productId, role: 'user', isActive: true };
    t.mock.method(User, 'findById', async () => user);
    const token = generateAccessToken(user);
    for (const [method, path] of [
        ['post', '/api/v1/products'],
        ['patch', `/api/v1/products/${productId}`],
        ['delete', `/api/v1/products/${productId}`],
    ]) {
        assert.equal((await request(app)[method](path).send({})).status, 401);
        assert.equal((await request(app)[method](path)
            .set('Authorization', `Bearer ${token}`).send({})).status, 403);
    }
});
