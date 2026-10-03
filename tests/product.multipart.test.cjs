const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const cloudinary = require('../src/config/cloudinary');
const { generateAccessToken } = require('../src/utils/generateToken');

const productId = '507f1f77bcf86cd799439011';
const categoryId = '507f1f77bcf86cd799439012';
const variantId = '507f1f77bcf86cd799439013';
const admin = { _id: '507f1f77bcf86cd799439014', role: 'admin', isActive: true };
const token = generateAccessToken(admin);

const app = express();
app.use(express.json());
app.use('/api/v1/products', require('../src/routes/product.routes'));
app.use(require('../src/middleware/error.middleware'));

test('multipart product creation and editing parse fields, variants, and preserve an omitted image', async (t) => {
    let createdData;
    let uploadedFileCount = 0;
    const image = {
        url: 'https://example.com/existing-product.png',
        publicId: 'sekjad_products/existing-product',
        altText: 'Existing image',
    };
    const existingProduct = {
        _id: productId,
        title: 'Lace Fabric',
        slug: 'lace-fabric',
        image: { ...image },
        gallery: [],
        categories: [categoryId],
        variants: [{
            variantId,
            colorName: 'Blue',
            image: { url: 'https://example.com/blue.png' },
            isAvailable: true,
        }],
        async save() {},
        async populate() { return this; },
    };

    t.mock.method(User, 'findById', async () => admin);
    t.mock.method(Category, 'countDocuments', async ({ _id }) => _id.$in.length);
    t.mock.method(Product, 'create', async (data) => {
        createdData = data;
        return { ...data, _id: productId, async populate() { return this; } };
    });
    t.mock.method(Product, 'findById', async () => existingProduct);
    t.mock.method(cloudinary.uploader, 'upload_stream', (_options, callback) => ({
        end(buffer) {
            uploadedFileCount += 1;
            callback(null, {
                secure_url: `https://images.example/${buffer.toString()}`,
                public_id: `sekjad_products/${buffer.toString()}`,
            });
        },
    }));

    const created = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${token}`)
        .field('title', 'Lace Fabric')
        .field('description', 'Soft cotton lace')
        .field('price', '1250.50')
        .field('categories[]', categoryId)
        .field('tags[]', 'Summer')
        .field('tags[]', 'New')
        .field('variants', JSON.stringify([{
            colorName: 'Blue',
            image: { url: 'https://example.com/blue.png' },
            isAvailable: true,
        }]))
        .attach('image', Buffer.from('main-image'), {
            filename: 'main.png',
            contentType: 'image/png',
        })
        .attach('gallery', Buffer.from('gallery-image'), {
            filename: 'gallery.png',
            contentType: 'image/png',
        });

    assert.equal(created.status, 201);
    assert.equal(createdData.title, 'Lace Fabric');
    assert.equal(createdData.price, 1250.5);
    assert.deepEqual(createdData.categories, [categoryId]);
    assert.deepEqual(createdData.tags, ['Summer', 'New']);
    assert.equal(createdData.image.url, 'https://images.example/main-image');
    assert.equal(createdData.gallery[0].url, 'https://images.example/gallery-image');
    assert.equal(createdData.variants[0].colorName, 'Blue');
    assert.ok(createdData.variants[0].variantId);

    const updated = await request(app)
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${token}`)
        .field('title', 'Updated Lace Fabric')
        .field('categories[]', categoryId)
        .field('tags[]', 'Clearance')
        .field('variants', JSON.stringify([{
            variantId,
            colorName: 'Navy',
            image: { url: 'https://example.com/navy.png' },
            isAvailable: false,
        }]));

    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.title, 'Updated Lace Fabric');
    assert.equal(updated.body.data.image.url, image.url);
    assert.deepEqual(updated.body.data.tags, ['Clearance']);
    assert.equal(updated.body.data.variants[0].variantId, variantId);
    assert.equal(updated.body.data.variants[0].colorName, 'Navy');
    assert.equal(updated.body.data.variants[0].isAvailable, false);
    assert.equal(uploadedFileCount, 2);
});

test('multipart product creation still requires a main image file', async (t) => {
    t.mock.method(User, 'findById', async () => admin);

    const response = await request(app)
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${token}`)
        .field('title', 'Lace Fabric')
        .field('description', 'Soft cotton lace')
        .field('price', '1250.50')
        .field('categories[]', categoryId);

    assert.equal(response.status, 400);
    assert.ok(response.body.errors.some(({ field }) => field === 'image'));
});
