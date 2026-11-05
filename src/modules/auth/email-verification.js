const { randomInt, randomUUID, createHmac, timingSafeEqual } = require('node:crypto');
const mongoose = require('mongoose');
const mail = require('./mail');
const { fail } = require('../../utils/validation');

const schema = new mongoose.Schema({
  key: { type: String, required: true },
  purpose: { type: String, enum: ['signup', 'change'], required: true },
  requestId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  user: mongoose.Schema.Types.ObjectId,
  version: Number,
  signup: { type: new mongoose.Schema({ name: String, phone: String, role: String, passwordHash: String }, { _id: false }), select: false },
  digest: { type: String, required: true }, attempts: Number, sentAt: Date, expiresAt: { type: Date, expires: 0 },
});
schema.index({ key: 1, purpose: 1 }, { unique: true });
const Challenge = mongoose.model('EmailVerification', schema);
const signature = (id, code) => createHmac('sha256', process.env.JWT_SECRET).update(id + ':' + code).digest('hex');

async function issue({ email, user, signup }) {
  const now = Date.now();
  const purpose = user ? 'change' : 'signup';
  const key = user?.id || email;
  const requestId = randomUUID();
  const code = String(randomInt(1000000)).padStart(6, '0');
  try {
    await Challenge.findOneAndUpdate({ key, purpose, sentAt: { $lte: new Date(now - 60000) } }, {
      $set: { email, user: user?._id, version: user?.sessionVersion, signup, requestId,
        digest: signature(requestId, code), attempts: 0, sentAt: new Date(now), expiresAt: new Date(now + 600000) },
    }, { upsert: true });
  } catch (err) {
    if (err.code === 11000) fail(429, 'Wait one minute before requesting another code.');
    throw err;
  }
  try { await mail.sendCode(email, code); }
  catch (err) { await Challenge.deleteOne({ requestId }); throw err; }
  return { requestId };
}

async function confirm({ requestId, code, user }, change) {
  if (typeof requestId !== 'string' || typeof code !== 'string' || !/^\d{6}$/.test(code)) fail(400, 'Enter the six-digit code from your email.');
  const scope = { requestId, purpose: user ? 'change' : 'signup', attempts: { $lt: 5 }, expiresAt: { $gt: new Date() } };
  if (user) Object.assign(scope, { user: user._id, version: user.sessionVersion });
  const challenge = await Challenge.findOne(scope);
  if (!challenge) fail(400, 'Request a new code. This verification has expired or was already used.');
  const expected = signature(requestId, code);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(challenge.digest))) {
    await Challenge.updateOne(scope, { $inc: { attempts: 1 } });
    fail(400, 'Incorrect verification code.');
  }
  return mongoose.connection.transaction(async session => {
    const consumed = await Challenge.findOneAndDelete({ ...scope, digest: expected, expiresAt: { $gt: new Date() } }, { session }).select('+signup');
    if (!consumed) fail(400, 'Request a new verification code.');
    return change(consumed, session);
  });
}

module.exports = { Challenge, issue, confirm };
