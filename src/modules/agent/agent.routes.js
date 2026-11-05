const express = require('express');
const router = express.Router();
const controller = require('./agent.controller');
const auth = require('../../middlewares/authMiddleware');
const role = require('../../middlewares/roleMiddleware');

router.post('/cash-in', auth, role('agent'), controller.cashIn);
router.post('/cash-out', auth, role('agent'), (req, res) => res.status(403).json({ message: 'Customers authorize cash-outs from their own wallet.' }));
router.get('/commission', auth, role('agent'), controller.commissionHistory);

module.exports = router;
