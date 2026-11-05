const express = require('express');
const router = express.Router();
const { rateLimit } = require('express-rate-limit');
const controller = require('./auth.controller');
const settings = require('./settings.controller');
const auth = require('../../middlewares/authMiddleware');

const limit = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 45, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});
const reset = require('./password-reset');
const demoAccounts = require('./demo-accounts');
const User = require('../user/user.model');
router.get('/demo-accounts', async (req, res) => {
  const featured = await User.find({ demo: true, featured: true, isApproved: true, isBlocked: false }).select('email role phone').lean();
  res.json(demoAccounts.filter(account => featured.some(user => user.email === account.email && user.role === account.role && user.phone === account.phone)));
});
router.post('/register/start', limit, controller.startRegistration);
router.post('/register', limit, controller.register);
router.post('/login', limit, controller.login);
router.post('/google', limit, controller.google);
router.post('/forgot-password', limit, reset.requestReset);
router.post('/reset-password', limit, reset.resetPassword);
router.use('/me', auth, (req, res, next) => {
  if (req.method !== 'GET' && req.user.featured) return res.status(403).json({ message: 'Shared demo profiles are read-only.' });
  next();
});
router.get('/me', settings.me);
router.patch('/me', settings.updateProfile);
router.delete('/me', limit, settings.deleteAccount);
router.post('/me/avatar', limit, express.json({ limit: '1050kb' }), settings.photo);
router.delete('/me/avatar', settings.photo);
router.post('/me/password', limit, settings.password);
router.post('/me/email', limit, controller.changeEmail);
router.put('/me/email', limit, controller.confirmEmail);
module.exports = router;
