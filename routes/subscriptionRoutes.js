const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { protect } = require('../middleware/authMiddleware');

// Public/User Routes
router.use(protect); // Protect all routes below (or qualify individually)
router.post('/request', subscriptionController.createSubscription);
router.get('/my-subscriptions', subscriptionController.getUserSubscriptions);

// Admin Routes (Should be protected in production)
router.get('/', subscriptionController.getAllSubscriptions);
router.patch('/:id/status', subscriptionController.updateSubscriptionStatus);
router.get('/daily-deliveries', subscriptionController.getDailyDeliveries);

module.exports = router;
