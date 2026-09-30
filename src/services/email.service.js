const bcrypt = require('bcrypt');
const OTP = require('../models/OTP');
const sendEmail = require('../utils/sendEmail');
const generateOTP = require('../utils/generateOTP');
const env = require('../config/env');

const issueOTP = async ({ email, purpose, payload = null, recipient = email }) => {
    const code = generateOTP();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + env.otpExpiresMinutes * 60 * 1000);

    await OTP.findOneAndUpdate(
        { email, purpose },
        { codeHash, payload, expiresAt, attempts: 0 },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    const action = purpose === 'email_change' ? 'verify your new email'
        : purpose === 'email_verification' ? 'verify your email' : 'reset your password';
    try {
        await sendEmail({
            to: recipient,
            subject: `Your code to ${action}`,
            text: `Your code is ${code}. It expires in ${env.otpExpiresMinutes} minutes.`,
            html: `<p>Your code to ${action} is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in ${env.otpExpiresMinutes} minutes. If you did not request this, ignore this email.</p>`,
        });
    } catch (error) {
        await OTP.deleteOne({ email, purpose });
        throw error;
    }
};

const consumeOTP = async ({ email, purpose, code }) => {
    const now = new Date();
    const record = await OTP.findOne({ email, purpose }).select('+codeHash +payload');
    if (!record || record.expiresAt <= now) {
        if (record) await record.deleteOne();
        const error = new Error('Invalid or expired verification code');
        error.statusCode = 400;
        throw error;
    }

    if (record.attempts >= env.otpMaxAttempts || !(await bcrypt.compare(code, record.codeHash))) {
        const updatedRecord = await OTP.findOneAndUpdate(
            { _id: record._id, attempts: { $lt: env.otpMaxAttempts } },
            { $inc: { attempts: 1 } },
            { returnDocument: 'after' }
        );
        if (updatedRecord && updatedRecord.attempts >= env.otpMaxAttempts) {
            await OTP.deleteOne({ _id: record._id, attempts: { $gte: env.otpMaxAttempts } });
        }
        const error = new Error('Invalid or expired verification code');
        error.statusCode = 400;
        throw error;
    }

    // The delete is the atomic claim: only one concurrent request can receive the payload.
    const consumedRecord = await OTP.findOneAndDelete({
        _id: record._id,
        codeHash: record.codeHash,
        expiresAt: { $gt: now },
        attempts: { $lt: env.otpMaxAttempts },
    }).select('+payload');

    if (!consumedRecord) {
        const error = new Error('Invalid or expired verification code');
        error.statusCode = 400;
        throw error;
    }

    return consumedRecord.payload;
};

module.exports = { issueOTP, consumeOTP };
