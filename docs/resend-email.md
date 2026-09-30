# Resend email setup

For initial testing without your own domain, the local sender is configured as `MAIL_FROM="Sekjad <onboarding@resend.dev>"`. Set the same value in Render if testing there. This shared sender is limited to sending to your Resend account email address; it cannot support customer verification emails generally. Keep `RESEND_API_KEY` configured. Restart after changing `.env`. Switch to your verified domain when ready to send to customers.

All verification, password-reset and email-change messages use `POST https://api.resend.com/emails` through Node's built-in fetch. No SMTP credentials or Resend SDK are required.

1. Add and verify your sending domain in Resend, using the DNS records Resend provides.
2. Create an API key with permission to send from that domain.
3. Set these variables in your local `.env` and Render environment, using your real values:

```dotenv
RESEND_API_KEY=re_your_api_key
MAIL_FROM="Sekjad <no-reply@your-verified-domain.com>"
```

4. Restart locally or redeploy on Render. Startup requires both variables. Old `GOOGLE_SMTP_*` and `APP_PASSWORD` variables are unused and can be removed. Keep `GOOGLE_CLIENT_ID` for Google sign-in.
5. Request a verification code for an address you control and inspect Resend's delivery logs. API acceptance does not guarantee inbox delivery; check delivery/bounce events there.

Requests have a 10-second timeout. Missing configuration, provider errors, rate limits and timeouts produce safe 503 responses. OTP cleanup and existing HTTP response formats are preserved. No automatic retry is made after ambiguous network failures.

Tests mock HTTP calls and do not send real email. No API key or sender domain is provisioned by this change.

Reference: [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email).
