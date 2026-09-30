# Continue with Google

Both registration and login screens use `POST /api/v1/auth/google` with JSON:

```json
{ "credential": "GOOGLE_ID_TOKEN_FROM_GIS_CALLBACK" }
```

The backend verifies the signature, audience, issuer, expiry and verified email using Google's library. It returns `201` for a new account or `200` for a returning account:

```json
{ "success": true, "message": "Login successful", "data": {
  "user": { "_id": "...", "email": "...", "role": "user" },
  "accessToken": "...", "isNewUser": false
} }
```

The refresh token is set in the existing HTTP-only cookie. Use the existing refresh, logout and `/me` endpoints. Send requests with `credentials: 'include'`.

## Deployment setup

1. Create a **Web application** OAuth client in Google Cloud and configure its authorized JavaScript origins for the frontend (including the exact local development origin). Configure the consent screen and test users if the app is in testing.
2. Set `GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com` in the backend environment. Use that same public client ID in the frontend. This popup credential flow does not need a client secret or redirect URI.
3. Before starting the updated server against an existing database, run `node scripts/migrate-google-auth.js`. Run during a maintenance window with registration/profile writes stopped: it replaces the old unique phone index with a partial unique index and creates the unique Google ID index. No user records are deleted. Do not use broad `syncIndexes()` for this migration.
4. Restart the backend. Ensure the frontend origin is allowed by the existing `BASE_URL` CORS setting. The existing refresh-cookie configuration must be configured appropriately for your production HTTPS/site topology.

## Frontend (use on both screens)

Load `https://accounts.google.com/gsi/client`, then render Google's button:

```html
<div id="google-button"></div>
<p id="google-error" role="alert"></p>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script>
window.addEventListener('load', () => {
  google.accounts.id.initialize({
    client_id: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
    callback: async ({ credential }) => {
      try {
        const response = await fetch('http://localhost:3000/api/v1/auth/google', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        // Pass result.data.user and result.data.accessToken to your existing
        // auth state, then navigate to the signed-in page.
      } catch (error) {
        document.getElementById('google-error').textContent = error.message;
      }
    },
  });
  google.accounts.id.renderButton(document.getElementById('google-button'), {
    type: 'standard', text: 'continue_with', theme: 'outline', size: 'large',
  });
});
</script>
```

Replace the API origin with your backend's address. Send the GIS **ID token**, not an OAuth access token. This endpoint accepts JSON from the callback; it is not a Google HTML form-post redirect endpoint.

New Google accounts have no password or phone number. Phone/name details can be filled through the existing profile endpoint. To enable password login (or password-protected email changes), use the existing forgot/reset-password email OTP flow first.

Returning users are identified by Google's stable `sub`, even if their email changes. Existing local accounts are linked automatically only for verified Gmail or Google Workspace addresses where Google is authoritative. Other matching email accounts return `409` and must use their existing login method; an explicit linking flow is not included. Disabled accounts return `401`. Invalid credentials return `401`, malformed requests `400`, and missing server configuration `503`.

References: [Google server verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).
