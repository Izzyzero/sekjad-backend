const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const envObj = require('./config/env');
const app = express();
const PORT = envObj.port;
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
const categoryRoutes = require('./routes/category.routes');
const userRoutes = require('./routes/user.routes');
const uploadRoutes = require('./routes/upload.routes');
const cartRoutes = require('./routes/cart.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const errorHandler = require('./middleware/error.middleware');
const morgan = require('morgan');

// Connect to MongoDB
connectDB();                

app.use(cors({
    origin: envObj.base_url,
    credentials: true,
}));
app.use(cookieParser());
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
app.use(errorHandler);
    
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
