const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { upload } = require('../src/utils/cloudinaryUpload');
const { validateProductId, validateUpdateProduct, validateCreateProduct } = require('../src/validations/product.validation');
const Product = require('../src/models/Product');

const app = express();
app.use(express.json());
app.post('/products', validateCreateProduct, (req, res) => res.json(req.body));
app.patch(
    '/products/:id',
    upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'gallery', maxCount: 10 },
    ]),
    validateProductId,
    validateUpdateProduct,
    (req, res) => res.status(200).json({ body: req.body, galleryFiles: req.files?.gallery?.length || 0 })
);

test('accepts gallery files as a product update', async () => {
    const response = await request(app)
        .patch('/products/507f1f77bcf86cd799439011')
        .attach('gallery', Buffer.from('gallery image'), {
            filename: 'gallery.png',
            contentType: 'image/png',
        });

    assert.equal(response.status, 200);
    assert.equal(response.body.galleryFiles, 1);
});

test('sanitizes gallery replacement and removal controls', async () => {
    const response = await request(app)
        .patch('/products/507f1f77bcf86cd799439011')
        .field('replaceGallery', 'true')
        .field('removeGalleryPublicIds', JSON.stringify(['sekjad_products/old-image']))
        .attach('gallery', Buffer.from('replacement image'), {
            filename: 'replacement.webp',
            contentType: 'image/webp',
        });

    assert.equal(response.status, 200);
    assert.equal(response.body.body.replaceGallery, true);
    assert.deepEqual(response.body.body.removeGalleryPublicIds, ['sekjad_products/old-image']);
});

test('rejects excessive price while ignoring legacy stock input', async () => {
    const response = await request(app)
        .patch('/products/507f1f77bcf86cd799439011')
        .send({ price: 10000000000, stock: 1000000 });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.errors, [
        { field: 'price', message: 'Price must be between 0 and 99999999.99' },
    ]);
});

test('passes an ordinary price update through the ID validator', async () => {
    const response = await request(app)
        .patch('/products/507f1f77bcf86cd799439011')
        .send({ price: 29.99 });

    assert.equal(response.status, 200);
    assert.equal(response.body.body.price, 29.99);
});

test('product creation accepts no stock and strips legacy stock input', async () => {
    const product = {
        title: 'Lace Fabric', description: 'Fabric', price: 15000,
        categories: ['507f1f77bcf86cd799439011'], image: { url: 'https://example.com/lace.jpg' },
    };
    for (const body of [product, { ...product, stock: 'not inventory' }]) {
        const response = await request(app).post('/products').send(body);
        assert.equal(response.status, 200);
        assert.equal(response.body.stock, undefined);
    }
    const document = new Product(product);
    await document.validate();
    assert.equal(document.stock, undefined);
    assert.equal(document.toJSON().inStock, true);
});

test('product updates ignore stock and existing zero stock does not mean unavailable', async () => {
    const response = await request(app).patch('/products/507f1f77bcf86cd799439011')
        .send({ title: 'Updated Fabric', stock: -100 });
    assert.equal(response.status, 200);
    assert.equal(response.body.body.stock, undefined);
    assert.equal(new Product({ stock: 0 }).inStock, true);
});
