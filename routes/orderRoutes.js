const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

// ✅ Public order routes (if needed)
// router.get('/public/:orderId', orderController.getOrderPublic);

// ✅ Protected order routes
router.use(protect);

// Customer
/**
 * @openapi
 * /api/orders:
 *   post:
 *     tags: [Orders]
 *     summary: Place new order
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Order created
 */
router.post('/', restrictTo('customer'), orderController.createOrder);
/**
 * @openapi
 * /api/orders:
 *   get:
 *     tags: [Orders]
 *     summary: Get user’s order history
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of orders
 */
router.get('/', restrictTo('customer'), orderController.getCustomerOrders);

// ✅ IMPORTANT: Place specific routes BEFORE parameterized routes
// This prevents "/admin" from matching "/:id"
/**
 * @openapi
 * /api/orders/admin:
 *   get:
 *     tags: [Orders]
 *     summary: Get all orders (admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Orders
 */
router.get('/admin', restrictTo('admin'), orderController.getAllOrders);

/**
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get order details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order
 */
router.get('/:id', orderController.getOrderById); // owner/admin/delivery/storeOwner validated inside
/**
 * @openapi
 * /api/orders/{id}/status:
 *   put:
 *     tags: [Orders]
 *     summary: Update order status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated
 */
router.put('/:id/status', restrictTo('admin', 'delivery'), orderController.updateOrderStatusAdmin);

// ✅ Cancel order (customer)
/**
 * @openapi
 * /api/orders/{id}/cancel:
 *   post:
 *     tags: [Orders]
 *     summary: Cancel order (customer)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cancellationReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order cancelled
 */
router.post('/:id/cancel', restrictTo('customer'), orderController.cancelOrder);

module.exports = router;