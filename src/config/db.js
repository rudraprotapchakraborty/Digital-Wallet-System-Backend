const mongoose = require('mongoose');
const User = require('../modules/user/user.model');
const Wallet = require('../modules/wallet/wallet.model');
const Transaction = require('../modules/transaction/transaction.model');
const { Challenge } = require('../modules/auth/email-verification');
const { Reset } = require('../modules/auth/password-reset');

module.exports = async function connectDB() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri || !process.env.JWT_SECRET) throw new Error('Set MONGODB_URI and JWT_SECRET before starting the API.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all([Challenge.init(), Reset.init(), User.init(), Wallet.init(), Transaction.init()]);
};
