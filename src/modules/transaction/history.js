const mongoose = require('mongoose');
const Transaction = require('./transaction.model');
const User = require('../user/user.model');
const { fail } = require('../../utils/validation');

async function history(req, res, admin = false) {
  const query = req.query;
  const filter = admin ? {} : { $or: [{ from: req.user._id }, { to: req.user._id }] };
  if (admin && req.user.demo) filter.demo = true;
  if (query.type) filter.type = String(query.type);
  if (query.status) filter.status = String(query.status);
  for (const field of ['from', 'to']) {
    if (!query[field]) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query[field])) fail(400, 'Use a valid date.');
    const date = new Date(query[field] + (field === 'from' ? 'T00:00:00.000Z' : 'T23:59:59.999Z'));
    if (!Number.isFinite(date.getTime())) fail(400, 'Use a valid date.');
    filter.createdAt ||= {};
    filter.createdAt[field === 'from' ? '$gte' : '$lte'] = date;
  }
  if (query.search) {
    const search = String(query.search).trim().slice(0, 100);
    const participants = await User.find({ phone: search }).distinct('_id');
    const matches = [{ from: { $in: participants } }, { to: { $in: participants } }];
    if (mongoose.isObjectIdOrHexString(search)) matches.push({ _id: search });
    filter.$and = [{ $or: matches }];
  }
  const rows = Transaction.find(filter).select('-actor -requestId -resultBalance -targetPhone').sort({ createdAt: -1, _id: -1 });
  if (!admin && req.user.role === 'agent' && query.type === 'cash_out') rows.populate('from', 'name phone');
  if (admin) rows.populate('from to', 'name phone role');
  if (!query.page) return res.json(await rows);
  const page = Number(query.page);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) fail(400, 'Invalid page.');
  const size = 15;
  const [transactions, count] = await Promise.all([rows.skip((page - 1) * size).limit(size), Transaction.countDocuments(filter)]);
  res.json({ transactions, totalPages: Math.max(1, Math.ceil(count / size)), total: count });
}
module.exports = history;
