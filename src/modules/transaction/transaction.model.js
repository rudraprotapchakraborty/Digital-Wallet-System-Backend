const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['add_money', 'withdraw', 'send_money', 'cash_in', 'cash_out', 'commission'],
    required: true
  },
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  demo: { type: Boolean, default: false },
  amount: { type: Number, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  requestId: String,
  resultBalance: Number,
  targetPhone: String,
  fee: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'completed', 'reversed'], default: 'completed' },
}, { timestamps: true });

transactionSchema.index({ actor: 1, requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: "string" } } });

module.exports = mongoose.model('Transaction', transactionSchema);
