const Wallet = require('./wallet.model');
const User = require('../user/user.model');
const { operation } = require('./wallet.service');
const history = require('../transaction/history');

exports.getMyWallet = async (req, res) => {
  const wallet = await Wallet.findOne({ user: req.user._id });
  if (!wallet) return res.status(404).json({ message: 'Wallet not found.' });
  res.json(wallet);
};
exports.addMoney = operation('add_money');
exports.withdraw = operation('withdraw');
exports.sendMoney = operation('send_money');
exports.getMyTransactions = (req, res) => history(req, res);

exports.demoRecipients = async (req, res) => {
  if (!req.user.demo) return res.json([]);
  const recipients = await User.aggregate([
    { $match: { _id: { $ne: req.user._id }, demo: true, role: 'user', isApproved: true, isBlocked: false } },
    { $sort: { phone: 1 } },
    { $lookup: { from: Wallet.collection.name, localField: '_id', foreignField: 'user',
      pipeline: [{ $match: { demo: true, isBlocked: false } }, { $project: { _id: 1 } }], as: 'wallet' } },
    { $match: { 'wallet.0': { $exists: true } } },
    { $limit: 3 },
    { $project: { _id: 0, name: 1, phone: 1 } },
  ]);
  res.json(recipients);
};
