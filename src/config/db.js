// placeholder file for src/config/db.js
const mongoose = require('mongoose');
const envObj = require('./env');

const connectDB = async () => { 
    try {
        await mongoose.connect(envObj.mongoURI)
        console.log('MongoDB connected');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
        process.exit(1);
    }
};
module.exports = connectDB;