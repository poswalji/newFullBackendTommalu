const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
// const authController = require('../controllers/authController');

// Public/User Routes
router.post('/request', subscriptionController.createSubscription);

// Admin Routes (Should be protected in production)
router.get('/', subscriptionController.getAllSubscriptions);
router.patch('/:id/status', subscriptionController.updateSubscriptionStatus);
router.get('/daily-deliveries', subscriptionController.getDailyDeliveries);

module.exports = router;
