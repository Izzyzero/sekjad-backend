const env = require('./config/env');
const validateEnv = require('./config/validateEnv');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { startServer } = require('./lifecycle');

if (require.main === module) {
    void startServer({
        app: require('./app'),
        connect: connectDB,
        disconnect: () => mongoose.disconnect(),
        validate: () => validateEnv(),
        port: Number(env.port || 10000),
    });
}
