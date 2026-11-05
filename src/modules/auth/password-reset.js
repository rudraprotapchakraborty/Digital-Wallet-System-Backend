const { randomBytes, createHash } = require('node:crypto');
const mongoose = require('mongoose');
const User = require('../user/user.model');
const mail = require('./mail');
const { fail, emailAddress, newPassword } = require('../../utils/validation');

const Reset = mongoose.model('PasswordReset', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  digest: { type: String, required: true, unique: true }, email: String, sessionVersion: Number,
  sentAt: Date, expiresAt: { type: Date, expires: 0 },
}));
const digest = token => createHash('sha256').update(token).digest('hex');

async function requestReset(req, res) {
  const email = emailAddress(req.body?.email);
  const user = await User.findOne({ email }).select('+password');
  if (!user?.password || user.demo) return res.sendStatus(204);
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const base = process.env.PUBLIC_APP_URL || process.env.CLIENT_ORIGINS?.split(',')[0]?.trim() || (process.env.NODE_ENV !== 'production' && 'http://localhost:3000');
  if (!base) fail(503, 'Password recovery is unavailable.');
  const url = new URL('/forgot-password', base);
  url.hash = 'token=' + token;
  try {
    await Reset.findOneAndUpdate({ user: user._id, sentAt: { $lte: new Date(now - 60000) } }, {
      $set: { digest: digest(token), email, sessionVersion: user.sessionVersion, sentAt: new Date(now), expiresAt: new Date(now + 15 * 60000) },
    }, { upsert: true });
  } catch (err) {
    if (err.code === 11000) return res.sendStatus(204);
    throw err;
  }
  try { await mail.sendResetLink(email, url.href); }
  catch (err) { await Reset.deleteOne({ digest: digest(token) }); throw err; }
  res.sendStatus(204);
}

async function resetPassword(req, res) {
  const { token } = req.body || {};
  const next = newPassword(req.body?.newPassword);
  if (typeof token !== 'string' || !/^[a-f\d]{64}$/.test(token)) fail(400, 'Request a new password reset link.');
  await mongoose.connection.transaction(async session => {
    const reset = await Reset.findOneAndDelete({ digest: digest(token), expiresAt: { $gt: new Date() } }, { session });
    if (!reset) fail(400, 'This link expired or was already used.');
    const account = await User.findOne({ _id: reset.user, email: reset.email, demo: { $ne: true } }).select('+password').session(session);
    if (!account || account.sessionVersion !== reset.sessionVersion) fail(400, 'Request a new password reset link.');
    if (await account.matchPassword(next)) fail(400, 'Choose a different new password.');
    account.password = next;
    account.sessionVersion++;
    await account.save({ session, validateModifiedOnly: true });
  });
  res.sendStatus(204);
}
module.exports = { Reset, requestReset, resetPassword };
