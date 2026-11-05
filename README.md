# DigiPay wallet API

JavaScript, Express and Mongoose. Use Node 24 LTS or newer and a MongoDB replica set (Atlas works). Account creation and wallet operations use multi-document transactions.

1. Copy `.env.example` to `.env`. Set a strong random `JWT_SECRET`, the database URI in `MONGODB_URI` (include `/digipay_wallet` before the query string), and browser origins.
2. Run `npm ci` and `npm run dev`. The API listens on port 5000 by default.
3. For Google sign-in, use a **Web application** OAuth client. Set `GOOGLE_CLIENT_ID` to the same public ID as the frontend and authorize the exact frontend origin in Google Cloud (locally `http://localhost:3000`). Restart the server. No Google client secret is used.
4. Set `IMGBB_API_KEY` for profile photos. Set `PUBLIC_APP_URL` to your frontend origin. Configure SMTP credentials for email verification codes and single-use password reset links, or set `RESEND_API_KEY` and a verified `MAIL_FROM` sender. Keep credentials server-side.
5. Run `npm test`. For the database integration suite, also set `WALLET_TEST_MONGO_URI` to a disposable replica-set URI. Tests use a fresh, isolated database.

Enter name, email, phone number and password on the registration form. POST those fields to `/auth/register/start`, then submit the returned request ID and emailed six-digit code to `/auth/register`. The account and wallet are created together after verification. Sign in using an email address or phone number and password. Google accounts choose a wallet phone number on first use. Agents need approval. Email changes require the current password and a code sent to the new email address, and disconnect Google sign-in once confirmed.

All paths below are relative to `/api`. Protected requests use a Bearer token.

- Auth: POST `/auth/register/start`, `/auth/register`, `/auth/login`, `/auth/google`, `/auth/forgot-password`, `/auth/reset-password`.
- Account: GET, PATCH or DELETE `/auth/me`; POST or DELETE `/auth/me/avatar`; POST `/auth/me/password`; POST and PUT `/auth/me/email`. Closing a wallet requires its current balance and typed account identifier. Transaction records are retained.
- Wallet: GET `/wallet/me`, `/wallet/transactions`; POST `/wallet/add`, `/wallet/withdraw`, `/wallet/send`. Sending requires `receiverPhone` and `amount`.
- Agent: POST `/agent/cash-in` and `/agent/cash-out` with `phone` and `amount`; GET `/agent/commission`.
- Admin: GET `/admin/users`, `/admin/wallets`, `/admin/transactions`; PATCH `/admin/wallets/block/:id`, `/admin/wallets/unblock/:id`, `/admin/agents/approve/:id`, `/admin/agents/suspend/:id`.
- Support: POST `/support` saves a contact request to the `supportmessages` collection.

Money writes accept an optional `Idempotency-Key` header. Reuse the same key and payload when retrying a request whose outcome is unknown. The wallet is a simulation, with self-funded deposits and agent-recorded cash operations.

Run `node scripts/seed-demo.js` against the configured digipay_wallet database to create the sample dataset once. Three featured logins appear on the login page. The complete generated credentials are stored in ignored `demo-logins.local.json`. Demo admins and money operations are scoped to the sample data.
