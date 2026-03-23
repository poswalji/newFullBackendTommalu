const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, requireAdmin, restrictAdminTo } = require('../middleware/authMiddleware');

// All admin routes require authenticated admin
router.use(protect, requireAdmin);

// Users management
/**
 * @openapi
 * /api/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List users with optional filters
 *     description: View all users (customers and store owners) with pagination and filters.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100 }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [customer, storeOwner, admin, delivery] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, suspended] }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *       - in: query
 *         name: phone
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Users list
 */
router.get('/users', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.listUsers);
/**
 * @openapi
 * /api/admin/users/{id}/suspend:
 *   patch:
 *     tags: [Admin]
 *     summary: Suspend a user
 *     description: Suspends a user account; user cannot perform restricted actions until reactivated.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User suspended
 */
router.patch('/users/:id/suspend', restrictAdminTo('superAdmin'), adminController.suspendUser);
/**
 * @openapi
 * /api/admin/users/{id}/reactivate:
 *   patch:
 *     tags: [Admin]
 *     summary: Reactivate a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User reactivated
 */
router.patch('/users/:id/reactivate', restrictAdminTo('superAdmin'), adminController.reactivateUser);
/**
 * @openapi
 * /api/admin/users/{id}/reset-password:
 *   post:
 *     tags: [Admin]
 *     summary: Reset a user password manually
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
 *             required: [newPassword]
 *             properties:
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset
 */
router.post('/users/:id/reset-password', restrictAdminTo('superAdmin'), adminController.resetPassword);
/**
 * @openapi
 * /api/admin/users/{id}/history/orders:
 *   get:
 *     tags: [Admin]
 *     summary: Get a user's order history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Orders history
 */
router.get('/users/:id/history/orders', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getUserOrders);
/**
 * @openapi
 * /api/admin/users/{id}/history/transactions:
 *   get:
 *     tags: [Admin]
 *     summary: Get a user's transactions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Transactions history
 */
router.get('/users/:id/history/transactions', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getUserTransactions);



// Analytics & Reports
router.get('/analytics/dashboard', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getDashboardAnalytics);
router.get('/analytics/orders', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getOrderAnalytics);
// router.get('/analytics/stores', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getStoreAnalytics);
router.get('/analytics/revenue', restrictAdminTo('superAdmin'), adminController.getRevenueAnalytics);
router.get('/reports/export', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.exportReport);

// Menu Oversight
router.get('/menu/items', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.listMenuItems);
router.get('/menu/items/:id', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getMenuItemById);
router.patch('/menu/items/:id/disable', restrictAdminTo('superAdmin'), adminController.disableMenuItem);

// Dispute Resolution
router.get('/disputes', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.listDisputes);
router.get('/disputes/:id', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.getDisputeById);
router.post('/disputes/:id/resolve', restrictAdminTo('superAdmin'), adminController.resolveDispute);
router.post('/disputes/:id/escalate', restrictAdminTo('superAdmin'), adminController.escalateDispute);
router.post('/disputes/:id/close', restrictAdminTo('superAdmin', 'supportAdmin'), adminController.closeDispute);



// Order Override
router.post('/orders/:id/cancel', restrictAdminTo('superAdmin'), adminController.cancelOrderAdmin);



module.exports = router;


