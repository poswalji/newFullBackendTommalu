const express = require('express');
const router = express.Router();
const payoutController = require('../controllers/payoutController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Store Owner routes
router.get('/store-owner/my-payouts', restrictTo('storeOwner'), payoutController.getMyPayouts);
router.get('/store-owner/payouts/:id', restrictTo('storeOwner'), payoutController.getPayoutById);
router.post('/store-owner/request-early', restrictTo('storeOwner'), payoutController.requestEarlyPayout);
router.get('/store-owner/earnings-statement', restrictTo('storeOwner'), payoutController.getEarningsStatement);
router.get('/store-owner/download-statement', restrictTo('storeOwner'), payoutController.downloadStatement);

module.exports = router;

