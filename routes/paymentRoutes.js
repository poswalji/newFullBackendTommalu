const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Customer routes
router.get('/customer/payments', restrictTo('customer'), paymentController.getUserPayments);

// Store Owner routes
router.get('/store/payments', restrictTo('storeOwner'), paymentController.getStorePayments);
router.get('/store/payouts/eligible/:storeId', restrictTo('storeOwner'), paymentController.getEligiblePayouts);

// Admin routes
router.get('/admin/payments', restrictTo('admin'), paymentController.getAllPayments);
router.get('/admin/payments/:id', restrictTo('admin'), paymentController.getPaymentById);

// Payment creation (called from order flow)
router.post('/', restrictTo('customer'), paymentController.createPayment);
router.patch('/:paymentId/status', restrictTo('customer', 'admin'), paymentController.updatePaymentStatus);
router.post('/:paymentId/refund', restrictTo('admin'), paymentController.processRefund);

module.exports = router;

