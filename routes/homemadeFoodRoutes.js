const express = require('express');
const router = express.Router();
const dailyMenuController = require('../controllers/dailyMenuController');
const { protect, restrictTo, isLoggedIn } = require('../middleware/authMiddleware'); // Assuming auth logic exists

// Public Routes
router.get('/today', dailyMenuController.getTodayMenu);
router.post('/order', isLoggedIn, dailyMenuController.placeOrder);

// Admin Routes (Protected)
// Assuming 'storeOwner' or 'admin' role is required
router.use(protect); // Ensure user is logged in
router.use(restrictTo('admin', 'storeOwner')); // Restrict to admin/owner

router.patch('/update', dailyMenuController.updateMenu);
router.patch('/order/:id/confirm', dailyMenuController.confirmOrder);
router.get('/dashboard', dailyMenuController.getDashboardStats);

// Generic CRUD Routes (Merged)
// Food Items
router.get('/', dailyMenuController.getAllHomemadeFoods);
router.post('/', dailyMenuController.createHomemadeFood);
router.patch('/:id', dailyMenuController.updateHomemadeFood);
router.delete('/:id', dailyMenuController.deleteHomemadeFood);

// Analytics
router.get('/analytics', dailyMenuController.getAnalytics);

// Orders
router.get('/orders', dailyMenuController.getAllOrders);
router.get('/orders/:id', dailyMenuController.getOrderById);
router.patch('/orders/:id/status', dailyMenuController.updateOrderStatus);

module.exports = router;
