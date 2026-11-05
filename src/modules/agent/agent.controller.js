const Transaction = require('../transaction/transaction.model');
const { operation } = require('../wallet/wallet.service');

exports.cashIn = operation('cash_in');
exports.commissionHistory = async (req, res) => {
  const commissions = await Transaction.find({
    $or: [{ from: req.user._id }, { to: req.user._id }], commission: { $gt: 0 },
  }).select('-requestId -resultBalance -actor -targetPhone').sort({ createdAt: -1 });
  const total = commissions.reduce((sum, tx) => sum + Math.round(tx.commission * 100), 0) / 100;
  res.json({ count: commissions.length, total, commissions });
};
