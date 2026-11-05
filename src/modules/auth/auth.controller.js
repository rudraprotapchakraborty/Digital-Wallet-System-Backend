const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const verification = require('./email-verification');
const { OAuth2Client } = require('google-auth-library');
const User = require('../user/user.model');
const Wallet = require('../wallet/wallet.model');
const { credentials, loadAccount, profile, sessionResponse } = require('./profile');
const { fail, emailAddress, phoneNumber, newPassword, fullName } = require('../../utils/validation');

const googleClient = new OAuth2Client();

async function createAccount(fields, session) {
  const user = new User(fields);
  await user.save({ session });
  await new Wallet({ user: user._id }).save({ session });
  return user;
}

function signIn(res, user) {
  if (user.isBlocked || !user.isApproved) fail(403, 'This account is blocked or awaiting approval.');
  res.json(sessionResponse(user));
}

function registration(body = {}) {
  const role = body.role || 'user';
  if (!['user', 'agent'].includes(role)) fail(400, 'Choose a personal or agent account.');
  return { name: fullName(body.name), email: emailAddress(body.email), password: newPassword(body.password), role, isApproved: role === 'user' };
}

exports.startRegistration = async (req, res) => {
  const fields = registration(req.body);
  const phone = phoneNumber(req.body.phone);
  if (await User.exists({ $or: [{ email: fields.email }, { phone }] })) fail(409, 'That email or phone number already has a wallet.');
  const signup = { name: fields.name, role: fields.role, phone, passwordHash: await bcrypt.hash(fields.password, 12) };
  res.json(await verification.issue({ email: fields.email, signup }));
};

exports.register = async (req, res) => {
  const { requestId, code } = req.body || {};
  const user = await verification.confirm({ requestId, code }, async (challenge, session) => {
    const { name, phone, role, passwordHash } = challenge.signup;
    // The server hashed the password at step one. insertMany avoids the pre-save hash hook.
    const [account] = await User.insertMany([{ name, email: challenge.email, phone, role,
      password: passwordHash, isApproved: role === 'user' }], { session });
    await new Wallet({ user: account._id }).save({ session });
    return account;
  });
  res.status(201).json({ message: 'Account created.', user: profile(user) });
};

exports.login = async (req, res) => {
  const { identifier, email, phone, password } = req.body || {};
  const value = identifier ?? email ?? phone;
  if (typeof value !== 'string' || !value.trim()) fail(400, 'Enter an email address or wallet phone number.');
  const filter = value.includes('@') ? { email: emailAddress(value) } : { phone: phoneNumber(value) };
  const user = await User.findOne(filter).select(credentials);
  if (!user || typeof password !== 'string' || !(await user.matchPassword(password))) fail(401, 'Invalid email, phone number, or password.');
  signIn(res, user);
};

exports.google = async (req, res) => {
  const { credential, phone } = req.body || {};
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) fail(503, 'Google sign-in is unavailable. Use email sign-in.');
  if (typeof credential !== 'string' || !credential || credential.length > 8192) fail(400, 'A Google credential is required.');
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience });
    payload = ticket.getPayload();
  } catch {
    fail(401, 'Google sign-in expired or could not be verified. Try again.');
  }
  if (!payload?.sub || !payload.email_verified || !payload.email) fail(401, 'Choose a verified Google account.');
  const email = emailAddress(payload.email);
  let user = await User.findOne({ googleSub: payload.sub }).select(credentials);
  if (!user) {
    if (await User.exists({ email })) fail(409, 'This email already has a wallet. Use its original sign-in method.');
    if (!phone) return res.json({ requiresPhone: true });
    try {
      const avatar = typeof payload.picture === 'string' && /^https:\/\/[\w.-]+\.googleusercontent\.com\//.test(payload.picture) ? payload.picture : undefined;
      user = await mongoose.connection.transaction(session => createAccount({
        name: fullName((payload.name || 'Wallet member').slice(0, 100)), email, avatar,
        phone: phoneNumber(phone), googleSub: payload.sub, role: 'user',
      }, session));
    } catch (err) {
      if (err.code !== 11000) throw err;
      user = await User.findOne({ googleSub: payload.sub }).select(credentials);
      if (!user) fail(409, 'This email or phone number already has a wallet.');
    }
  }
  signIn(res, user);
};

exports.changeEmail = async (req, res) => {
  const email = emailAddress(req.body?.email);
  const user = await loadAccount(req.user.id);
  if (!user.password) fail(409, 'Set a password before changing your email.');
  if (typeof req.body?.currentPassword !== 'string' || !(await user.matchPassword(req.body.currentPassword))) fail(403, 'Your current password is incorrect.');
  if (email === user.email) fail(400, 'This is already your email address.');
  if (await User.exists({ email })) fail(409, 'This email already has a wallet.');
  res.json(await verification.issue({ email, user }));
};

exports.confirmEmail = async (req, res) => {
  const { requestId, code } = req.body || {};
  const user = await loadAccount(req.user.id);
  const updated = await verification.confirm({ requestId, code, user }, async (challenge, session) => {
    const account = await User.findOneAndUpdate({ _id: user._id, password: user.password, email: user.email || null },
      { $set: { email: challenge.email }, $unset: { googleSub: 1 }, $inc: { sessionVersion: 1 } },
      { session, returnDocument: 'after' }).select(credentials);
    if (!account) fail(409, 'Your account changed. Request a new code.');
    return account;
  });
  res.json(sessionResponse(updated));
};
