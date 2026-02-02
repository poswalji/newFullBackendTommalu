const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { protect } = require('../middleware/authMiddleware');

// Public/User Routes
router.use(protect);

// Customer: Subscription Requests
router.post('/request', subscriptionController.createSubscriptionRequest);
router.get('/my-requests', subscriptionController.getMySubscriptionRequests);
router.get('/my-subscriptions', subscriptionController.getUserSubscriptions);

// Admin Routes
// 1. Manage Requests
router.get('/requests', subscriptionController.getAllSubscriptionRequests); // ?status=pending
router.post('/requests/:id/approve', subscriptionController.approveSubscriptionRequest);
router.post('/requests/:id/reject', subscriptionController.rejectSubscriptionRequest);

// 2. Manage Active Subscriptions
router.get('/', subscriptionController.getAllActiveSubscriptions);
router.patch('/:id/status', subscriptionController.updateSubscriptionStatus); // Pause/Resume
router.patch('/:id/period', subscriptionController.updateSubscriptionPeriod); // Extend/Reduce
router.patch('/:id/price', subscriptionController.updateSubscriptionPrice);   // Update Price

module.exports = router;
