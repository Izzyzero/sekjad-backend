# Profile API

The backend mounts authentication at `/api/v1/auth`. Use the backend origin followed by the exact paths below (not `/api/auth`). All requests require `Authorization: Bearer <accessToken>`; a refresh cookie alone does not authenticate these endpoints. Send JSON with `Content-Type: application/json` for writes. Use `credentials: 'include'` with fetch (or `withCredentials: true` with Axios) so the password-change response can clear the refresh cookie. The frontend origin must match the existing server CORS configuration.

## Load personal information

`GET /api/v1/auth/me`

No request body. Example `200` response (timestamps and other existing user fields may also be present):

```json
{
  "success": true,
  "message": "Authenticated user retrieved successfully",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "firstName": "Ada",
      "lastName": "Lovelace",
      "email": "ada@example.com",
      "phoneNumber": "+233541234567",
      "role": "user",
      "isActive": true,
      "lastLoginAt": null
    }
  }
}
```

The model's existing JSON serializer excludes passwords. Populate the frontend `phone` field from `user.phoneNumber`.

## Save personal information

`PATCH /api/v1/auth/me`

Send any subset of the four personal information fields. Omitted fields remain unchanged; empty strings and null values are invalid. Unknown fields are ignored and cannot change roles, permissions, account IDs, active status, or passwords. A body containing no personal information fields returns `400`.

```json
{
  "firstName": "Grace",
  "lastName": "Hopper",
  "email": "ada@example.com",
  "phone": "+233551234567"
}
```

`phoneNumber` is also accepted for existing clients. If both phone names are supplied, their values must match. Phone numbers follow the existing format: optional `+`, then 8–15 digits, starting with 1–9. Names are trimmed, nonempty, and at most 50 characters. Emails use the existing registration normalization. Email and phone uniqueness are enforced with conflict responses, including database uniqueness races.

When the email is unchanged, example `200` response:

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "firstName": "Grace",
      "lastName": "Hopper",
      "email": "ada@example.com",
      "phoneNumber": "+233551234567",
      "role": "user",
      "isActive": true,
      "lastLoginAt": null
    },
    "emailVerificationRequired": false
  }
}
```

## Change and verify an email address

If the normalized email differs from the account email, include `currentPassword` in the same PATCH. It is checked as a credential and is never saved as profile data. No password is needed for ordinary name/phone updates or an unchanged email.

```json
{
  "email": "grace@example.com",
  "currentPassword": "current-password"
}
```

Example `202` response:

```json
{
  "success": true,
  "message": "Profile saved. Verify the code sent to your new email to complete the email change",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "firstName": "Grace",
      "lastName": "Hopper",
      "email": "ada@example.com",
      "phoneNumber": "+233551234567",
      "role": "user",
      "isActive": true,
      "lastLoginAt": null
    },
    "emailVerificationRequired": true,
    "pendingEmail": "grace@example.com"
  }
}
```

Any included names/phone are saved, but the old email remains active for login and recovery. Show a code-entry step for `pendingEmail`; do not show the email as changed yet. Codes reuse the existing hashed, expiring, attempt-limited, single-use OTP flow with a separate `email_change` purpose. They are bound to the authenticated account and proposed address. Resend settings and `OTP_EXPIRES_MINUTES` / `OTP_MAX_ATTEMPTS` use the existing environment configuration.

Complete the change with `POST /api/v1/auth/me/verify-email` (also authenticated):

```json
{
  "email": "grace@example.com",
  "code": "123456"
}
```

Example `200` response:

```json
{
  "success": true,
  "message": "Email updated successfully",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "firstName": "Grace",
      "lastName": "Hopper",
      "email": "grace@example.com",
      "phoneNumber": "+233551234567",
      "role": "user",
      "isActive": true,
      "lastLoginAt": null
    }
  }
}
```

Replace the frontend's cached user with `data.user` and clear the pending-email UI. Subsequent password logins use the new email; existing sessions continue. Resend by repeating the PATCH with the proposed email and current password. A new request replaces the previous code/target for that account. Reloading `/me` returns the active email, not a pending one. Do not use the public registration `/verify-email` endpoint for this flow.

## Change password

`POST /api/v1/auth/change-password`

```json
{
  "currentPassword": "current-password",
  "newPassword": "new-password-123",
  "confirmPassword": "new-password-123"
}
```

Passwords must be strings. The current password must match; the new password must have at least 8 characters and match its confirmation. Password whitespace is preserved. The existing bcrypt hashing helper and SALT configuration are reused.

`200` response:

```json
{
  "success": true,
  "message": "Password changed successfully. Please sign in again",
  "data": { "requiresLogin": true }
}
```

Every active refresh session for this user is revoked, matching the existing password-reset policy, and the refresh cookie is cleared. On success, clear the frontend access token, cached user, and password inputs, then redirect to sign-in. Do not attempt automatic token refresh. Other devices must also sign in when their access tokens expire.

The current architecture does not revoke already-issued access JWTs immediately. They remain valid until their configured expiration (`ACCESS_TOKEN_EXPIRES_IN`, default `15m`). The response asks for sign-in immediately as a frontend action; it does not imply immediate access-token invalidation.

## Errors and limits

Validation failures return `400` with field-level messages and never include submitted password values:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "confirmPassword", "message": "Passwords do not match" }
  ]
}
```

Service failures follow the existing envelope:

```json
{
  "success": false,
  "message": "An account with that email already exists"
}
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid inputs, missing/incorrect current password, or invalid/expired verification code |
| 401 | Missing/invalid/expired bearer token or unavailable account |
| 409 | Duplicate email/phone or a concurrent account/password change |
| 429 | Rate limit reached; respect the `Retry-After` header |
| 503 | Mail service is not configured, unreachable, or unable to deliver the verification email |

PATCH profile and password change each allow 10 attempts per 15 minutes per client IP using separate limiters. Email confirmation uses the existing shared verification limiter (10 attempts per 15 minutes). Limiters use the project's existing in-memory store and deployment proxy configuration. Request bodies and passwords are not logged by these handlers; the existing Morgan configuration logs request metadata only.

## Frontend save-handler integration

`src/pages/Account/Profile/Profile.jsx` is not in this backend workspace. Wire its placeholder handlers in the frontend repository:

1. Load `/api/v1/auth/me` and map `data.user.phoneNumber` to the form's `phone` field.
2. Personal-information save calls PATCH with the four form fields. Prompt for current password only if changing email. Refresh local user state from `data.user` on either `200` or `202`.
3. If `emailVerificationRequired` is true, show the verification step and call `/me/verify-email` with `pendingEmail` and the six-digit code. Keep pending email separate from the active user email.
4. Password save calls `/change-password` with its three password fields. On success, clear authentication state and redirect to sign-in.
5. Show `errors[].message` beside matching fields and use `message` for other failures. An incorrect current password returns `400`, so it should not trigger a global unauthenticated redirect.

Example shared request helper (use the existing frontend token/state utilities):

```js
async function profileRequest(path, method, body, accessToken) {
  const response = await fetch(`${API_ORIGIN}/api/v1/auth${path}`, {
    method,
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(result.message), {
      status: response.status,
      errors: result.errors,
    });
  }
  return result.data;
}
```

No image upload or saved-address functionality is added.

## Email delivery troubleshooting

Email uses Resend over HTTPS with a 10-second timeout. Set `RESEND_API_KEY` and `MAIL_FROM`; see [Resend setup](resend-email.md). Failures return a safe 503; logs contain only provider name and HTTP status. The account email remains unchanged on delivery failure.

## Verification

Run `node --test`. Tests exercise the mounted auth routes with real validators, bearer-token verification, bcrypt, model serialization, and rate limiters; database and Resend API operations are mocked. Live MongoDB/Resend integration is not exercised by this suite.
