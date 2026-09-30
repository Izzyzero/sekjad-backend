# Render startup and health checks

Use `npm ci` as the build command and `npm start` as the start command. Set `NODE_ENV=production` and set the Render Health Check Path to `/health` under Settings → Health Checks. Render supplies `PORT`; the server binds to `0.0.0.0`, defaulting to port 10000 locally.

Startup validates configuration, then waits up to 10 seconds for MongoDB server selection before opening the HTTP listener. Failures exit with status 1 and log a sanitized message.

Required environment variables:
- `MONGO_URI`
- `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`: different secrets, each at least 32 characters in production
- `SALT`: integer bcrypt cost from 4 to 15
- `BASE_URL`: frontend URL, HTTPS in production; optional `FRONTEND_ORIGIN` must also be valid
- `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET`
- `RESEND_API_KEY`, `MAIL_FROM` (a sender on your verified Resend domain)
- `WHATSAPP_ORDER_NUMBER` when Paystack is disabled (the default)
- `PAYSTACK_SECRET_KEY` when `PAYSTACK_ENABLED=true`

Google sign-in is optional: set `GOOGLE_CLIENT_ID` to enable it; no OAuth client secret is needed for the current flow. Optional token durations and OTP settings are validated when supplied. Configuration validation checks presence and format, not whether external credentials are accepted. Email uses the Resend HTTPS API; SMTP ports are not needed. See [Resend setup](resend-email.md).

`GET /health` requires no authentication, disables caching, and returns `{ "status": "ok" }` with HTTP 200 only after a successful MongoDB ping. Disconnection, ping failure, a two-second timeout, or shutdown returns HTTP 503 with `{ "status": "unavailable" }`. Database details are never exposed. `/` remains a welcome endpoint.

On SIGTERM/SIGINT, readiness is disabled, the listener closes, active requests drain, and MongoDB disconnects. The process exits successfully when cleanup finishes. A 25-second deadline forces exit with status 1 if cleanup hangs. New requests reaching an existing connection while shutting down receive 503.

Validate with `node --test tests/*.test.js`. Tests use local HTTP listeners and mocked database behavior; they do not touch the configured database. After deployment, check `/health` and exercise real login, email and upload flows.

References: [Render health checks](https://render.com/docs/health-checks), [Render deployment lifecycle](https://render.com/docs/deploys).

## Proxy trust and rate limits

Proxy trust is configured before routes and rate limiters. When Render sets `RENDER=true`, the default is one trusted hop. Outside Render, the default is zero (direct connections; forwarded headers are ignored). Set `TRUST_PROXY_HOPS=1` explicitly for a verified single-hop ingress path, or override with the verified count for your infrastructure. Only integers from 0 through 10 are accepted; blanket `true` is rejected.

The one-hop default is an assumption, not a live verification of your deployment. Before launch, confirm Express's `req.ip` matches the client on requests through the real ingress, including custom domains/CDNs. Use temporary restricted diagnostics or server logs; do not leave a public diagnostic endpoint enabled. Verify clients on separate networks receive independent rate limits. Do not increase the hop count blindly: all reachable paths must have the expected trusted hops, and the ingress must sanitize forwarded headers. See [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/) and [rate-limit troubleshooting](https://github.com/express-rate-limit/express-rate-limit/wiki/Troubleshooting-Proxy-Issues).

Rate-limit storage remains per-process memory. Multiple instances require a shared store for globally consistent limits. Upload limits remain keyed by authenticated admin ID.
