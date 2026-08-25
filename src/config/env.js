// placeholder file for src/config/env.js
const dotenv = require('dotenv');
dotenv.config();


const envObj={
    port: process.env.PORT,
    mongoURI: process.env.MONGO_URI,
    salt: process.env.SALT,
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
    accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    base_url: process.env.BASE_URL,
    cloud_name: process.env.CLOUD_NAME,
    cloud_api_key: process.env.CLOUD_API_KEY,
    cloud_api_secret: process.env.CLOUD_API_SECRET
}
module.exports = envObj;



