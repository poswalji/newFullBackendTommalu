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
/**
 * @openapi
 * /api/store-owner/profile:
 *   get:
 *     tags: [StoreOwner]
 *     summary: Get current store owner profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Store owner profile
 */
router.get('/profile', (req, res, next) => {
    req.params.id = req.user._id; // Current user ka ID set karo
    storeController.getStoreOwner(req, res, next);
});

// =============================================
// STORE MANAGEMENT ROUTES
// =============================================

// Get all stores of current owner
/**
 * @openapi
 * /api/store-owner/stores:
 *   get:
 *     tags: [StoreOwner]
 *     summary: List stores of current owner
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stores list
 */
router.get('/stores', storeController.getMyStores);

// Create new store
/**
 * @openapi
 * /api/store-owner/stores:
 *   post:
 *     tags: [StoreOwner]
 *     summary: Create a new store (goes through verification)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeName, address, phone, licenseNumber, licenseType, category]
 *             properties:
 *               storeName: { type: string }
 *               address: { type: string }
 *               phone: { type: string }
 *               licenseNumber: { type: string }
 *               licenseType: { type: string }
 *               category: { type: string }
 *               description: { type: string }
 *               openingTime: { type: string }
 *               closingTime: { type: string }
 *               deliveryFee: { type: number }
 *               minOrder: { type: number }
 *     responses:
 *       201:
 *         description: Store created (awaiting verification)
 */
router.post('/stores', storeController.createStore);

// Store operations by ID
/**
 * @openapi
 * /api/store-owner/stores/{id}:
 *   get:
 *     tags: [StoreOwner]
 *     summary: Get store by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Store details
 *   patch:
 *     tags: [StoreOwner]
 *     summary: Update store
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Store updated
 *   delete:
 *     tags: [StoreOwner]
 *     summary: Delete store
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Store deleted
 */
router.route('/stores/:id')
    .get(storeController.getStoreById)
    .patch(storeController.updateStore)
    .delete(storeController.deleteStore);

// Toggle store status
/**
 * @openapi
 * /api/store-owner/stores/{id}/toggle-status:
 *   patch:
 *     tags: [StoreOwner]
 *     summary: Toggle store open/closed
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Store status toggled
 */
router.patch('/stores/:id/toggle-status', storeController.toggleStoreStatus);

// =============================================
// MENU MANAGEMENT ROUTES
// =============================================

// Get store menu
/**
 * @openapi
 * /api/store-owner/stores/{storeId}/menu:
 *   get:
 *     tags: [StoreOwner]
 *     summary: Get menu items for a store
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Menu items
 */
router.get('/stores/:storeId/menu', menuItemController.getStoreMenu);

// Add menu item with image upload
/**
 * @openapi
 * /api/store-owner/stores/{storeId}/menu:
 *   post:
 *     tags: [StoreOwner]
 *     summary: Add a menu item (supports image upload)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               price: { type: number }
 *               category: { type: string }
 *               description: { type: string }
 *               available: { type: boolean }
 *               stockQuantity: { type: integer }
 *               image: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Menu item created
 */
router.post('/stores/:storeId/menu', uploadSingle, menuItemController.addMenuItem);

// Update menu item with image upload
/**
 * @openapi
 * /api/store-owner/menu/{menuItemId}:
 *   patch:
 *     tags: [StoreOwner]
 *     summary: Update a menu item
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menuItemId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               price: { type: number }
 *               category: { type: string }
 *               image: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Menu item updated
 */
router.patch('/menu/:menuItemId', uploadSingle, menuItemController.updateMenuItem);

// Delete menu item
/**
 * @openapi
 * /api/store-owner/menu/{menuItemId}:
 *   delete:
 *     tags: [StoreOwner]
 *     summary: Delete a menu item
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menuItemId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Menu item deleted
 */
router.delete('/menu/:menuItemId', menuItemController.deleteMenuItem);

// Toggle menu item availability
/**
 * @openapi
 * /api/store-owner/menu/{menuItemId}/toggle-availability:
 *   patch:
 *     tags: [StoreOwner]
 *     summary: Toggle menu item availability
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menuItemId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Availability toggled
 */
router.patch('/menu/:menuItemId/toggle-availability', menuItemController.toggleAvailability);

// =============================================
// ORDER MANAGEMENT ROUTES
// =============================================

// Get store orders
/**
 * @openapi
 * /api/store-owner/orders:
 *   get:
 *     tags: [StoreOwner]
 *     summary: List orders across owner stores
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Orders list
 */
router.get('/orders', orderController.getStoreOrders);

// Update order status
/**
 * @openapi
 * /api/store-owner/orders/{orderId}/status:
 *   patch:
 *     tags: [StoreOwner]
 *     summary: Update order status with optional reason
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [Pending, Confirmed, OutForDelivery, Delivered, Cancelled, Rejected] }
 *               rejectionReason: { type: string }
 *               cancellationReason: { type: string }
 *     responses:
 *       200:
 *         description: Order status updated
 */
router.patch('/orders/:orderId/status', orderController.updateOrderStatus);

module.exports = router;