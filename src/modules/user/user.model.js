const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  avatar: String,
  demo: { type: Boolean, default: false },
  featured: { type: Boolean, default: false },
  sessionVersion: { type: Number, default: 0 },
  phone: { type: String, required: true, unique: true },
  password: { type: String, select: false, required() { return !this.googleSub; } },
  googleSub: { type: String, unique: true, sparse: true, select: false },
  role: { type: String, enum: ['user', 'agent', 'admin'], default: 'user' },
  isApproved: { type: Boolean, default: true },
  isBlocked: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.pre('save', async function() {
  if (this.isModified('password') && this.password) this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.matchPassword = function(value) {
  return this.password && bcrypt.compare(value, this.password);
};

module.exports = mongoose.model('User', userSchema);
