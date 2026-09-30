const env = require('./env');

const sendMail = async ({ from, to, subject, text, html, replyTo }) => {
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, text, html, reply_to: replyTo }),
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        await response.body?.cancel();
        throw Object.assign(new Error('Resend rejected the email request'), { status: response.status });
    }
    const result = await response.json();
    if (typeof result.id !== 'string' || !result.id) throw new Error('Invalid Resend response');
    return result;
};

module.exports = { sendMail };
