const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { money } = require('../src/utils/validation');

test('money accepts positive decimal amounts and rejects ambiguous input', () => {
  for (const invalid of [null, false, {}, [], NaN, Infinity, 0, -1, '1.234', '1e4', '12rupees']) {
    assert.throws(() => money(invalid), { statusCode: 400 });
  }
  assert.equal(money('0.01'), 0.01);
});

test('wallet and identity integration', { skip: !process.env.WALLET_TEST_MONGO_URI }, async t => {
  const mongoose = require('mongoose');
  const { OAuth2Client } = require('google-auth-library');
  process.env.JWT_SECRET = randomUUID();
  process.env.GOOGLE_CLIENT_ID = 'wallet-test-client';
  process.env.START_BALANCE = '50';
  const dbName = 'wallet_test_' + randomUUID().replaceAll('-', '');
  await mongoose.connect(process.env.WALLET_TEST_MONGO_URI, { dbName });
  const app = require('../src/app');
  const User = require('../src/modules/user/user.model');
  const Wallet = require('../src/modules/wallet/wallet.model');
  const Transaction = require('../src/modules/transaction/transaction.model');
  await Promise.all([User.init(), Wallet.init(), Transaction.init()]);
  const resetLinks = new Map();
  const codes = new Map();
  t.mock.method(require('../src/modules/auth/mail'), 'sendCode', async (email, code) => { codes.set(email, code); });
  await require('../src/modules/auth/email-verification').Challenge.init();
  t.mock.method(require('../src/modules/auth/mail'), 'sendResetLink', async (email, url) => { resetLinks.set(email, url); });
  await require('../src/modules/auth/password-reset').Reset.init();
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.name === dbName) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  async function request(path, { body, token, key, method = body ? 'POST' : 'GET' } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (key) headers['Idempotency-Key'] = key;
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers, body: JSON.stringify(body) });
    const data = response.status === 204 ? {} : await response.json();
    return { status: response.status, ...data };
  }
  async function register(body) {
    const started = await request('/auth/register/start', { body });
    if (started.status !== 200) return started;
    return request('/auth/register', { body: { requestId: started.requestId, code: codes.get(body.email) } });
  }
  const first = { email: 'first@example.test', name: 'First wallet', phone: '01700000001', password: 'testing-wallet1' };
  const second = { ...first, name: 'Second wallet', email: 'second@example.test', phone: '01700000002' };
  for (const body of [first, second]) assert.equal((await register(body)).status, 201);
  const { token, user } = await request('/auth/login', { body: first });
  assert.ok(token);
  const wallet = target => Wallet.findOne({ user: target });
  const transfer = { amount: '31.22', receiverPhone: second.phone };
  await t.test('retries and concurrent transfers conserve balance', async () => {
    const sends = await Promise.all([0, 1].map(() => request('/wallet/send', { token, body: transfer, key: 'same-request-id' })));
    assert.deepEqual(sends.map(r => r.status), [200, 200]);
    assert.equal(await Transaction.countDocuments(), 1);
    assert.equal((await wallet(user.id)).balance, 18.78);
    assert.equal((await request('/wallet/send', { token, body: { ...transfer, amount: 2 }, key: 'same-request-id' })).status, 409);
    const withdrawals = await Promise.all([0, 1].map(() => request('/wallet/withdraw', { token, body: { amount: 15 } })));
    assert.deepEqual(withdrawals.map(r => r.status).sort(), [200, 400]);
    assert.equal((await wallet(user.id)).balance, 3.78);
  });
  await t.test('blocked recipients roll back debits and history filters work', async () => {
    const target = await User.findOne({ phone: second.phone });
    await Wallet.updateOne({ user: target._id }, { isBlocked: true });
    assert.equal((await request('/wallet/send', { token, body: { ...transfer, amount: 1 } })).status, 403);
    assert.equal((await wallet(user.id)).balance, 3.78);
    const data = await request('/wallet/transactions?page=1&type=send_money', { token });
    assert.equal(data.transactions.length, 1);
    assert.equal(data.transactions[0].amount, 31.22);
    assert.equal((await request('/admin/users', { token })).status, 403);
  });
  await t.test('Google verification, phone collision, creation and return', async t => {
    const options = { body: { credential: 'invalid' } };
    t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async ({ idToken, audience }) => {
      assert.equal(audience, 'wallet-test-client');
      if (idToken !== 'test-token') throw new Error('Invalid signature');
      return { getPayload: () => ({ sub: 'google-id', email: 'google@example.test', email_verified: true, name: 'Google member' }) };
    });
    assert.equal((await request('/auth/google', options)).status, 401);
    const body = { credential: 'test-token', role: 'admin' };
    assert.equal((await request('/auth/google', { body })).requiresPhone, true);
    assert.equal((await request('/auth/google', { body: { ...body, phone: first.phone } })).status, 409);
    const signed = await request('/auth/google', { body: { ...body, phone: '01700000003' } });
    assert.equal(signed.role, 'user'); assert.ok(signed.token);
    const returning = await request('/auth/google', { body });
    assert.equal(returning.user.id, signed.user.id);
    assert.equal((await wallet(signed.user.id)).balance, 50);
    const update = await request('/auth/me', { token: signed.token, method: 'PATCH', body: { name: 'Updated', phone: signed.user.phone } });
    assert.equal(update.user.name, 'Updated');
    assert.equal(update.user.hasPassword, false);
    assert.equal(update.user.usesGoogle, true);
    const password = 'first-google-password';
    const added = await request('/auth/me/password', { token: signed.token, body: { newPassword: password } });
    assert.equal(added.user.hasPassword, true);
    assert.equal(added.user.usesGoogle, true);
    const email = 'changed-google@example.test';
    const verification = await request('/auth/me/email', { token: added.token, body: { email, currentPassword: password } });
    const relinked = await request('/auth/me/email', { token: added.token, method: 'PUT', body: { requestId: verification.requestId, code: codes.get(email) } });
    assert.equal(relinked.user.usesGoogle, false);
    assert.equal((await request('/auth/login', { body: { email, password } })).user.id, signed.user.id);
  });
  await t.test('pending and suspended agents cannot move funds', async () => {
    const body = { ...first, phone: '01700000004', email: 'agent@example.test', role: 'agent' };
    assert.equal((await register(body)).status, 201);
    assert.equal((await request('/auth/login', { body })).status, 403);
    await User.updateOne({ phone: body.phone }, { isApproved: true });
    const agent = await request('/auth/login', { body });
    const cash = { token: agent.token, body: { phone: first.phone, amount: '10.00' } };
    assert.equal((await request('/agent/cash-in', cash)).status, 200);
    assert.equal((await request('/agent/commission', { token: agent.token })).total, 0.1);
    await User.updateOne({ phone: body.phone }, { isApproved: false });
    assert.equal((await request('/agent/cash-out', cash)).status, 403);
  });
  await t.test('email and phone login, password changes, avatar and wallet closure', async t => {
    const original = { ...first, email: 'profile@example.test', phone: '01700000009' };
    const pending = await request('/auth/register/start', { body: original });
    assert.equal(pending.status, 200);
    assert.equal(await User.countDocuments({ email: original.email }), 0);
    const verify = code => request('/auth/register', { body: { requestId: pending.requestId, code } });
    const goodCode = codes.get(original.email);
    assert.equal((await verify(goodCode === '000000' ? '000001' : '000000')).status, 400);
    const created = await verify(goodCode);
    assert.equal((await verify(goodCode)).status, 400);
    assert.equal(created.status, 201);
    assert.equal((await register(original)).status, 409);
    assert.equal((await request('/auth/login', { body: { identifier: original.phone, password: original.password } })).user.id, created.user.id);
    let session = (await request('/auth/login', { body: original })).token;
    const patch = body => request('/auth/me', { token: session, method: 'PATCH', body });
    assert.equal((await patch({ name: 'Profile owner' })).user.name, 'Profile owner');
    assert.equal((await patch({ password: 'bypass-password' })).status, 400);
    assert.equal((await request('/auth/me/avatar', { token: session, body: { image: 'untrusted' } })).status, 400);
    t.mock.method(require('../src/modules/auth/imgbb'), 'upload', async () => 'https://i.ibb.co/test/photo.jpg');
    assert.match((await request('/auth/me/avatar', { token: session, body: { image: 'fixture' } })).user.avatar, /photo\.jpg$/);
    assert.equal((await request('/auth/me/avatar', { token: session, method: 'DELETE' })).user.avatar, '');
    const nextPassword = 'changed-wallet-pass';
    const change = currentPassword => request('/auth/me/password', { token: session, body: { currentPassword, newPassword: nextPassword } });
    assert.equal((await change('wrong')).status, 403);
    const changed = await change(original.password);
    assert.equal(changed.status, 200);
    assert.equal((await request('/auth/me', { token: session })).status, 401);
    session = changed.token;
    const nextEmail = 'verified@example.test';
    const verification = await request('/auth/me/email', { token: session, body: { email: nextEmail, currentPassword: nextPassword } });
    assert.equal((await request('/auth/me', { token: session })).user.email, original.email);
    const confirmed = await request('/auth/me/email', { token: session, method: 'PUT', body: { requestId: verification.requestId, code: codes.get(nextEmail) } });
    assert.equal(confirmed.user.email, nextEmail);
    assert.equal((await request('/auth/login', { body: { email: original.email, password: nextPassword } })).status, 401);
    assert.equal((await request('/auth/forgot-password', { body: { email: nextEmail } })).status, 204);
    const finalPassword = 'reset-password-123';
    const resetToken = new URLSearchParams(new URL(resetLinks.get(nextEmail)).hash.slice(1)).get('token');
    const reset = () => request('/auth/reset-password', { body: { newPassword: finalPassword, token: resetToken } });
    assert.equal((await reset()).status, 204);
    assert.equal((await reset()).status, 400);
    session = (await request('/auth/login', { body: { email: nextEmail, password: finalPassword } })).token;
    assert.ok(session);
    const remove = (confirmation, balance) => request('/auth/me', { token: session, method: 'DELETE', body: { confirmation, balance } });
    assert.equal((await remove('wrong', 50)).status, 400);
    assert.equal((await remove(nextEmail, 0)).status, 409);
    await User.updateOne({ _id: created.user.id }, { role: 'admin' });
    assert.equal((await remove(nextEmail, 50)).status, 409);
    await User.updateOne({ _id: created.user.id }, { role: 'user' });
    assert.equal((await remove(nextEmail, 50)).status, 204);
    assert.equal(await wallet(created.user.id), null);
    assert.equal((await request('/auth/me', { token: session })).status, 401);
  });
  await t.test('public demos are isolated from real accounts and preserve shared access', async () => {
    // This fixture uses the regular auth middleware and authenticated role routes.
    const shared = await User.create({ name: 'Demo admin', email: 'demo-admin@example.test', phone: '01700000008', password: first.password, role: 'admin', demo: true, featured: true });
    const demoUser = await User.create({ name: 'Demo member', email: 'demo-user@example.test', phone: '01700000007', password: first.password, role: 'user', demo: true });
    await Wallet.create([{ user: shared._id, demo: true, featured: true }, { user: demoUser._id, demo: true }]);
    const jwt = require('../src/utils/generateJWT');
    const adminToken = jwt(shared.id, 'admin');
    const memberToken = jwt(demoUser.id, 'user');
    const realWallet = await wallet(user.id);
    const apiRequest = (path, options) => fetch('http://127.0.0.1:' + server.address().port + '/api' + path,
      { headers: { Authorization: 'Bearer ' + adminToken }, ...options });
    for (const path of ['/admin/users', '/admin/wallets', '/admin/transactions']) {
      const response = await apiRequest(path);
      assert.equal(response.status, 200);
      assert.ok((await response.json()).every(row => row.demo === true));
    }
    assert.equal((await apiRequest('/admin/wallets/block/' + realWallet.id, { method: 'PATCH' })).status, 404);
    assert.equal((await request('/auth/me', { token: adminToken, method: 'PATCH', body: { name: 'Edited' } })).status, 403);
    assert.equal((await request('/wallet/send', { token: memberToken, body: { receiverPhone: first.phone, amount: 1 } })).status, 404);
    assert.equal((await request('/wallet/send', { token, body: { receiverPhone: demoUser.phone, amount: 1 } })).status, 404);
    assert.equal((await wallet(user.id)).balance, realWallet.balance);
  });
});
