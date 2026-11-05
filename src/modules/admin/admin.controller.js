const User = require('../user/user.model');
const Wallet = require('../wallet/wallet.model');
const history = require('../transaction/history');
const { fail } = require('../../utils/validation');

exports.listUsers = async (req, res) => {
  const { role, page, search } = req.query;
  const filter = req.user.demo ? { demo: true } : {};
  if (role) filter.role = String(role);
  if (search) {
    const pattern = new RegExp(RegExp.escape(String(search).slice(0, 100)), 'i');
    filter.$or = [{ name: pattern }, { phone: pattern }];
  }
  const query = User.find(filter).sort({ createdAt: -1, _id: -1 }).lean();
  if (page === undefined) return res.json(await query);
  const number = Number(page);
  if (!Number.isSafeInteger(number) || number < 1 || number > 1000000) fail(400, 'Invalid page.');
  const [users, count] = await Promise.all([query.skip((number - 1) * 15).limit(15), User.countDocuments(filter)]);
  const wallets = await Wallet.find({ user: { $in: users.map(u => u._id) } }).select('user isBlocked').lean();
  const byOwner = new Map(wallets.map(w => [String(w.user), w]));
  res.json({
    users: users.map(user => { const wallet = byOwner.get(String(user._id)); return { ...user, walletId: wallet?._id, isBlocked: wallet?.isBlocked ?? user.isBlocked }; }),
    totalPages: Math.max(1, Math.ceil(count / 15)), total: count,
  });
};
exports.listWallets = async (req, res) => res.json(await Wallet.find(req.user.demo ? { demo: true } : {}).populate('user', 'name phone role'));
exports.listTransactions = (req, res) => history(req, res, true);

function changeState(Model, filter, update, message) {
  return async (req, res) => {
    const scope = req.user.demo ? { demo: true, featured: { $ne: true } } : {};
    const row = await Model.findOneAndUpdate({ _id: req.params.id, ...filter, ...scope }, update);
    if (!row) fail(404, 'Account or wallet not found.');
    res.json({ message });
  };
}
exports.blockWallet = changeState(Wallet, {}, { isBlocked: true }, 'Wallet blocked.');
exports.unblockWallet = changeState(Wallet, {}, { isBlocked: false }, 'Wallet unblocked.');
exports.approveAgent = changeState(User, { role: 'agent' }, { isApproved: true }, 'Agent approved.');
exports.suspendAgent = changeState(User, { role: 'agent' }, { isApproved: false }, 'Agent suspended.');
