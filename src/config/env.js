// placeholder file for src/config/env.js
const dotenv = require('dotenv');
if (process.env.NODE_ENV !== 'test') dotenv.config();


const envObj={
    port: process.env.PORT,
    mongoURI: process.env.MONGO_URI,
    salt: process.env.SALT,
    accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
    accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    base_url: process.env.BASE_URL,
    frontendOrigin: process.env.FRONTEND_ORIGIN || process.env.BASE_URL || 'http://localhost:5173',
    cloud_name: process.env.CLOUD_NAME,
    cloud_api_key: process.env.CLOUD_API_KEY,
    cloud_api_secret: process.env.CLOUD_API_SECRET,
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY,
    paystackEnabled: process.env.PAYSTACK_ENABLED === 'true',
    whatsappOrderNumber: process.env.WHATSAPP_ORDER_NUMBER,
    paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL,
    resendApiKey: process.env.RESEND_API_KEY,
    mailFrom: process.env.MAIL_FROM,
    contactTo: process.env.CONTACT_TO,
    otpExpiresMinutes: parseInt(process.env.OTP_EXPIRES_MINUTES || '10', 10),
    otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI
}
module.exports = envObj;



