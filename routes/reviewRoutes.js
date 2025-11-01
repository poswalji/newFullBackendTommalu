const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Public routes (for viewing reviews)
router.get('/store/:storeId', reviewController.getStoreReviews);

// Customer routes
router.use(protect);
router.post('/', restrictTo('customer'), reviewController.createReview);
router.get('/customer/my-reviews', restrictTo('customer'), reviewController.getUserReviews);
router.patch('/:id', restrictTo('customer'), reviewController.updateReview);
router.post('/:id/helpful', protect, reviewController.markHelpful);
router.post('/:id/report', protect, reviewController.reportReview);

// Store Owner routes
router.post('/:id/response', restrictTo('storeOwner'), reviewController.addStoreResponse);

// Admin routes
router.get('/admin/all', restrictTo('admin'), reviewController.getAllReviews);
router.patch('/admin/:id/moderate', restrictTo('admin'), reviewController.moderateReview);

module.exports = router;

