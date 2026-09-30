// Render default assumes one trusted ingress hop; override for a verified topology.
const getTrustProxy = (env = process.env) => {
    const value = env.TRUST_PROXY_HOPS ?? (env.RENDER === 'true' ? '1' : '0');
    if (!/^(0|[1-9]\d*)$/.test(value) || Number(value) > 10) {
        throw Object.assign(new Error('TRUST_PROXY_HOPS must be an integer from 0 to 10'), { code: 'INVALID_CONFIG' });
    }
    return Number(value);
};
const configureProxy = (app, env = process.env) => app.set('trust proxy', getTrustProxy(env));
module.exports = { getTrustProxy, configureProxy };
