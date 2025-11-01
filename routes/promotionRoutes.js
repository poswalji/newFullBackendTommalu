const express = require('express');
const router = express.Router();
const promotionController = require('../controllers/promotionController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// Public routes
router.get('/active', promotionController.getActivePromotions);
router.post('/validate', promotionController.validatePromotion);

// Authenticated routes
router.use(protect);

// Customer routes
router.post('/apply', restrictTo('customer'), promotionController.applyPromotion);

// Admin routes
router.post('/admin', restrictTo('admin'), promotionController.createPromotion);
router.get('/admin/all', restrictTo('admin'), promotionController.getAllPromotions);
router.get('/admin/:id', restrictTo('admin'), promotionController.getPromotionById);
router.get('/admin/:id/stats', restrictTo('admin'), promotionController.getPromotionStats);
router.patch('/admin/:id', restrictTo('admin'), promotionController.updatePromotion);
router.patch('/admin/:id/toggle', restrictTo('admin'), promotionController.togglePromotion);
router.delete('/admin/:id', restrictTo('admin'), promotionController.deletePromotion);

module.exports = router;


