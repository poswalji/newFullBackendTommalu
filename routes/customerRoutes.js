// const express=require('express');
// const router=express.Router();
// const customerController=require('../controllers/customerController');
// const authController=require('../controllers/authController');
// const orderController=require('../controllers/orderController');
// const { route } = require('./storeOwnerRoutes');

// router.get('/getCustomer/:customerId',customerController.getCustomer);
// router.patch('/updateCustomer/:customerId',customerController.updateCustomer);
// router.delete('/deleteCustomer/:customerId',customerController.deleteCustomer);


// router.post('/createOrder',orderController.createOrder);
// router.get('/getCustomerOrders/:customerId',orderController.getCustomerOrders);


// module.exports=router;
const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const orderController = require('../controllers/orderController');
const { protect, restrictTo } = require('../middleware/authMiddleware'); // ✅ Import middleware

router.use(protect, restrictTo('customer'));

/**
 * @openapi
 * /api/customer/profile:
 *   get:
 *     tags: [Customer]
 *     summary: Get customer profile
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Customer profile
 */
router.get('/profile', customerController.getCustomer);
/**
 * @openapi
 * /api/customer/profile:
 *   patch:
 *     tags: [Customer]
 *     summary: Update customer profile
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Updated profile
 */
router.patch('/profile', customerController.updateCustomer);
router.delete('/profile', customerController.deleteCustomer);

/**
 * @openapi
 * /api/customer/orders:
 *   post:
 *     tags: [Customer]
 *     summary: Create a new order
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: Order created
 */
router.post('/orders', orderController.createOrder);
/**
 * @openapi
 * /api/customer/orders:
 *   get:
 *     tags: [Customer]
 *     summary: Get customer orders
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of orders
 */
router.get('/orders', orderController.getCustomerOrders);


// Existing routes ke saath
/**
 * @openapi
 * /api/customer/orders/from-cart:
 *   post:
 *     tags: [Customer]
 *     summary: Create order from cart
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: Order created from cart
 */
router.post('/orders/from-cart', orderController.createOrderFromCart); // ✅ New route  

module.exports = router;