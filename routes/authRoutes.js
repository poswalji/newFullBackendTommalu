// const express=require('express');
// const router=express.Router();
// const authController=require('../controllers/authController');

// //common routes for all users
// router.post('/register',authController.registerUser);
// // router.post('/login',authController.loginUser); 
// // router.post('logout',authController.logoutUser);

// module.exports=router;
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Common routes for all users
router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser); //  Add login route
 router.post('/logout', authController.logoutUser);
 router.post('/google',authController.googleAuth);
module.exports = router;