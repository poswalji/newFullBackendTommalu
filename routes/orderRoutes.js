const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// ✅ Public order routes (if needed)
// router.get('/public/:orderId', orderController.getOrderPublic);

// ✅ Protected order routes
router.use(protect);

// Admin or store owner can access all orders
router.get('/admin', restrictTo('admin', 'storeOwner'), orderController.getAllOrders);

module.exports = router;