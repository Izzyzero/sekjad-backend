const test = require('node:test');
const assert = require('node:assert/strict');
const authService = require('../src/services/auth.service');
const RefreshSession = require('../src/models/RefreshSession');

test('logout revokes the matching persisted refresh session', async (t) => {
    const refreshToken = 'raw-refresh-token';
    let receivedFilter;
    let receivedUpdate;

    t.mock.method(RefreshSession, 'updateOne', async (filter, update) => {
        receivedFilter = filter;
        receivedUpdate = update;
        return { modifiedCount: 1 };
    });

    await authService.logout({ refreshToken });

    assert.equal(receivedFilter.tokenHash, authService.hashRefreshToken(refreshToken));
    assert.notEqual(receivedFilter.tokenHash, refreshToken);
    assert.equal(receivedFilter.revokedAt, null);
    assert.ok(receivedUpdate.$set.revokedAt instanceof Date);
});

test('logout without a refresh token does not query the session store', async (t) => {
    const updateOne = t.mock.method(RefreshSession, 'updateOne', async () => ({ modifiedCount: 0 }));
    await authService.logout({ refreshToken: null });
    assert.equal(updateOne.mock.callCount(), 0);
});
