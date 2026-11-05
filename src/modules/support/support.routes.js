const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');
const router = require('express').Router();
const { fullName, fail } = require('../../utils/validation');

const SupportMessage = mongoose.model('SupportMessage', new mongoose.Schema({
  name: String, email: String, message: String,
}, { timestamps: true }));

router.post('/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, message: { message: 'Please try again later.' } }), async (req, res) => {
  const { name, email, message } = req.body || {};
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
  if (typeof message !== 'string' || !message.trim() || message.length > 2000) fail(400, 'Enter a message of up to 2,000 characters.');
  await SupportMessage.create({ name: fullName(name), email, message: message.trim() });
  res.status(201).json({ message: 'Message received.' });
});
module.exports = router;
