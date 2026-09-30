const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
process.env.ACCESS_TOKEN_SECRET = 'whatsapp-test-access-secret';
const express = require('express');
const request = require('supertest');
const Cart = require('../src/models/Cart');
const Order = require('../src/models/Order');
const User = require('../src/models/User');
const paystack = require('../src/config/paystack');
const env = require('../src/config/env');
const service = require('../src/services/whatsappOrder.service');
const routes = require('../src/routes/order.routes');
const errorHandler = require('../src/middleware/error.middleware');
const { generateAccessToken } = require('../src/utils/generateToken');

function fixture(t) {
    const previous = env.whatsappOrderNumber;
    const previousOrigin = env.frontendOrigin;
    env.frontendOrigin = 'https://sekjad.com';
    env.whatsappOrderNumber = '+2348081022644';
    t.after(() => { env.whatsappOrderNumber = previous; env.frontendOrigin = previousOrigin; });
    const user = { _id: '507f1f77bcf86cd799439011', firstName: 'Ada', lastName: 'Lovelace', phoneNumber: '+2348000000000', isActive: true };
    const product = { _id: '507f1f77bcf86cd799439012', title: 'Bag & accessories / blue', price: 12.5, stock: 10, currency: 'NGN', status: 'active' };
    const state = { cart: { items: [{ product, quantity: 2 }] }, orders: [], cartReads: 0 };
    t.mock.method(Cart, 'findOne', (filter) => ({ populate: async () => {
        assert.deepEqual(filter, { user: user._id });
        state.cartReads++;
        return state.cart;
    } }));
    t.mock.method(Order, 'findOne', async (filter) => state.orders.find(order => order.reference === filter.reference && order.user === filter.user));
    t.mock.method(Order, 'create', async (payload) => {
        const order = { ...payload, _id: '507f1f77bcf86cd799439013' };
        state.orders.push(order);
        return order;
    });
    t.mock.method(paystack, 'initialize', () => assert.fail('WhatsApp checkout must not use Paystack'));
    t.mock.method(Cart, 'deleteOne', () => assert.fail('Opening WhatsApp must not clear the cart'));
    t.mock.method(User, 'findById', async () => user);
    return { user, product, state };
}

for (const status of ['draft', 'archived']) {
    test(`WhatsApp checkout rejects ${status} products before saving`, async (t) => {
        const { user, product, state } = fixture(t);
        product.status = status;
        await assert.rejects(service.create(user, randomUUID()), { statusCode: 400 });
        assert.equal(state.orders.length, 0);
    });
}

test('WhatsApp checkout snapshots server prices, keeps payment pending and encodes all cart details', async (t) => {
    const { user, state } = fixture(t);
    const result = await service.create(user, randomUUID());
    assert.equal(result.created, true);
    assert.equal(result.data.amount, 2500);
    assert.equal(result.data.items[0].unitAmount, 1250);
    assert.equal(result.data.paymentStatus, 'pending');
    assert.equal(state.orders[0].paymentMethod, 'whatsapp');
    assert.equal(state.orders[0].user, user._id);
    const link = new URL(result.data.whatsappUrl);
    assert.equal(link.origin, 'https://wa.me');
    assert.equal(link.pathname, '/2348081022644');
    assert.equal(link.searchParams.get('text'), result.data.message);
    assert.match(result.data.message, /Bag & accessories \/ blue/);
    assert.match(result.data.message, /Quantity: 2\nPrice: ₦25/);
    assert.match(result.data.message, /Ada Lovelace/);
    assert.ok(result.data.message.includes(result.data.reference));
});

test('message matches the branded format with product and image links and line totals', async (t) => {
    const { user, state, product } = fixture(t);
    Object.assign(product, { title: 'Lace Fabric', slug: 'lace-001', price: 15000, image: { url: 'https://images.example.com/lace.jpg' } });
    state.cart.items[0].quantity = 3;
    state.cart.items.push({ product: { ...product, _id: '507f1f77bcf86cd799439014', title: 'Aso Oke', slug: 'aso-014', image: { url: 'https://images.example.com/aso.jpg' } }, quantity: 2 });
    const result = await service.create(user, randomUUID());
    assert.ok(result.data.message.startsWith('🛍️ *SEKJAD ORDER REQUEST*\n'));
    assert.ok(result.data.message.includes('1️⃣ Lace Fabric\nQuantity: 3\nPrice: ₦45,000\n🔗 https://sekjad.com/product/lace-001\n🖼️ https://images.example.com/lace.jpg'));
    assert.ok(result.data.message.includes('2️⃣ Aso Oke\nQuantity: 2\nPrice: ₦30,000'));
    assert.ok(result.data.message.includes('💰 *Total: ₦75,000*\nPlease confirm my order.'));
    assert.equal(state.orders[0].items[0].productUrl, 'https://sekjad.com/product/lace-001');
    assert.equal(new URL(result.data.whatsappUrl).searchParams.get('text'), result.data.message);
});

test('missing images are omitted and fractional prices remain accurate', async (t) => {
    const { user, state } = fixture(t);
    state.cart.items[0].quantity = 1;
    const result = await service.create(user, randomUUID());
    assert.ok(result.data.message.includes('Price: ₦12.50'));
    assert.ok(!result.data.message.includes('🖼️'));
    assert.ok(!result.data.message.includes('undefined'));
});

test('older saved orders without product links still produce a message', async (t) => {
    const { user, state } = fixture(t);
    const key = randomUUID();
    await service.create(user, key);
    delete state.orders[0].items[0].productUrl;
    state.orders[0].items[0].imageUrl = 'javascript:alert(1)';
    const result = await service.create(user, key);
    assert.equal(result.created, false);
    assert.ok(!result.data.message.includes('🔗'));
    assert.ok(!result.data.message.includes('javascript:'));
});

test('retries reuse the saved snapshot even after the cart changes', async (t) => {
    const { user, state } = fixture(t);
    const key = randomUUID();
    const first = await service.create(user, key);
    state.cart = { items: [] };
    const repeat = await service.create(user, key);
    assert.equal(repeat.created, false);
    assert.deepEqual(repeat.data, first.data);
    assert.equal(state.orders.length, 1);
    assert.equal(state.cartReads, 1);
});

test('concurrent duplicate-key insert returns the same saved order', async (t) => {
    const { user, state } = fixture(t);
    t.mock.method(Order, 'create', async (payload) => {
        state.orders.push({ ...payload, _id: '507f1f77bcf86cd799439013' });
        throw Object.assign(new Error('duplicate reference'), { code: 11000 });
    });
    const result = await service.create(user, randomUUID());
    assert.equal(result.created, false);
    assert.equal(result.data.reference, state.orders[0].reference);
});

for (const [label, modify] of [
    ['empty cart', state => { state.cart.items = []; }],
    ['missing cart', state => { state.cart = null; }],
    ['deleted product', state => { state.cart.items[0].product = null; }],
    ['fractional quantity', state => { state.cart.items[0].quantity = 1.5; }],
    ['negative quantity', state => { state.cart.items[0].quantity = -1; }],
    ['invalid price', state => { state.cart.items[0].product.price = 1.001; }],
    ['unsupported currency', state => { state.cart.items[0].product.currency = 'USD'; }],
]) {
    test(`checkout rejects ${label} without saving an order`, async (t) => {
        const { user, state } = fixture(t);
        modify(state);
        await assert.rejects(service.create(user, randomUUID()), { statusCode: 400 });
        assert.equal(state.orders.length, 0);
    });
}

for (const stock of [0, 1, undefined]) {
    test(`checkout accepts active products with legacy stock ${stock}`, async (t) => {
        const { user, product } = fixture(t);
        product.stock = stock;
        product.status = 'active';
        const result = await service.create(user, randomUUID());
        assert.equal(result.created, true);
        assert.equal(result.data.paymentStatus, 'pending');
        assert.ok(!result.data.message.includes('confirm availability'));
    });
}

test('missing or invalid business number returns 503 without creating an order', async (t) => {
    const { user, state } = fixture(t);
    for (const number of [undefined, '08081022644', 'not-a-number']) {
        env.whatsappOrderNumber = number;
        await assert.rejects(service.create(user, randomUUID()), { statusCode: 503 });
    }
    assert.equal(state.orders.length, 0);
});

test('authenticated route ignores client prices, validates retry key and rejects anonymous requests', async (t) => {
    const { user, state } = fixture(t);
    const app = express();
    app.use(express.json());
    app.use('/api/v1/orders', routes);
    app.use(errorHandler);
    const path = '/api/v1/orders/whatsapp';
    const token = generateAccessToken(user);
    assert.equal((await request(app).post(path).send({})).status, 401);
    assert.equal((await request(app).post(path).set('Authorization', `Bearer ${token}`).send({})).status, 400);
    const key = randomUUID();
    const response = await request(app).post(path).set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key).send({ user: 'another-user', amount: 1, paymentStatus: 'paid' });
    assert.equal(response.status, 201);
    assert.equal(response.body.data.amount, 2500);
    assert.equal(response.body.data.paymentStatus, 'pending');
    assert.equal(state.orders[0].user, user._id);
    const retry = await request(app).post(path).set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key).send({});
    assert.equal(retry.status, 200);
    assert.equal(state.orders.length, 1);
});
