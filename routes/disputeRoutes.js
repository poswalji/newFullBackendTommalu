const express = require('express');
const router = express.Router();
const disputeController = require('../controllers/disputeController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Customer routes
router.post('/', restrictTo('customer'), disputeController.createDispute);
router.get('/customer/my-disputes', restrictTo('customer'), disputeController.getMyDisputes);
router.get('/:id', disputeController.getDisputeById);

// Store Owner routes
router.get('/store/all', restrictTo('storeOwner'), disputeController.getStoreDisputes);

module.exports = router;

