const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../user/user.model');
const Wallet = require('../wallet/wallet.model');
const { Challenge } = require('./email-verification');
const { Reset } = require('./password-reset');
const imageHost = require('./imgbb');
const { profile, sessionResponse, credentials, loadAccount } = require('./profile');
const { fail, newPassword, fullName, phoneNumber } = require('../../utils/validation');

exports.me = async (req, res) => res.json({ user: profile(await loadAccount(req.user.id)) });

exports.updateProfile = async (req, res) => {
  const { name, phone, password } = req.body || {};
  if (password !== undefined) fail(400, 'Use the password form to change your password.');
  const changes = {};
  if (name !== undefined) changes.name = fullName(name);
  if (phone !== undefined && phone !== req.user.phone) changes.phone = phoneNumber(phone);
  const user = await User.findByIdAndUpdate(req.user.id, { $set: changes }, { returnDocument: 'after' }).select(credentials);
  if (!user) fail(404, 'Account not found.');
  res.json({ user: profile(user) });
};

exports.photo = async (req, res) => {
  const avatar = req.method === 'DELETE' ? null : await imageHost.upload(req.body?.image);
  const user = await User.findByIdAndUpdate(req.user.id, { $set: { avatar } }, { returnDocument: 'after' }).select(credentials);
  if (!user) fail(404, 'Account not found.');
  res.json({ user: profile(user) });
};

exports.password = async (req, res) => {
  const user = await loadAccount(req.user.id);
  const { currentPassword, newPassword: next } = req.body || {};
  if (user.password && (typeof currentPassword !== 'string' || !(await user.matchPassword(currentPassword)))) fail(403, 'Your current password is incorrect.');
  newPassword(next);
  if (await user.matchPassword(next)) fail(400, 'Choose a different new password.');
  const updated = await User.findOneAndUpdate({ _id: user._id, password: user.password || null },
    { $set: { password: await bcrypt.hash(next, 12) }, $inc: { sessionVersion: 1 } }, { returnDocument: 'after' }).select(credentials);
  if (!updated) fail(409, 'Your password changed. Sign in again.');
  res.json(sessionResponse(updated));
};

exports.deleteAccount = async (req, res) => {
  const { confirmation, balance } = req.body || {};
  await mongoose.connection.transaction(async session => {
    const user = await User.findById(req.user.id).session(session);
    if (!user) fail(404, 'Account not found.');
    if (typeof confirmation !== 'string' || confirmation.trim().toLowerCase() !== (user.email || user.phone)) {
      fail(400, 'Type the account email or wallet phone number shown to confirm.');
    }
    const wallet = await Wallet.findOne({ user: user._id }).session(session);
    if (wallet && wallet.balance !== balance) fail(409, 'Your balance changed. Cancel and reopen the confirmation to review it.');
    if (user.role === 'admin') {
      // Write to a surviving admin in the same transaction so two final admins cannot both leave.
      const survivor = await User.findOneAndUpdate({ role: 'admin', demo: user.demo ? true : { $ne: true }, _id: { $ne: user._id }, isBlocked: { $ne: true }, isApproved: true },
        { $inc: { __v: 1 } }, { session, sort: { _id: 1 } });
      if (!survivor) fail(409, 'Another active administrator is required before you can delete this account.');
    }
    await Challenge.deleteMany({ user: user._id }, { session });
    await Reset.deleteMany({ user: user._id }, { session });
    await Wallet.deleteOne({ user: user._id }, { session });
    await User.deleteOne({ _id: user._id }, { session });
  });
  res.sendStatus(204);
};
