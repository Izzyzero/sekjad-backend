// placeholder file for src/config/db.js
const mongoose = require('mongoose');
const envObj = require('./env');

const connectDB = () => mongoose.connect(envObj.mongoURI, { serverSelectionTimeoutMS: 10000 });
module.exports = connectDB;
