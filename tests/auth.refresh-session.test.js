const test = require('node:test');
const assert = require('node:assert/strict');
const authService = require('../src/services/auth.service');
const RefreshSession = require('../src/models/RefreshSession');
const User = require('../src/models/User');
const { generateRefreshToken, verifyRefreshToken } = require('../src/utils/generateToken');

const user = {
    _id: '507f1f77bcf86cd799439011',
    role: 'user',
    toJSON() {
        return { _id: this._id, role: this.role };
    },
};

test('refresh tokens are unique even when generated in the same second', () => {
    const first = generateRefreshToken(user);
    const second = generateRefreshToken(user);
    assert.notEqual(first, second);
    assert.notEqual(verifyRefreshToken(first).jti, verifyRefreshToken(second).jti);
});

test('rotation revokes the old session and persists only a hash of the replacement', async (t) => {
    const oldToken = generateRefreshToken(user);
    const oldSession = { _id: 'session-1', user: user._id };
    let createdSession;
    let userFilter;

    t.mock.method(RefreshSession, 'findOneAndUpdate', async () => oldSession);
    t.mock.method(RefreshSession, 'create', async (session) => {
        createdSession = session;
        return session;
    });
    t.mock.method(RefreshSession, 'updateOne', async () => ({ modifiedCount: 1 }));
    t.mock.method(User, 'findOne', async (filter) => {
        userFilter = filter;
        return user;
    });

    const tokens = await authService.rotateRefreshToken(oldToken, {
        userAgent: 'test-agent',
        ipAddress: '127.0.0.1',
    });

    assert.ok(tokens.accessToken);
    assert.ok(tokens.refreshToken);
    assert.notEqual(tokens.refreshToken, oldToken);
    assert.equal(createdSession.tokenHash, authService.hashRefreshToken(tokens.refreshToken));
    assert.notEqual(createdSession.tokenHash, tokens.refreshToken);
    assert.equal(createdSession.userAgent, 'test-agent');
    assert.deepEqual(userFilter, { _id: user._id, isActive: true });
});

test('reuse of a known revoked token revokes the user sessions', async (t) => {
    const oldToken = generateRefreshToken(user);
    let revokedUser;

    t.mock.method(RefreshSession, 'findOneAndUpdate', async () => null);
    t.mock.method(RefreshSession, 'findOne', () => ({
        lean: async () => ({ user: user._id, revokedAt: new Date() }),
    }));
    t.mock.method(RefreshSession, 'updateMany', async (filter) => {
        revokedUser = filter.user;
        return { modifiedCount: 1 };
    });

    await assert.rejects(
        authService.rotateRefreshToken(oldToken),
        (error) => error.statusCode === 401 && /already been used/.test(error.message)
    );
    assert.equal(revokedUser, user._id);
});
