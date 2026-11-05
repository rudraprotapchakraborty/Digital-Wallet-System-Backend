const mongoose = require('mongoose');
const Wallet = require('./wallet.model');
const User = require('../user/user.model');
const Transaction = require('../transaction/transaction.model');
const { fail, money, phoneNumber } = require('../../utils/validation');

async function adjust(user, delta, session) {
  const wallet = await Wallet.findOne({ user }).session(session);
  if (!wallet) fail(404, 'Wallet not found.');
  if (wallet.isBlocked) fail(403, 'This wallet is blocked.');
  const cents = Math.round(wallet.balance * 100) + Math.round(delta * 100);
  if (cents < 0) fail(400, 'Insufficient balance.');
  if (!Number.isSafeInteger(cents)) fail(400, 'Balance limit exceeded.');
  wallet.balance = cents / 100;
  await wallet.save({ session });
  return wallet.balance;
}

async function moveFunds(type, member, body, requestId) {
  const actor = member._id;
  const amount = money(body?.amount);
  const needsPhone = ['send_money', 'cash_in', 'cash_out'].includes(type);
  const phone = needsPhone ? phoneNumber(body[{ send_money: 'receiverPhone', cash_out: 'agentPhone', cash_in: 'phone' }[type]]) : undefined;
  if (requestId && !/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) fail(400, 'Invalid request identifier.');
  const scope = { actor, requestId };
  function replay(tx) {
    if (tx.type !== type || tx.amount !== amount || tx.targetPhone !== phone) fail(409, 'This request identifier was already used.');
    return { message: 'Transaction completed.', reference: tx.id, balance: tx.resultBalance };
  }

  try {
    return await mongoose.connection.transaction(async session => {
      if (requestId) {
        const prior = await Transaction.findOne(scope).session(session);
        if (prior) return replay(prior);
      }
      let target;
      if (needsPhone) {
        target = await User.findOne({ phone, role: type === 'cash_out' ? 'agent' : 'user', isApproved: true, isBlocked: false, demo: member.demo ? true : { $ne: true } }).session(session);
        if (!target) fail(404, 'Recipient wallet not found.');
        if (target._id.equals(actor)) fail(400, 'Choose another wallet.');
      }
      let from, to, balance;
      if (target) {
        from = actor;
        to = target._id;
        balance = await adjust(actor, -amount, session);
        await adjust(to, amount, session);
      } else {
        const deposit = type === 'add_money';
        if (deposit) to = actor;
        else from = actor;
        balance = await adjust(actor, deposit ? amount : -amount, session);
      }
      const commission = type.startsWith('cash_') ? Math.round(amount) / 100 : 0;
      const transaction = await new Transaction({
        type, from, to, amount, commission, actor, demo: Boolean(member.demo), requestId, targetPhone: phone, resultBalance: balance,
      }).save({ session });
      return { message: 'Transaction completed.', reference: transaction.id, balance };
    });
  } catch (err) {
    if (requestId && err.code === 11000) {
      const prior = await Transaction.findOne(scope);
      if (prior) return replay(prior);
    }
    throw err;
  }
}

exports.operation = type => async (req, res) => {
  res.json(await moveFunds(type, req.user, req.body, req.get('Idempotency-Key')));
};
