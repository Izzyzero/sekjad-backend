
const { OAuth2Client } = require('google-auth-library');
const envObj = require('./env');
const googleClient = new OAuth2Client();
const failure = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const verifyGoogleCredential = async (credential) => {
    if (!envObj.googleClientId) throw failure(503, 'Google sign-in is not configured');
    let payload;
    try {
        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: envObj.googleClientId });
        payload = ticket.getPayload();
    } catch {
        throw failure(401, 'Invalid or expired Google credential');
    }
    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        throw failure(401, 'A verified Google email is required');
    }
    return payload;
};
module.exports = { googleClient, verifyGoogleCredential };
