const bcrypt = require('bcrypt');
const User = require('../models/User');

const SALT_ROUNDS = parseInt(process.env.SALT);

const revokedAccessTokens = new Set();
const refreshTokens = new Set();
const revokedRefreshTokens = new Set();

const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);

const register = async ({ phoneNumber, email, firstName, lastName, password }) => {
    const existingUser = await User.findOne({ $or: [{ email }, { phoneNumber }] }).lean();
    if (existingUser) {
        const field = existingUser.email === email ? 'email' : 'phoneNumber';
        const error = new Error(`An account with that ${field === 'email' ? 'email' : 'phone number'} already exists`);
        error.statusCode = 409;
        throw error;
    }

    const user = await User.create({
        phoneNumber,
        email,
        firstName,
        lastName,
        password: await hashPassword(password),
    });

    return user.toJSON();
};
const login = async ({ email, password }) => {
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
        const error = new Error('Invalid email or password');
        error.statusCode = 401;
        throw error;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        const error = new Error('Invalid email or password');
        error.statusCode = 401;
        throw error;
    }

    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    return user.toJSON();
};

const storeRefreshToken = async (refreshToken) => {
    refreshTokens.add(refreshToken);
};

const logout = async ({ accessToken, refreshToken }) => {
    if (accessToken) {
        revokedAccessTokens.add(accessToken);
    }

    if (refreshToken) {
        revokedRefreshTokens.add(refreshToken);
        refreshTokens.delete(refreshToken);
    }
};

const isAccessTokenRevoked = (token) => revokedAccessTokens.has(token);
const isRefreshTokenRevoked = (token) => revokedRefreshTokens.has(token);
const isRefreshTokenStored = (token) => refreshTokens.has(token);

module.exports = {
    register,
    login,
    hashPassword,
    storeRefreshToken,
    logout,
    isAccessTokenRevoked,
    isRefreshTokenRevoked,
    isRefreshTokenStored,
};
