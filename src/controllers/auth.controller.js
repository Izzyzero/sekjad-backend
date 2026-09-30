const authService = require('../services/auth.service');
const {
    generateTokens,
} = require('../utils/generateToken');

const refreshCookieOptions = {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

const requestMetadata = (req) => ({
    userAgent: req.get('user-agent'),
    ipAddress: req.ip,
});

const register = async (req, res, next) => {
    try {
        await authService.register(req.body);
        // const tokens = generateTokens(user);
        // await authService.storeRefreshToken(tokens.refreshToken);

        // res.cookie('refreshToken', tokens.refreshToken, {
        //     httpOnly: true,
        //     secure: false,
        //     sameSite: 'lax',
        //     maxAge: 7 * 24 * 60 * 60 * 1000,
        // });

        return res.status(202).json({
            success: true,
            message: 'Verification code sent to your email',
            // data: { user, ...tokens },
        });
    } catch (error) {
        if (error && error.code === 11000) {
            error.statusCode = 409;
            error.message = 'An account with that email or phone number already exists';
        }
        next(error);
    }
};

const verifyEmail = async (req, res, next) => {
    try {
        const user = await authService.verifyEmail(req.body);
        return res.status(201).json({ success: true, message: 'Account created successfully', data: { user } });
    } catch (error) {
        if (error && error.code === 11000) {
            error.statusCode = 409;
            error.message = 'An account with that email or phone number already exists';
        }
        next(error);
    }
};

const forgotPassword = async (req, res, next) => {
    try {
        await authService.forgotPassword(req.body);
        return res.status(200).json({
            success: true,
            message: 'If an account exists for that email, a reset code has been sent',
        });
    } catch (error) {
        next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        await authService.resetPassword(req.body);
        return res.status(200).json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await authService.login({ email, password });
        const tokens = generateTokens(user);
        await authService.storeRefreshToken(tokens.refreshToken, requestMetadata(req));

        res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            data: { user, accessToken: tokens.accessToken },
        });
    } catch (error) {
        next(error);
    }
};

const refresh = async (req, res, next) => {
    try {
        const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;
        if (!refreshToken) {
            const error = new Error('Refresh token is required');
            error.statusCode = 400;
            throw error;
        }

        const tokens = await authService.rotateRefreshToken(refreshToken, requestMetadata(req));
        res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);
        return res.status(200).json({
            success: true,
            message: 'Access token refreshed',
            data: { accessToken: tokens.accessToken },
        });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            error.statusCode = 401;
            error.message = 'Invalid or expired refresh token';
        }
        next(error);
    }
};

const logout = async (req, res, next) => {
    try {
        const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;

        await authService.logout({ refreshToken });

        if (req.cookies?.refreshToken) {
            res.clearCookie('refreshToken', refreshCookieOptions);
        }

        return res.status(200).json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        next(error);
    }
};

const me = (req, res) => res.status(200).json({
    success: true,
    message: 'Authenticated user retrieved successfully',
    data: { user: req.user.toJSON() },
});

const profileFailure = (error, next) => {
    if (error?.code === 11000) {
        error.statusCode = 409;
        error.message = 'An account with that email or phone number already exists';
    }
    next(error);
};

const updateMe = async (req, res, next) => {
    try {
        const data = await authService.updateProfile(req.user._id, req.body);
        return res.status(data.emailVerificationRequired ? 202 : 200).json({
            success: true,
            message: data.emailVerificationRequired
                ? 'Profile saved. Verify the code sent to your new email to complete the email change'
                : 'Profile updated successfully',
            data,
        });
    } catch (error) {
        profileFailure(error, next);
    }
};

const verifyProfileEmail = async (req, res, next) => {
    try {
        const user = await authService.verifyProfileEmail(req.user._id, req.body);
        return res.status(200).json({ success: true, message: 'Email updated successfully', data: { user } });
    } catch (error) {
        profileFailure(error, next);
    }
};

const changePassword = async (req, res, next) => {
    try {
        await authService.changePassword(req.user._id, req.body);
        const { maxAge, ...clearCookieOptions } = refreshCookieOptions;
        res.clearCookie('refreshToken', clearCookieOptions);
        return res.status(200).json({
            success: true,
            message: 'Password changed successfully. Please sign in again',
            data: { requiresLogin: true },
        });
    } catch (error) {
        next(error);
    }
};

const googleSignIn = async (req, res, next) => {
    try {
        const { user, isNewUser } = await authService.googleSignIn(req.body);
        const tokens = generateTokens(user);
        await authService.storeRefreshToken(tokens.refreshToken, requestMetadata(req));
        res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);
        return res.status(isNewUser ? 201 : 200).json({
            success: true,
            message: isNewUser ? 'Account created successfully' : 'Login successful',
            data: { user, accessToken: tokens.accessToken, isNewUser },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    googleSignIn,
    register, verifyEmail, forgotPassword, resetPassword, login, refresh, logout, me,
    updateMe, verifyProfileEmail, changePassword,
};
