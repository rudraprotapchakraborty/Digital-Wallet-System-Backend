const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  demo: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
  balance: { type: Number, default: Number(process.env.START_BALANCE ?? 50), min: 0 },
  isBlocked: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);
