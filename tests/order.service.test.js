const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const Order = require('../src/models/Order');
const orderService = require('../src/services/order.service');

test('lists only the signed-in user orders with customer-facing statuses', async () => {
    const userId = 'customer-id';
    const orders = [
        { paymentStatus: 'paid', amount: 2500 },
        { paymentStatus: 'failed', amount: 1000 },
        { paymentStatus: 'pending', amount: 3000 },
    ];
    let listFilter;
    let countFilter;
    mock.method(Order, 'find', (filter) => {
        listFilter = filter;
        return { sort: () => ({ skip: () => ({ limit: () => ({ lean: async () => orders }) }) }) };
    });
    mock.method(Order, 'countDocuments', async (filter) => {
        countFilter = filter;
        return orders.length;
    });
    try {
        const result = await orderService.listOrders(userId);
        assert.deepEqual(listFilter, { user: userId });
        assert.deepEqual(countFilter, { user: userId });
        assert.deepEqual(result.orders.map((order) => order.status), ['successful', 'cancelled', 'pending']);
        assert.equal(result.pagination.total, 3);
    } finally {
        mock.restoreAll();
    }
});

test('rejects unsupported order status filters', async () => {
    await assert.rejects(orderService.listOrders('customer-id', { status: 'shipped' }), { statusCode: 400 });
});

test('admin listing includes all orders and returns the expected page shape', async () => {
    const orders = [{ paymentStatus: 'paid', user: { email: 'customer@example.com' } }];
    let listFilter;
    let countFilter;
    mock.method(Order, 'find', (filter) => {
        listFilter = filter;
        return { sort: () => ({ skip: () => ({ limit: () => ({ populate: () => ({ lean: async () => orders }) }) }) }) };
    });
    mock.method(Order, 'countDocuments', async (filter) => {
        countFilter = filter;
        return 1;
    });
    try {
        const result = await orderService.listAdminOrders({ page: '1', limit: '10' });
        assert.deepEqual(listFilter, {});
        assert.deepEqual(countFilter, {});
        assert.equal(result.total, 1);
        assert.equal(result.items[0].status, 'successful');
        assert.equal(result.items[0].user.email, 'customer@example.com');
    } finally {
        mock.restoreAll();
    }
});

test('admin can retrieve a single order with customer and purchased items', async () => {
    const orderId = '507f1f77bcf86cd799439011';
    const order = {
        paymentStatus: 'paid',
        user: { firstName: 'Ada', lastName: 'Doe', email: 'ada@example.com' },
        items: [{ title: 'Bag', quantity: 2, unitAmount: 1500 }],
        amount: 3000,
    };
    let requestedId;
    mock.method(Order, 'findById', (id) => {
        requestedId = id;
        return { populate: () => ({ lean: async () => order }) };
    });
    try {
        const result = await orderService.getAdminOrder(orderId);
        assert.equal(requestedId, orderId);
        assert.equal(result.user.email, 'ada@example.com');
        assert.deepEqual(result.items, order.items);
        assert.equal(result.amount, 3000);
        assert.equal(result.status, 'successful');
    } finally {
        mock.restoreAll();
    }
});

test('customer and admin order details preserve color snapshots', async () => {
    const orderId = '507f1f77bcf86cd799439011';
    const item = {
        product: '507f1f77bcf86cd799439012',
        title: 'Everyday Bag',
        variantId: '507f1f77bcf86cd799439101',
        colorName: 'Red',
        variantImageUrl: 'https://images.example/bag-red.jpg',
        quantity: 2,
        unitAmount: 125000,
    };
    const order = { paymentStatus: 'pending', items: [item], amount: 250000 };
    mock.method(Order, 'findOne', () => ({ lean: async () => order }));
    mock.method(Order, 'findById', () => ({ populate: () => ({ lean: async () => order }) }));
    try {
        const customerOrder = await orderService.getOrder('507f1f77bcf86cd799439099', orderId);
        const adminOrder = await orderService.getAdminOrder(orderId);
        assert.deepEqual(customerOrder.items, [item]);
        assert.deepEqual(adminOrder.items, [item]);
    } finally {
        mock.restoreAll();
    }
});

test('admin can confirm a pending WhatsApp order and mark it paid', async () => {
    const orderId = '507f1f77bcf86cd799439011';
    const order = {
        _id: orderId,
        paymentMethod: 'whatsapp',
        paymentStatus: 'pending',
    };
    let updatedId;
    let updatePayload;

    mock.method(Order, 'findById', (id) => {
        updatedId = id;
        return {
            exec: async () => order,
        };
    });
    mock.method(Order, 'findOneAndUpdate', async (filter, update) => {
        updatedId = filter._id;
        updatePayload = update;
        return { ...order, ...update.$set };
    });

    try {
        const result = await orderService.confirmWhatsAppPayment(orderId);
        assert.equal(updatedId, orderId);
        assert.equal(result.paymentStatus, 'paid');
        assert.equal(result.paymentMethod, 'whatsapp');
        assert.equal(updatePayload.$set.paymentStatus, 'paid');
        assert.ok(updatePayload.$set.paidAt instanceof Date);
    } finally {
        mock.restoreAll();
    }
});

test('admin order detail rejects invalid and missing IDs', async () => {
    await assert.rejects(orderService.getAdminOrder('invalid'), { statusCode: 400 });
    mock.method(Order, 'findById', () => ({ populate: () => ({ lean: async () => null }) }));
    try {
        await assert.rejects(orderService.getAdminOrder('507f1f77bcf86cd799439011'), { statusCode: 404 });
    } finally {
        mock.restoreAll();
    }
});
