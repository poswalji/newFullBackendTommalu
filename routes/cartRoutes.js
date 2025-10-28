// routes/cartRoutes.js - OPTIMIZED FOR SEPARATE CART MODEL

const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// ✅ BASIC CART OPERATIONS - PUBLIC (For both guests and logged-in users)
// These work for both guest sessions and authenticated users
router.post('/add', cartController.addToCart);
router.get('/', cartController.getCart);
router.patch('/update', cartController.updateCartQuantity);
router.delete('/remove', cartController.removeFromCart);
// router.delete('/clear', cartController.clearCart);

// ✅ AUTH-ONLY CART OPERATIONS
router.post('/merge', protect, restrictTo('customer'), cartController.mergeCart);
router.post('/apply-discount', protect, restrictTo('customer'), cartController.applyDiscount);
 router.delete('/remove-discount', protect, restrictTo('customer'), cartController.removeDiscount);

// ✅ CART MAINTENANCE & UTILITY ROUTES
router.get('/status', protect, restrictTo('customer'), cartController.getCartStatus);
router.post('/clean', protect, restrictTo('customer'), cartController.cleanCart);

module.exports = router;