const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Cart = require('../src/models/Cart');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const cartService = require('../src/services/cart.service');
const whatsappOrderService = require('../src/services/whatsappOrder.service');
const { buildCheckoutItems } = require('../src/services/checkoutItems.service');

const productId = '507f1f77bcf86cd799439001';
const productWithoutVariantsId = '507f1f77bcf86cd799439002';
const redVariantId = '507f1f77bcf86cd799439101';
const blueVariantId = '507f1f77bcf86cd799439102';
const otherProductVariantId = '507f1f77bcf86cd799439103';
const goldVariantId = '507f1f77bcf86cd799439104';
const productImage = { url: 'https://images.example/product.jpg', altText: 'Bag' };
const makeProducts = () => new Map([
    [productId, {
        _id: productId, title: 'Everyday Bag', slug: 'everyday-bag', status: 'active',
        price: 1250, currency: 'NGN', image: productImage,
        variants: [
            { variantId: redVariantId, colorName: 'Red', image: { url: 'https://images.example/red.jpg' }, isAvailable: true },
            { variantId: blueVariantId, colorName: 'Blue', image: { url: 'https://images.example/blue.jpg' }, isAvailable: true },
            { variantId: goldVariantId, colorName: 'Gold', image: { url: 'https://images.example/gold.jpg' }, isAvailable: true },
        ],
    }],
    [productWithoutVariantsId, {
        _id: productWithoutVariantsId, title: 'Plain Scarf', slug: 'plain-scarf', status: 'active',
        price: 500, currency: 'NGN', image: productImage, variants: [],
    }],
]);

const mockCartStore = (t, products) => {
    const cart = {
        user: '507f1f77bcf86cd799439099',
        items: [],
        saveCount: 0,
        async save() {
            this.saveCount++;
            return this;
        },
        async populate() { return this; },
        toObject() {
            return {
                user: this.user,
                items: this.items.map((item) => ({
                    ...item,
                    product: products.get(String(item.product?._id || item.product)) || item.product,
                })),
            };
        },
    };
    t.mock.method(Cart, 'findOne', async () => cart);
    t.mock.method(Cart, 'create', async (data) => Object.assign(cart, data));
    return cart;
};

test('cart keeps two colors as separate lines and merges repeat additions by variant', async (t) => {
    const products = makeProducts();
    mockCartStore(t, products);
    t.mock.method(Product, 'findById', async (id) => products.get(String(id)) || null);

    let result = await cartService.addItem('507f1f77bcf86cd799439099', productId, redVariantId, 1);
    const redItem = result.items[0];
    result = await cartService.addItem('507f1f77bcf86cd799439099', productId, blueVariantId, 2);
    result = await cartService.addItem('507f1f77bcf86cd799439099', productId, redVariantId, 3);

    assert.equal(result.items.length, 2);
    assert.deepEqual(result.items.map(({ colorName, quantity }) => ({ colorName, quantity })), [
        { colorName: 'Red', quantity: 4 },
        { colorName: 'Blue', quantity: 2 },
    ]);
    assert.equal(result.items.find((item) => item.colorName === 'Red').cartItemId, redItem.cartItemId);
    assert.equal(result.items.find((item) => item.colorName === 'Blue').selectedImage.url, 'https://images.example/blue.jpg');
    assert.equal(result.subtotal, 7500);
});

test('main product is optional alongside variants and repeated main adds merge only with the main line', async (t) => {
    const products = makeProducts();
    mockCartStore(t, products);
    t.mock.method(Product, 'findById', async (id) => products.get(String(id)) || null);

    let result = await cartService.addItem('507f1f77bcf86cd799439099', productId, undefined, 1);
    const mainItem = result.items[0];
    assert.equal(mainItem.variantId, null);
    assert.equal(mainItem.colorName, null);
    assert.deepEqual(mainItem.selectedImage, productImage);
    assert.equal(mainItem.price, 1250);

    result = await cartService.addItem('507f1f77bcf86cd799439099', productId, blueVariantId, 2);
    const blueItem = result.items.find((item) => item.variantId === blueVariantId);
    result = await cartService.addItem('507f1f77bcf86cd799439099', productId, goldVariantId, 1);
    const goldItem = result.items.find((item) => item.variantId === goldVariantId);
    result = await cartService.addItem('507f1f77bcf86cd799439099', productId, undefined, 3);

    assert.equal(result.items.length, 3);
    assert.equal(result.items.find((item) => item.variantId === null).cartItemId, mainItem.cartItemId);
    assert.equal(result.items.find((item) => item.variantId === null).quantity, 4);
    assert.equal(result.items.find((item) => item.variantId === blueVariantId).cartItemId, blueItem.cartItemId);
    assert.equal(result.items.find((item) => item.variantId === blueVariantId).quantity, 2);
    assert.equal(result.items.find((item) => item.variantId === goldVariantId).cartItemId, goldItem.cartItemId);
    assert.equal(result.items.find((item) => item.variantId === goldVariantId).quantity, 1);
});

test('updating and removing one cart line leaves the other color untouched', async (t) => {
    const products = makeProducts();
    mockCartStore(t, products);
    t.mock.method(Product, 'findById', async (id) => products.get(String(id)) || null);
    let result = await cartService.addItem('507f1f77bcf86cd799439099', productId, redVariantId, 1);
    result = await cartService.addItem('507f1f77bcf86cd799439099', productId, blueVariantId, 2);
    const redItem = result.items.find((item) => item.colorName === 'Red');
    const blueItem = result.items.find((item) => item.colorName === 'Blue');

    result = await cartService.updateItemQuantity('507f1f77bcf86cd799439099', redItem.cartItemId, 5);
    assert.equal(result.items.find((item) => item.cartItemId === blueItem.cartItemId).quantity, 2);
    result = await cartService.removeItem('507f1f77bcf86cd799439099', redItem.cartItemId);
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].cartItemId, blueItem.cartItemId);
    assert.equal(result.items[0].quantity, 2);
});

test('cart rejects unrelated and unavailable variants but accepts a main product selection', async (t) => {
    const products = makeProducts();
    products.get(productId).variants[1].isAvailable = false;
    mockCartStore(t, products);
    t.mock.method(Product, 'findById', async (id) => products.get(String(id)) || null);
    const add = (variantId) => cartService.addItem('507f1f77bcf86cd799439099', productId, variantId, 1);

    const mainProduct = await add(undefined);
    assert.equal(mainProduct.items[0].variantId, null);
    await assert.rejects(add(otherProductVariantId), /does not belong to this product/);
    await assert.rejects(add(blueVariantId), /not available/);
});

test('products without variants remain addable and use the primary image', async (t) => {
    const products = makeProducts();
    mockCartStore(t, products);
    t.mock.method(Product, 'findById', async (id) => products.get(String(id)) || null);

    const cart = await cartService.addItem('507f1f77bcf86cd799439099', productWithoutVariantsId, undefined, 2);
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].variantId, null);
    assert.equal(cart.items[0].colorName, null);
    assert.deepEqual(cart.items[0].selectedImage, productImage);
    await assert.rejects(
        cartService.addItem('507f1f77bcf86cd799439099', productWithoutVariantsId, redVariantId, 1),
        /does not have color variants/
    );
});

test('legacy cart lines get a persisted identity without an inferred color', async (t) => {
    const products = makeProducts();
    const cartDocument = mockCartStore(t, products);
    cartDocument.items.push({ product: productId, quantity: 1 });

    const firstRead = await cartService.getCart('507f1f77bcf86cd799439099');
    const secondRead = await cartService.getCart('507f1f77bcf86cd799439099');
    assert.ok(firstRead.items[0].cartItemId);
    assert.equal(secondRead.items[0].cartItemId, firstRead.items[0].cartItemId);
    assert.equal(firstRead.items[0].variantId, null);
    assert.equal(firstRead.items[0].colorName, null);
    assert.deepEqual(firstRead.items[0].selectedImage, productImage);
    assert.equal(cartDocument.saveCount, 1);
});

test('checkout snapshots main and color selections and WhatsApp message labels each selection', async (t) => {
    const products = makeProducts();
    const checkoutCart = {
        items: [
            { product: products.get(productId), variantId: null, quantity: 3 },
            { product: products.get(productId), variantId: redVariantId, quantity: 2 },
            { product: products.get(productId), variantId: blueVariantId, quantity: 1 },
        ],
    };
    const orders = new Map();
    t.mock.method(Cart, 'findOne', () => ({ populate: async () => checkoutCart }));
    t.mock.method(Order, 'findOne', async ({ reference }) => orders.get(reference) || null);
    t.mock.method(Order, 'create', async (data) => {
        const order = { ...data, _id: new mongoose.Types.ObjectId() };
        orders.set(data.reference, order);
        return order;
    });

    const built = buildCheckoutItems(checkoutCart);
    assert.equal(built.amount, 750000);
    assert.deepEqual(built.items.map(({ variantId, colorName, imageUrl, variantImageUrl, unitAmount }) => ({
        variantId, colorName, imageUrl, variantImageUrl, unitAmount,
    })), [
        { variantId: null, colorName: null, imageUrl: productImage.url, variantImageUrl: null, unitAmount: 125000 },
        { variantId: redVariantId, colorName: 'Red', imageUrl: 'https://images.example/red.jpg', variantImageUrl: 'https://images.example/red.jpg', unitAmount: 125000 },
        { variantId: blueVariantId, colorName: 'Blue', imageUrl: 'https://images.example/blue.jpg', variantImageUrl: 'https://images.example/blue.jpg', unitAmount: 125000 },
    ]);

    const user = {
        _id: '507f1f77bcf86cd799439099', firstName: 'Test', lastName: 'Buyer', phoneNumber: '08000000000',
    };
    const result = await whatsappOrderService.create(user, 'd9428888-122b-4bc9-97a8-784fe6f5f21c');
    assert.equal(result.data.items[0].variantId, null);
    assert.equal(result.data.items[0].colorName, null);
    assert.equal(result.data.items[0].imageUrl, productImage.url);
    assert.match(result.data.message, /Selection: Main product\nQuantity: 3/);
    assert.match(result.data.message, /Color: Red\nQuantity: 2/);
    assert.match(result.data.message, /Color: Blue\nQuantity: 1/);
    assert.match(result.data.message, /https:\/\/images\.example\/product\.jpg/);
    assert.match(result.data.message, /https:\/\/images\.example\/red\.jpg/);
    assert.equal(orders.values().next().value.items[0].variantId, null);
    assert.equal(orders.values().next().value.items[0].colorName, null);
    assert.equal(orders.values().next().value.items[0].imageUrl, productImage.url);

    checkoutCart.items[0].quantity = 4;
    const changedCartResult = await whatsappOrderService.create(user, 'd9428888-122b-4bc9-97a8-784fe6f5f21c');
    assert.equal(changedCartResult.created, true);
    assert.notEqual(changedCartResult.data.reference, result.data.reference);
});

test('checkout rejects invalid or unavailable selected colors', async () => {
    const product = makeProducts().get(productId);
    assert.throws(() => buildCheckoutItems({
        items: [{ product, variantId: otherProductVariantId, quantity: 1 }],
    }), /selected color .* no longer available/);
    product.variants[0].isAvailable = false;
    assert.throws(() => buildCheckoutItems({
        items: [{ product, variantId: redVariantId, quantity: 1 }],
    }), /selected color .* no longer available/);
});
