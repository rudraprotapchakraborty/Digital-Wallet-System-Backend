<div align="center">

# 💸 Digital Wallet System

**Digital wallet for sending money, deposits, withdrawals and agent cash services.**

[**Live demo**](https://digital-wallet-system-frontend-topaz.vercel.app/) · [Frontend](https://github.com/rudraprotapchakraborty/digital-wallet-system-frontend) · [API status](https://digital-wallet-system-backend-nine.vercel.app/) · [Portfolio](https://rudraprotapchakraborty.com/projects)

![Node.js](https://img.shields.io/badge/Node.js-3c873a?style=for-the-badge&logo=nodedotjs&logoColor=ffffff) ![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=ffffff) ![MongoDB](https://img.shields.io/badge/MongoDB-47a248?style=for-the-badge&logo=mongodb&logoColor=ffffff) ![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=ffffff) ![Google Sign--In](https://img.shields.io/badge/Google_Sign--In-4285f4?style=for-the-badge&logo=google&logoColor=ffffff)

<a href="https://digital-wallet-system-frontend-topaz.vercel.app/"><img src="https://i.ibb.co/HLx4BZ5g/digipay.webp" alt="Digital Wallet System: home page" width="880"></a>

</div>

> The REST API of **DigiPay**.
>
> - Send money by phone number, add and withdraw funds, search transaction history
> - Agents handle cash-in and cash-out and earn a 1% commission
> - Admins review activity, manage wallet access and approve agents
> - MongoDB transactions keep balances and transaction records together

The Express API behind the digital wallet system’s personal wallets, agent counters, and admin dashboard (branded DigiPay in the web app). MongoDB transactions keep balance updates and their transaction records together.

## How money moves

| Operation | Who initiates it | Balance movement |
| --- | --- | --- |
| Send money | Personal wallet owner | Sender → receiver, identified by wallet phone number |
| Cash-in | Approved agent | Agent wallet → customer wallet |
| Cash-out | Personal wallet owner | Customer wallet → approved agent wallet |
| Add or withdraw | Personal wallet owner | Simulated funds enter or leave the wallet |

Administrators review activity, manage wallet access, and approve agents. Only personal and agent accounts hold balances. Money writes accept an optional `Idempotency-Key` header. When retrying a request after a timeout, reuse the original key and payload.

## Run locally

Use **Node.js 24 or newer** and a **MongoDB replica set** such as Atlas. From the repository root, create a `.env` file with the settings below, then start the server.

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/digipay_wallet?replicaSet=rs0
JWT_SECRET=replace-with-a-long-random-secret
CLIENT_ORIGINS=http://localhost:3000
PUBLIC_APP_URL=http://localhost:3000
PORT=5000
```

The example URI assumes a local replica set named `rs0`. For Atlas, use your cluster URI with `/digipay_wallet` before the query string.

```sh
npm ci
npm run dev
```

Open **[localhost:5000](http://localhost:5000)** for the status response. API routes use the `/api` prefix. Use `npm start` to run the server without file watching.

### Connect account services

| Feature | Server settings |
| --- | --- |
| Email verification and password recovery | Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`, or use `RESEND_API_KEY` with a verified `MAIL_FROM`. Reset links use `PUBLIC_APP_URL`. |
| Google sign-in | Set `GOOGLE_CLIENT_ID` to the frontend’s public web client ID. The API verifies the Google credential against this ID. |
| Profile photos | Set `IMGBB_API_KEY` on the backend for avatar uploads. |

## API guide

Paths below are relative to `/api`. For protected endpoints, send `Authorization: Bearer <token>`.

| Area | Endpoints |
| --- | --- |
| Sign-up | `POST /auth/register/start` sends the six-digit email code. Submit the request ID and code to `POST /auth/register` to complete registration. |
| Sign-in and recovery | `POST /auth/login`, `POST /auth/google`, `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Profile | `GET/PATCH/DELETE /auth/me`, `POST/DELETE /auth/me/avatar`, `POST /auth/me/password`, `POST/PUT /auth/me/email` |
| Wallet activity | `GET /wallet/me`, `GET /wallet/transactions`, `POST /wallet/add`, `POST /wallet/withdraw` |
| Transfers | `POST /wallet/send` takes `receiverPhone` and `amount`. `POST /wallet/cash-out` takes `agentPhone` and `amount`. |
| Agent counter | `POST /agent/cash-in` takes the customer’s `phone` and `amount`. `GET /agent/commission` returns commission history. |
| Admin | `GET /admin/users`, `GET /admin/wallets`, `GET /admin/transactions`. Use `PATCH` on `/admin/wallets/block/:id`, `/admin/wallets/unblock/:id`, `/admin/agents/approve/:id`, or `/admin/agents/suspend/:id`. |
| Demo and support | `GET /auth/demo-accounts`, `GET /wallet/demo-recipients`, `POST /support` |

Email changes require a password and a code sent to the new address. Confirming the change disconnects Google sign-in. Account closure requires balance and account-identifier confirmation and retains transaction records.

## Demo data and tests

To populate the configured `digipay_wallet` database with sample accounts and transactions, run the seed script once.

```sh
node scripts/seed-demo.js
```

The login page features one personal, agent, and admin account each. The seed script writes the full credential list to the Git-ignored `demo-logins.local.json` file.

Run `npm test` for the test suite. To include database integration tests, set `WALLET_TEST_MONGO_URI` to a disposable replica-set URI.

**Built with** Node.js · Express · JavaScript · MongoDB · Mongoose

---

<div align="center">

Made by **[Rudra Protap Chakraborty](https://rudraprotapchakraborty.com)** · [Portfolio](https://rudraprotapchakraborty.com) · [GitHub](https://github.com/rudraprotapchakraborty)

</div>
