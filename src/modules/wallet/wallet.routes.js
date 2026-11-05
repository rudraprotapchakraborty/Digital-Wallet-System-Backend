const express = require('express');
const router = express.Router();
const controller = require('./wallet.controller');
const auth = require('../../middlewares/authMiddleware');
const role = require('../../middlewares/roleMiddleware');

// Get my wallet
router.get('/me', auth, role('user', 'agent'), controller.getMyWallet);
router.get('/demo-recipients', auth, role('user', 'agent'), controller.demoRecipients);

// Add money (user)
router.post('/add', auth, role('user'), controller.addMoney);

// Withdraw (user)
router.post('/withdraw', auth, role('user'), controller.withdraw);

// Send money to another user (user)
router.post('/cash-out', auth, role('user'), controller.cashOut);
router.post('/send', auth, role('user'), controller.sendMoney);

// Get my transactions (user/agent)
router.get('/transactions', auth, role('user', 'agent'), controller.getMyTransactions);

module.exports = router;