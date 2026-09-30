const test = require('node:test');
const assert = require('node:assert/strict');
process.env.ACCESS_TOKEN_SECRET = 'upload-test-secret';
const express = require('express');
const request = require('supertest');
const { EventEmitter } = require('node:events');
const User = require('../src/models/User');
const cloudinary = require('../src/config/cloudinary');
const { generateAccessToken } = require('../src/utils/generateToken');
const { protectUpload } = require('../src/middleware/uploadLimits.middleware');
const app = express();
app.use(express.json());
app.use('/upload', require('../src/routes/upload.routes'));
app.use('/products', require('../src/routes/product.routes'));
app.use(require('../src/middleware/error.middleware'));
const productId = '507f1f77bcf86cd799439011';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
function signIn(t, role = 'admin') {
    const user = new User({ role, email: 'admin@example.com' });
    t.mock.method(User, 'findById', async () => user);
    return generateAccessToken(user);
}

test('anonymous users and customers cannot reach any upload handler', async (t) => {
    const token = signIn(t, 'user');
    const upload = t.mock.method(cloudinary.uploader, 'upload_stream', () => { throw new Error('must not upload'); });
    for (const [method, path] of [['post', '/upload/image'], ['post', '/upload/product'], ['patch', `/products/${productId}`]]) {
        assert.equal((await request(app)[method](path).send({})).status, 401);
        // Invalid multipart data would fail parsing if the admin gate ran too late.
        const res = await request(app)[method](path).set('Authorization', `Bearer ${token}`)
            .set('Content-Type', 'multipart/form-data').send('invalid multipart');
        assert.equal(res.status, 403);
    }
    assert.equal(upload.mock.callCount(), 0);
});

test('admin image uploads work and restrict Cloudinary to image formats', async (t) => {
    const token = signIn(t);
    t.mock.method(cloudinary.uploader, 'upload_stream', (options, callback) => {
        assert.equal(options.resource_type, 'image');
        assert.deepEqual(options.allowed_formats, ['jpg', 'jpeg', 'png', 'gif', 'webp']);
        return { end: (buffer) => {
            assert.deepEqual(buffer, png);
            callback(null, { secure_url: 'https://example.com/image.png', public_id: 'image', format: 'png' });
        } };
    });
    const res = await request(app).post('/upload/image').set('Authorization', `Bearer ${token}`)
        .attach('image', png, 'image.png');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.format, 'png');
});

test('file size and type errors are handled before Cloudinary', async (t) => {
    const token = signIn(t);
    const upload = t.mock.method(cloudinary.uploader, 'upload_stream', () => { throw new Error('must not upload'); });
    const badType = await request(app).post('/upload/image').set('Authorization', `Bearer ${token}`)
        .attach('image', Buffer.from('text'), 'file.txt');
    assert.equal(badType.status, 400);
    const oversized = await request(app).post('/upload/image').set('Authorization', `Bearer ${token}`)
        .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png');
    assert.equal(oversized.status, 413);
    assert.equal(upload.mock.callCount(), 0);
});

test('upload quota is shared across upload and product-update routes', async (t) => {
    const token = signIn(t);
    for (let i = 0; i < 10; i += 1) {
        const res = await request(app).post('/upload/image').set('Authorization', `Bearer ${token}`)
            .field('unused', 'value');
        assert.equal(res.status, 400);
    }
    for (const [method, path] of [['post', '/upload/product'], ['patch', `/products/${productId}`]]) {
        const res = await request(app)[method](path).set('Authorization', `Bearer ${token}`).field('unused', 'value');
        assert.equal(res.status, 429);
    }
});

test('concurrency slots are released on completion or disconnect', async () => {
    const req = { user: { _id: 'concurrency-test' }, is: () => true, app: app };
    const response = () => Object.assign(new EventEmitter(), {
        setHeader() {}, set() {}, status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    });
    let accepted = 0;
    const first = response();
    const second = response();
    const third = response();
    await protectUpload(req, first, () => { accepted += 1; });
    await protectUpload(req, second, () => { accepted += 1; });
    await protectUpload(req, third, () => { accepted += 1; });
    assert.equal(accepted, 2);
    assert.equal(third.statusCode, 503);
    first.emit('finish');
    first.emit('close');
    await protectUpload(req, third, () => { accepted += 1; });
    assert.equal(accepted, 3);
    second.emit('close');
    third.emit('finish');
});
