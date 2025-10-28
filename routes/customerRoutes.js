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

// ✅ Protect all customer routes
router.use(protect, restrictTo('customer'));

// ✅ Update routes to use authenticated user (no need for customerId in URL)
router.get('/profile', customerController.getCustomer);
router.patch('/profile', customerController.updateCustomer);
router.delete('/profile', customerController.deleteCustomer);

// ✅ Order routes - use authenticated user
router.post('/orders', orderController.createOrder);
router.get('/orders', orderController.getCustomerOrders);


// Existing routes ke saath
router.post('/orders/from-cart', orderController.createOrderFromCart); // ✅ New route  

module.exports = router;