const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { upload } = require('../src/utils/cloudinaryUpload');
const { validateUpdateProduct } = require('../src/validations/product.validation');

const app = express();
app.use(express.json());
app.patch(
    '/products/:id',
    upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'gallery', maxCount: 10 },
    ]),
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
