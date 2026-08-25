const jwt = require('jsonwebtoken');
const envObj = require('../config/env');

const requireSecret = (secret, name) => {
    if (!secret) {
        throw new Error(`${name} is not configured`);
    }
    return secret;
};

const tokenPayload = (user) => ({
    sub: user._id ? user._id.toString() : user.id?.toString(),
    role: user.role,
});

const generateAccessToken = (user) => jwt.sign(
    tokenPayload(user),
    requireSecret(envObj.accessTokenSecret, 'ACCESS_TOKEN_SECRET'),
    { expiresIn: envObj.accessTokenExpiresIn }
);

const generateRefreshToken = (user) => jwt.sign(
    tokenPayload(user),
    requireSecret(envObj.refreshTokenSecret, 'REFRESH_TOKEN_SECRET'),
    { expiresIn: envObj.refreshTokenExpiresIn }
);

const generateTokens = (user) => ({
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
});

const verifyAccessToken = (token) => jwt.verify(
    token,
    requireSecret(envObj.accessTokenSecret, 'ACCESS_TOKEN_SECRET')
);

const verifyRefreshToken = (token) => jwt.verify(
    token,
    requireSecret(envObj.refreshTokenSecret, 'REFRESH_TOKEN_SECRET')
);

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    generateTokens,
    verifyAccessToken,
    verifyRefreshToken,
};
