const test = require('node:test');
const assert = require('node:assert/strict');
const authService = require('../src/services/auth.service');
const { generateTokens } = require('../src/utils/generateToken');

test('logout revokes refresh and access tokens', async () => {
    const user = { _id: 'user-123', role: 'user' };
    const tokens = generateTokens(user);

    await authService.storeRefreshToken(tokens.refreshToken);
    await authService.logout({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });

    assert.equal(authService.isRefreshTokenRevoked(tokens.refreshToken), true);
    assert.equal(authService.isAccessTokenRevoked(tokens.accessToken), true);
});
