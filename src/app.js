const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const envObj = require('./config/env');
const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('Cache-Control', 'no-store');
    if (process.env.NODE_ENV === 'production') {
        res.set('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
});
require('./config/proxy').configureProxy(app);
const mongoose = require('mongoose');
const { createHealthHandler } = require('./health');
const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
const categoryRoutes = require('./routes/category.routes');
const userRoutes = require('./routes/user.routes');
const uploadRoutes = require('./routes/upload.routes');
const cartRoutes = require('./routes/cart.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const paymentRoutes = require('./routes/payment.routes');
const orderRoutes = require('./routes/order.routes');
const adminOrderRoutes = require('./routes/adminOrder.routes');
const errorHandler = require('./middleware/error.middleware');
const morgan = require('morgan');

app.locals.shuttingDown = false;
app.get('/health', createHealthHandler(mongoose.connection, () => app.locals.shuttingDown));
app.use((_req, res, next) => {
    if (app.locals.shuttingDown) return res.status(503).json({ success: false, message: 'Server is shutting down' });
    next();
});

app.use(cors({
    origin: envObj.base_url,
    credentials: true,
}));
app.use(cookieParser());
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }), require('./controllers/payment.controller').webhook);
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/upload', uploadRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/wishlist', wishlistRoutes);
app.use('/api/v1/admin/dashboard', dashboardRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/admin/orders', adminOrderRoutes);
app.use('/api/v1/contact', require('./routes/contact.routes'));
app.use(errorHandler);
    
module.exports = app;
