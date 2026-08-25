const test = require('node:test');
const assert = require('node:assert/strict');
const authController = require('../src/controllers/auth.controller');

test('me returns the authenticated user', () => {
    const authenticatedUser = {
        _id: 'user-123',
        email: 'user@example.com',
        role: 'user',
    };
    const req = {
        user: {
            toJSON: () => authenticatedUser,
        },
    };
    const res = {
        statusCode: null,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };

    authController.me(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
        success: true,
        message: 'Authenticated user retrieved successfully',
        data: { user: authenticatedUser },
    });
});
