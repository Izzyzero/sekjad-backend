const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const Cart = require('../src/models/Cart');
const Order = require('../src/models/Order');
const paystack = require('../src/config/paystack');
const payment = require('../src/services/payment.service');
const env = require('../src/config/env');
test.beforeEach(() => { env.paystackEnabled = true; });

for (const change of [{ status: 'draft' }, { status: 'archived' }, { quantity: 0 }, { quantity: 1.5 }, { quantity: 1001 }]) {
    test(`checkout rejects unavailable products or invalid quantities: ${JSON.stringify(change)}`, async (t) => {
        const product = { price: 10, currency: 'NGN', status: change.status || 'active' };
        t.mock.method(Cart, 'findOne', () => ({ populate: async () => ({ items: [{ product, quantity: change.quantity ?? 1 }] }) }));
        t.mock.method(Order, 'create', () => assert.fail('Invalid checkout must not create an order'));
        await assert.rejects(payment.initialize({ _id: 'user' }), { statusCode: 400 });
    });
}

for (const status of ['failed', 'abandoned']) {
    test(`a delayed ${status} verification cannot overwrite a paid order`, async (t) => {
        const order = { _id: 'order', reference: 'ref', amount: 100, currency: 'NGN', paymentStatus: 'pending' };
        const persisted = { ...order, paymentStatus: 'paid' };
        t.mock.method(Order, 'findOne', async () => order);
        t.mock.method(paystack, 'verify', async () => ({ reference: 'ref', amount: 100, currency: 'NGN', status }));
        t.mock.method(Order, 'updateOne', async (filter, update) => {
            assert.equal(filter.paymentStatus, 'pending');
            if (filter.paymentStatus === persisted.paymentStatus) Object.assign(persisted, update.$set);
        });
        t.mock.method(Order, 'findById', async () => persisted);
        assert.equal((await payment.verify('ref', { _id: 'user' })).paymentStatus, 'paid');
    });
}

test('new Paystack payments are disabled when WhatsApp checkout is selected', async (t) => {
    env.paystackEnabled = false;
    t.mock.method(Cart, 'findOne', () => assert.fail('Disabled checkout must not read the cart'));
    t.mock.method(paystack, 'initialize', () => assert.fail('Paystack must not be called'));
    await assert.rejects(payment.initialize({ _id: 'customer-id' }), { statusCode: 503 });
});

test('WhatsApp orders cannot be verified through Paystack', async (t) => {
    t.mock.method(Order, 'findOne', async () => ({ paymentMethod: 'whatsapp' }));
    t.mock.method(paystack, 'verify', () => assert.fail('Paystack must not be called'));
    await assert.rejects(payment.verify('wa_reference', { _id: 'customer-id' }), { statusCode: 400 });
});

test('checkout uses server product prices and stores an order in minor units', async () => {
    const user = { _id: 'customer-id', email: 'customer@example.com' };
    let savedOrder;
    let paystackPayload;
    mock.method(Cart, 'findOne', () => ({
        populate: async () => ({
            items: [{ product: { _id: 'product-id', title: 'Bag', price: 12.5, currency: 'NGN', status: 'active' }, quantity: 2 }],
        }),
    }));
    mock.method(Order, 'create', async (data) => {
        savedOrder = data;
        return { ...data, id: 'order-id' };
    });
    mock.method(paystack, 'initialize', async (payload) => {
        paystackPayload = payload;
        return { authorization_url: 'https://checkout.paystack.com/test', access_code: 'test' };
    });
    try {
        const result = await payment.initialize(user);
        assert.equal(savedOrder.amount, 2500);
        assert.equal(savedOrder.items[0].unitAmount, 1250);
        assert.equal(paystackPayload.amount, 2500);
        assert.equal(paystackPayload.reference, savedOrder.reference);
        assert.equal(paystackPayload.callback_url, env.paystackCallbackUrl || new URL('/checkout/return', env.frontendOrigin).toString());
        assert.equal(result.authorizationUrl, 'https://checkout.paystack.com/test');
    } finally {
        mock.restoreAll();
    }
});

test('checkout rejects an empty cart before creating an order', async () => {
    mock.method(Cart, 'findOne', () => ({ populate: async () => ({ items: [] }) }));
    mock.method(Order, 'create', async () => assert.fail('Order must not be created'));
    try {
        await assert.rejects(payment.initialize({ _id: 'customer-id' }), { statusCode: 400, message: 'Cart is empty' });
    } finally {
        mock.restoreAll();
    }
});

test('verification never marks an order paid when Paystack amount differs', async () => {
    const user = { _id: 'customer-id' };
    const order = { _id: 'order-id', user: user._id, reference: 'ref-1', amount: 2500, currency: 'NGN' };
    mock.method(Order, 'findOne', async () => order);
    mock.method(Order, 'updateOne', async () => assert.fail('Order must not be marked paid'));
    mock.method(paystack, 'verify', async () => ({ reference: 'ref-1', amount: 2400, currency: 'NGN', status: 'success' }));
    try {
        await assert.rejects(payment.verify('ref-1', user), { statusCode: 400 });
    } finally {
        mock.restoreAll();
    }
});

test('verification returns the persisted paid status after matching Paystack confirmation', async () => {
    const user = { _id: 'customer-id' };
    const order = { _id: 'order-id', user: user._id, reference: 'ref-2', amount: 2500, currency: 'NGN', paymentStatus: 'pending' };
    mock.method(Order, 'findOne', async () => order);
    mock.method(Order, 'updateOne', async (_filter, update) => {
        Object.assign(order, update.$set);
    });
    mock.method(Order, 'findById', async () => order);
    mock.method(paystack, 'verify', async () => ({ reference: 'ref-2', amount: 2500, currency: 'NGN', status: 'success' }));
    try {
        const result = await payment.verify('ref-2', user);
        assert.equal(result.paymentStatus, 'paid');
    } finally {
        mock.restoreAll();
    }
});
