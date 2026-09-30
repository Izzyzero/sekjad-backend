// Deterministic test configuration: never depend on a developer's credentials.
Object.assign(process.env, {
    NODE_ENV: 'test',
    SALT: '4',
    ACCESS_TOKEN_SECRET: 'test-only-access-secret-not-for-production',
    REFRESH_TOKEN_SECRET: 'test-only-refresh-secret-not-for-production',
    BASE_URL: 'http://localhost:5173',
    FRONTEND_ORIGIN: 'http://localhost:5173',
    PAYSTACK_ENABLED: 'false',
    PAYSTACK_SECRET_KEY: 'test-only',
    WHATSAPP_ORDER_NUMBER: '+2348000000000',
    DOTENV_CONFIG_QUIET: 'true',
});
