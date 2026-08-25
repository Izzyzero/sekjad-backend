const authService = require('../services/auth.service');
const {
    generateTokens,
    generateAccessToken,
    verifyRefreshToken,
} = require('../utils/generateToken');

const register = async (req, res, next) => {
    try {
        const user = await authService.register(req.body);
        // const tokens = generateTokens(user);
        // await authService.storeRefreshToken(tokens.refreshToken);

        // res.cookie('refreshToken', tokens.refreshToken, {
        //     httpOnly: true,
        //     secure: false,
        //     sameSite: 'lax',
        //     maxAge: 7 * 24 * 60 * 60 * 1000,
        // });

        return res.status(201).json({
            success: true,
            message: 'Account created successfully',
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

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await authService.login({ email, password });
        const tokens = generateTokens(user);
        await authService.storeRefreshToken(tokens.refreshToken);

        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

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

        if (!(await authService.isRefreshTokenStored(refreshToken))) {


            const error = new Error('Refresh token is not recognized');
            error.statusCode = 401;
            throw error;
        }

        if (authService.isRefreshTokenRevoked(refreshToken)) {
            const error = new Error('Refresh token has been revoked');
            error.statusCode = 401;
            throw error;
        }

        const payload = verifyRefreshToken(refreshToken);
        const accessToken = generateAccessToken({ _id: payload.sub, role: payload.role });
        return res.status(200).json({
            success: true,
            message: 'Access token refreshed',
            data: { accessToken },
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
        const accessToken = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
        const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;

        await authService.logout({ accessToken, refreshToken });

        if (req.cookies?.refreshToken) {
            res.clearCookie('refreshToken');
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

module.exports = { register, login, refresh, logout, me };
