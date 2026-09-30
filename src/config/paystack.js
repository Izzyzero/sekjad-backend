const env = require('./env');

const request = async (path, options = {}) => {
    if (!env.paystackSecretKey) {
        const error = new Error('Paystack secret key is not configured');
        error.statusCode = 503;
        throw error;
    }

    const response = await fetch(`https://api.paystack.co${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${env.paystackSecretKey}`,
            'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok || !result.status) {
        const error = new Error(result.message || 'Paystack request failed');
        error.statusCode = 502;
        throw error;
    }
    return result.data;
};

module.exports = {
    initialize: (payload) => request('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    verify: (reference) => request(`/transaction/verify/${encodeURIComponent(reference)}`),
};
