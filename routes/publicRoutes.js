const express = require('express');
const router = express.Router();
const menuItemController = require('../controllers/menuController');
const storeOwnerController = require('../controllers/storeOwnerController');
const orderController = require('../controllers/orderController');
const dailyMenuController = require('../controllers/dailyMenuController');

// ✅ PUBLIC ROUTES - No authentication needed

// Get all stores (Customers ko stores dikhane ke liye)
/**
 * @openapi
 * /api/public/stores:
 *   get:
 *     tags: [Public]
 *     summary: Get all stores
 *     responses:
 *       200:
 *         description: List of stores returned successfully
 */
router.get('/stores', storeOwnerController.getAllStores);

// Get store menu (Customers ko menu dikhane ke liye)
/**
 * @openapi
 * /api/public/stores/{storeId}/menu:
 *   get:
 *     tags: [Public]
 *     summary: Get menu for a store
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Store menu returned successfully
 */
router.get('/stores/:storeId/menu', menuItemController.getStoreMenu);

// Search stores (Optional)
/**
 * @openapi
 * /api/public/stores/search:
 *   get:
 *     tags: [Public]
 *     summary: Search stores
 *     parameters:
 *       - in: query
 *         name: q
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Stores matching search query
 */
router.get('/stores/search', storeOwnerController.searchStores);

// ✅ Public order tracking (for order confirmation page)
/**
 * @openapi
 * /api/public/orders/{orderId}:
 *   get:
 *     tags: [Public]
 *     summary: Get order tracking info (public)
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order tracking info
 */
router.get('/orders/:orderId', orderController.getOrderPublic);

// ✅ Get all products across stores (for browsing)
router.get('/products', menuItemController.getAllProducts);

// ✅ Get all categories
router.get('/categories', menuItemController.getAllCategories);

// ============================================
// HOMEMADE FOOD PUBLIC ROUTES
// ============================================

/**
 * @openapi
 * /api/public/homemade-food/todays-special:
 *   get:
 *     tags: [Public, Homemade Food]
 *     summary: Get today's special homemade food
 *     responses:
 *       200:
 *         description: Today's special food item
 */
router.get('/homemade-food/todays-special', dailyMenuController.getTodayMenu);
router.get('/homemade-food', dailyMenuController.getAllHomemadeFoods);
router.post('/homemade-food/order', dailyMenuController.placeOrder);
router.get('/homemade-food/order/track', dailyMenuController.trackOrder);

module.exports = router;