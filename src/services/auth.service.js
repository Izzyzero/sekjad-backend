const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../models/User');
const RefreshSession = require('../models/RefreshSession');
const emailService = require('./email.service');
const google = require('../config/google');
const { normalizeEmail } = require('validator');
const { generateTokens, verifyRefreshToken } = require('../utils/generateToken');

const SALT_ROUNDS = parseInt(process.env.SALT);

const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);
const hashRefreshToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const register = async ({ phoneNumber, email, firstName, lastName, password }) => {
    const existingUser = await User.findOne({ $or: [{ email }, { phoneNumber }] }).lean();
    if (existingUser) {
        const field = existingUser.email === email ? 'email' : 'phoneNumber';
        const error = new Error(`An account with that ${field === 'email' ? 'email' : 'phone number'} already exists`);
        error.statusCode = 409;
        throw error;
    }

    const pendingUser = {
        phoneNumber,
        email,
        firstName,
        lastName,
        password: await hashPassword(password),
    };

    await emailService.issueOTP({ email, purpose: 'email_verification', payload: pendingUser });
};

const verifyEmail = async ({ email, code }) => {
    const pendingUser = await emailService.consumeOTP({ email, purpose: 'email_verification', code });
    if (!pendingUser || pendingUser.email !== email) {
        const error = new Error('Invalid or expired verification code');
        error.statusCode = 400;
        throw error;
    }

    const existingUser = await User.findOne({
        $or: [{ email: pendingUser.email }, { phoneNumber: pendingUser.phoneNumber }],
    }).lean();
    if (existingUser) {
        const error = new Error('An account with that email or phone number already exists');
        error.statusCode = 409;
        throw error;
    }

    const user = await User.create(pendingUser);
    return user.toJSON();
};

const forgotPassword = async ({ email }) => {
    const user = await User.findOne({ email }).lean();
    if (user) await emailService.issueOTP({ email, purpose: 'password_reset' });
};

const resetPassword = async ({ email, code, password }) => {
    const user = await User.findOne({ email }).select('+password +googleId');
    if (!user) {
        const error = new Error('Invalid or expired verification code');
        error.statusCode = 400;
        throw error;
    }

    await emailService.consumeOTP({ email, purpose: 'password_reset', code });
    user.password = await hashPassword(password);
    await user.save();
    await RefreshSession.updateMany(
        { user: user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } }
    );
};
const login = async ({ email, password }) => {
    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.password || !user.isActive) {
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

const storeRefreshToken = async (refreshToken, metadata = {}) => {
    const payload = verifyRefreshToken(refreshToken);
    return RefreshSession.create({
        user: payload.sub,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(payload.exp * 1000),
        userAgent: metadata.userAgent || null,
        ipAddress: metadata.ipAddress || null,
    });
};

const rotateRefreshToken = async (refreshToken, metadata = {}) => {
    const payload = verifyRefreshToken(refreshToken);
    const oldTokenHash = hashRefreshToken(refreshToken);
    const now = new Date();
    const oldSession = await RefreshSession.findOneAndUpdate(
        { tokenHash: oldTokenHash, revokedAt: null, expiresAt: { $gt: now } },
        { $set: { revokedAt: now, lastUsedAt: now } },
        { returnDocument: 'before' }
    );

    if (!oldSession) {
        const reusedSession = await RefreshSession.findOne({ tokenHash: oldTokenHash }).lean();
        if (reusedSession) {
            await RefreshSession.updateMany(
                { user: reusedSession.user, revokedAt: null },
                { $set: { revokedAt: now } }
            );
        }
        const error = new Error('Refresh token is not recognized or has already been used');
        error.statusCode = 401;
        throw error;
    }

    const user = await User.findOne({ _id: payload.sub, isActive: true });
    if (!user) {
        const error = new Error('User account is unavailable');
        error.statusCode = 401;
        throw error;
    }

    const tokens = generateTokens(user);
    const newTokenHash = hashRefreshToken(tokens.refreshToken);
    await storeRefreshToken(tokens.refreshToken, metadata);
    await RefreshSession.updateOne(
        { _id: oldSession._id },
        { $set: { replacedByTokenHash: newTokenHash } }
    );
    return { user: user.toJSON(), ...tokens };
};

const logout = async ({ refreshToken }) => {
    if (!refreshToken) return;
    await RefreshSession.updateOne(
        { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
        { $set: { revokedAt: new Date() } }
    );
};

const profileError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const googleSignIn = async ({ credential }) => {
    const identity = await google.verifyGoogleCredential(credential);
    const email = normalizeEmail(identity.email) || identity.email.toLowerCase();
    let user = await User.findOne({ googleId: identity.sub }).select('+googleId');
    let isNewUser = false;
    if (!user) {
        user = await User.findOne({ email }).select('+googleId');
        if (user) {
            if (!user.isActive) throw profileError(401, 'User account is unavailable');
            // Email linking requires Google to be authoritative for the address.
            if ((user.googleId && user.googleId !== identity.sub)
                || (!identity.email.toLowerCase().endsWith('@gmail.com') && !identity.hd)) {
                throw profileError(409, 'An account with this email already exists. Sign in using your existing method');
            }
            user = await User.findOneAndUpdate(
                { _id: user._id, isActive: true, $or: [{ googleId: { $exists: false } }, { googleId: identity.sub }] },
                { $set: { googleId: identity.sub, lastLoginAt: new Date() } },
                { returnDocument: 'after', runValidators: true }
            );
            if (!user) throw profileError(409, 'Account changed. Please sign in again');
        } else {
            try {
                user = await User.create({
                    googleId: identity.sub, email,
                    firstName: (identity.given_name || '').trim().slice(0, 50),
                    lastName: (identity.family_name || '').trim().slice(0, 50),
                    lastLoginAt: new Date(),
                });
                isNewUser = true;
            } catch (error) {
                if (error.code !== 11000) throw error;
                throw profileError(409, 'Account already exists. Please try signing in again');
            }
        }
    }
    if (!user.isActive) throw profileError(401, 'User account is unavailable');
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });
    return { user: user.toJSON(), isNewUser };
};

const requireCurrentPassword = async (user, currentPassword) => {
    if (typeof currentPassword !== 'string' || !currentPassword) {
        throw profileError(400, 'Current password is required');
    }
    if (!user.password || !(await bcrypt.compare(currentPassword, user.password))) {
        throw profileError(400, 'Current password is incorrect');
    }
};

const findProfileUser = async (userId) => {
    const user = await User.findOne({ _id: userId, isActive: true }).select('+password');
    if (!user) throw profileError(401, 'User account is unavailable');
    return user;
};

const checkProfileUniqueness = async (userId, fields) => {
    const alternatives = ['email', 'phoneNumber'].filter((field) => fields[field] !== undefined)
        .map((field) => ({ [field]: fields[field] }));
    if (!alternatives.length) return;
    const existing = await User.findOne({ _id: { $ne: userId }, $or: alternatives }).lean();
    if (existing) {
        const field = existing.email === fields.email ? 'email' : 'phone number';
        throw profileError(409, `An account with that ${field} already exists`);
    }
};

const updateProfile = async (userId, input) => {
    const user = await findProfileUser(userId);
    // Explicit allowlist also protects callers that bypass the HTTP validator.
    const fields = {};
    for (const field of ['firstName', 'lastName']) {
        if (input[field] !== undefined) fields[field] = input[field];
    }
    if (input.phone !== undefined || input.phoneNumber !== undefined) {
        fields.phoneNumber = input.phone ?? input.phoneNumber;
    }
    const emailChanged = input.email !== undefined && input.email !== user.email;
    if (emailChanged) await requireCurrentPassword(user, input.currentPassword);
    await checkProfileUniqueness(userId, { ...fields, ...(emailChanged ? { email: input.email } : {}) });

    if (emailChanged) {
        // Key by the current email: each account has only one pending email change.
        // Delivery goes to the proposed address; the account email stays unchanged.
        await emailService.issueOTP({
            email: user.email,
            recipient: input.email,
            purpose: 'email_change',
            payload: { userId: String(user._id), email: input.email },
        });
    }

    const updated = Object.keys(fields).length ? await User.findOneAndUpdate(
        { _id: userId, isActive: true },
        { $set: fields },
        { returnDocument: 'after', runValidators: true }
    ) : user;
    if (!updated) throw profileError(401, 'User account is unavailable');
    return {
        user: updated.toJSON(),
        emailVerificationRequired: emailChanged,
        ...(emailChanged ? { pendingEmail: input.email } : {}),
    };
};

const verifyProfileEmail = async (userId, { email, code }) => {
    const user = await findProfileUser(userId);
    await checkProfileUniqueness(userId, { email });
    const pending = await emailService.consumeOTP({ email: user.email, purpose: 'email_change', code });
    if (!pending || pending.userId !== String(user._id) || pending.email !== email) {
        throw profileError(400, 'Invalid or expired verification code');
    }
    const updated = await User.findOneAndUpdate(
        { _id: userId, email: user.email, isActive: true },
        { $set: { email } },
        { returnDocument: 'after', runValidators: true }
    );
    if (!updated) throw profileError(409, 'Account changed. Please request a new verification code');
    return updated.toJSON();
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
    const user = await findProfileUser(userId);
    await requireCurrentPassword(user, currentPassword);
    const password = await hashPassword(newPassword);
    // Compare-and-set prevents concurrent changes from overwriting a newer password.
    const result = await User.updateOne(
        { _id: userId, password: user.password, isActive: true },
        { $set: { password } },
        { runValidators: true }
    );
    if (!result.matchedCount) throw profileError(409, 'Password changed. Please sign in again');
    // Match resetPassword: revoke all refresh sessions; access JWTs expire normally.
    await RefreshSession.updateMany(
        { user: user._id, revokedAt: null },
        { $set: { revokedAt: new Date() } }
    );
};

module.exports = {
    googleSignIn,
    updateProfile,
    verifyProfileEmail,
    changePassword,
    register,
    verifyEmail,
    forgotPassword,
    resetPassword,
    login,
    hashPassword,
    hashRefreshToken,
    storeRefreshToken,
    rotateRefreshToken,
    logout,
};
