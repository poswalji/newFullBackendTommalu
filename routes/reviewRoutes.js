const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Public routes (for viewing reviews)
router.get('/store/:storeId', reviewController.getStoreReviews);

// Customer routes
router.use(protect);
router.post('/', reviewController.createReview);
router.get('/customer/my-reviews', reviewController.getUserReviews);
router.patch('/:id', reviewController.updateReview);
router.post('/:id/helpful', protect, reviewController.markHelpful);
router.post('/:id/report', protect, reviewController.reportReview);

// Store Owner routes
router.post('/:id/response', restrictTo('storeOwner'), reviewController.addStoreResponse);

// Admin routes
router.get('/admin/all', restrictTo('admin'), reviewController.getAllReviews);
router.patch('/admin/:id/moderate', restrictTo('admin'), reviewController.moderateReview);

module.exports = router;



