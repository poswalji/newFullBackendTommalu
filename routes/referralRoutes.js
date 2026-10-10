const express = require('express');
const router = express.Router();
const referralController = require('../controllers/referralController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Public/User Routes
router.use(protect);

// Customer: My Referral Stats
router.get('/my-stats', referralController.getMyReferralStats);
router.post('/validate-code', referralController.validateReferralCode);

// Admin Routes
router.use(restrictTo('admin', 'superAdmin'));
router.get('/campaign', referralController.getCampaign);
router.put('/campaign', referralController.updateCampaign);
router.get('/ledger', referralController.getRewardLedger);
router.get('/conversions', referralController.getAllReferrals);

module.exports = router;
