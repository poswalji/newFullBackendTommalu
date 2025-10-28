const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeOwnerController');
const menuItemController = require('../controllers/menuController');
const orderController = require('../controllers/orderController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { uploadSingle } = require('../middleware/uploadMiddleware');

// ✅ Apply authentication to all store owner routes
router.use(protect, restrictTo('storeOwner'));

// =============================================
// STORE OWNER PROFILE
// =============================================

// Store Owner Profile - FIXED: params.id se user._id
router.get('/profile', (req, res, next) => {
    req.params.id = req.user._id; // Current user ka ID set karo
    storeController.getStoreOwner(req, res, next);
});

// =============================================
// STORE MANAGEMENT ROUTES
// =============================================

// Get all stores of current owner
router.get('/stores', storeController.getMyStores);

// Create new store
router.post('/stores', storeController.createStore);

// Store operations by ID
router.route('/stores/:id')
    .get(storeController.getStoreById)
    .patch(storeController.updateStore)
    .delete(storeController.deleteStore);

// Toggle store status
router.patch('/stores/:id/toggle-status', storeController.toggleStoreStatus);

// =============================================
// MENU MANAGEMENT ROUTES
// =============================================

// Get store menu
router.get('/stores/:storeId/menu', menuItemController.getStoreMenu);

// Add menu item with image upload
router.post('/stores/:storeId/menu', uploadSingle, menuItemController.addMenuItem);

// Update menu item with image upload
router.patch('/menu/:menuItemId', uploadSingle, menuItemController.updateMenuItem);

// Delete menu item
router.delete('/menu/:menuItemId', menuItemController.deleteMenuItem);

// Toggle menu item availability
router.patch('/menu/:menuItemId/toggle-availability', menuItemController.toggleAvailability);

// =============================================
// ORDER MANAGEMENT ROUTES
// =============================================

// Get store orders
router.get('/orders', orderController.getStoreOrders);

// Update order status
router.patch('/orders/:orderId/status', orderController.updateOrderStatus);

module.exports = router;