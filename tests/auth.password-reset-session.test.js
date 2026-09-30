const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const RefreshSession = require('../src/models/RefreshSession');
const emailService = require('../src/services/email.service');
const authService = require('../src/services/auth.service');

test('resetting a password revokes every active session for the user', async (t) => {
    const user = {
        _id: '507f1f77bcf86cd799439011',
        password: 'old-hash',
        async save() {},
    };
    let revokeFilter;

    t.mock.method(User, 'findOne', () => ({ select: async () => user }));
    t.mock.method(emailService, 'consumeOTP', async () => null);
    t.mock.method(RefreshSession, 'updateMany', async (filter) => {
        revokeFilter = filter;
        return { modifiedCount: 2 };
    });

    await authService.resetPassword({
        email: 'user@example.com',
        code: '123456',
        password: 'new-password',
    });

    assert.deepEqual(revokeFilter, { user: user._id, revokedAt: null });
    assert.notEqual(user.password, 'old-hash');
});
