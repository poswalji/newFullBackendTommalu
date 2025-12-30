const express = require('express');
const router = express.Router();
const menuItemController = require('../controllers/menuController');
const storeOwnerController = require('../controllers/storeOwnerController');
const orderController = require('../controllers/orderController');
const homemadeFoodController = require('../controllers/homemadeFoodController');

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
router.get('/homemade-food/todays-special', homemadeFoodController.getTodaysSpecial);

/**
 * @openapi
 * /api/public/homemade-food:
 *   get:
 *     tags: [Public, Homemade Food]
 *     summary: Get all active homemade food items
 *     responses:
 *       200:
 *         description: List of active homemade food items
 */
router.get('/homemade-food', homemadeFoodController.getActiveHomemadeFoods);

/**
 * @openapi
 * /api/public/homemade-food/order:
 *   post:
 *     tags: [Public, Homemade Food]
 *     summary: Submit a homemade food order (no auth required)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerName
 *               - mobileNumber
 *               - street
 *               - city
 *               - pincode
 *               - foodItemId
 *               - quantity
 *             properties:
 *               customerName:
 *                 type: string
 *               mobileNumber:
 *                 type: string
 *               email:
 *                 type: string
 *               street:
 *                 type: string
 *               landmark:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               pincode:
 *                 type: string
 *               foodItemId:
 *                 type: string
 *               quantity:
 *                 type: number
 *               specialInstructions:
 *                 type: string
 *               preferredDeliverySlot:
 *                 type: string
 *                 enum: [morning, afternoon, evening, any]
 *               paymentMethod:
 *                 type: string
 *                 enum: [cash_on_delivery, online, upi]
 *     responses:
 *       201:
 *         description: Order placed successfully
 */
router.post('/homemade-food/order', homemadeFoodController.submitOrder);

/**
 * @openapi
 * /api/public/homemade-food/order/track:
 *   get:
 *     tags: [Public, Homemade Food]
 *     summary: Track homemade food order
 *     parameters:
 *       - in: query
 *         name: orderNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: mobileNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order tracking details
 */
// ✅ Public Stats
/**
 * @openapi
 * /api/public/stats:
 *   get:
 *     tags: [Public]
 *     summary: Get public statistics
 *     responses:
 *       200:
 *         description: Stats returned successfully
 */
router.get('/stats', storeOwnerController.getPublicStats);

router.get('/homemade-food/order/track', homemadeFoodController.trackOrder);

module.exports = router;