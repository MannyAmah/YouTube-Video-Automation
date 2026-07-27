# Google / YouTube OAuth Setup

The system uploads to YouTube with OAuth 2.0 (offline access) on behalf of
the Google account that owns the channel. One web flow, HMAC-signed state,
refresh token encrypted at rest.

## 1. Google Cloud project

1. https://console.cloud.google.com → New Project (e.g. `medexplained`).
2. **APIs & Services → Library**: enable
   - *YouTube Data API v3*
   - *YouTube Analytics API*

## 2. OAuth consent screen

1. APIs & Services → OAuth consent screen.
2. User type: **External** (a personal channel) → Create.
3. App name, support email, developer email — fill in.
4. Scopes: add
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube`
   - `https://www.googleapis.com/auth/yt-analytics.readonly`
5. **Test users**: add the Google account that owns the YouTube channel.
   In "Testing" mode only test users can authorize — that is all this
   system needs. (Publishing verification with Google is only required for
   public multi-user apps; refresh tokens for test users on a "Testing"
   app expire after 7 days — move the app to "In production" once the
   channel account is connected to get non-expiring refresh tokens. No
   Google review is required for these scopes when only your own account
   uses the app, but Google may show an "unverified app" warning you can
   click through.)

## 3. OAuth client

1. APIs & Services → Credentials → Create Credentials → OAuth client ID.
2. Application type: **Web application**.
3. Authorized redirect URIs — add EXACTLY:
   - `https://<your-api-domain>/api/oauth/google/callback` (production)
   - `http://localhost:3000/api/oauth/google/callback` (local dev)
4. Copy the Client ID and Client Secret into `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` on both Railway services (or `.env` locally).
   `PUBLIC_URL` must match the domain in the redirect URI exactly.

## 4. Connect the channel

1. Dashboard → Settings → **Connect YouTube**.
2. Sign in with the channel-owning account; grant all requested scopes.
3. The callback verifies the signed state, exchanges the code, encrypts the
   refresh token (AES-256-GCM, `APP_ENCRYPTION_KEY`), stores it, and
   verifies the channel identity via `channels.list(mine)`.
4. Settings now shows the connected channel id/title.

If Google does not return a refresh token ("Google did not return a refresh
token" error): the account previously authorized this app. Remove access at
https://myaccount.google.com/permissions and connect again (the flow always
requests `prompt=consent`, so this is rare).

## 5. Token lifecycle

- Access tokens are refreshed automatically by google-auth-library; the
  connection row records `lastRefreshedAt`.
- Rotating `APP_ENCRYPTION_KEY` invalidates stored tokens — reconnect the
  channel afterwards.
- To revoke: Settings in Google account permissions, then reconnect, or
  delete the `OAuthConnection` row.

## 6. Quotas

YouTube Data API default quota is 10,000 units/day; one video upload costs
~1,600 units. At 1–2 uploads/day plus status checks, the default quota is
ample. Request more in the Cloud Console if you scale beyond ~5/day.
