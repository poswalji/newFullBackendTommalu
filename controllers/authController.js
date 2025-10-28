const User = require("../models/user");
const asyncHandler = require('../utils/asyncHandler');

const AppError = require('../utils/appError');
const { OAuth2Client } = require('google-auth-library');

// Google OAuth client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.registerUser = asyncHandler(async (req, res, next) => {
    const { name, email, password, role, phone, address } = req.body;

    // ✅ Add basic validation
    if (!name || !email || !password) {
        return next(new AppError('Please provide name, email, and password', 400));
    }

    // ✅ Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return next(new AppError('User already exists with this email', 400));
    }

    // ✅ Create user with additional fields
    const userData = { name, email, password, role: role || 'customer' };
    if (phone) userData.phone = phone;
    if (address) userData.address = address;

    const user = await User.create(userData);
    
    // ✅ Generate token after registration
    const token = user.generateAuthToken();

    res.status(201).json({
        success: true,
        token,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            address: user.address
        }
    });
});

exports.loginUser = asyncHandler(async (req, res, next) => {
    const { email, password } = req.body;

    // ✅ Check if email and password are provided
    if (!email || !password) {
        return next(new AppError('Please provide email and password', 400));
    }

    // Check if user exists && password is correct
    const user = await User.findOne({ email }).select('+password');
    
    if (!user || !(await user.correctPassword(password))) {
        return next(new AppError('Incorrect email or password', 401));
    }

    // Generate token
    const token = user.generateAuthToken();

    res.status(200).json({
        success: true,
        token,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            address: user.address
        }
    });
});

// ✅ NEW: Logout User
exports.logoutUser = asyncHandler(async (req, res, next) => {
    // Since we're using JWT tokens (stateless), logout is mainly client-side
    // But we provide an endpoint for consistency
    res.status(200).json({
        success: true,
        message: 'Logged out successfully'
    });
});

// ✅ NEW: Google Authentication
//// ✅ IMPROVED: Google Authentication with Real User Data
// ✅ UPDATED: Google Authentication with Unique Data
exports.googleAuth = asyncHandler(async (req, res, next) => {
    const { token: googleToken } = req.body;

    console.log('🔐 Google auth called with token:', googleToken ? 'YES' : 'NO');

    if (!googleToken) {
        return next(new AppError('Google token is required', 400));
    }

    try {
        console.log('🔄 Processing Google authentication...');
        
        // ✅ Decode the Google token to get unique user info
        const { jwtDecode } = require('jwt-decode');
        const decoded = jwtDecode(googleToken);
        
        const { email, name, picture, sub: googleId } = decoded;
        
        console.log('👤 Google user info:', { email, name, googleId });

        // ✅ Generate unique password for each Google user
        const uniquePassword = 'google_' + googleId + '_' + Date.now();
        
        // Check if user already exists
        let user = await User.findOne({ 
            $or: [
                { email: email },
                { googleId: googleId }
            ]
        });

        if (user) {
            console.log('✅ Existing user found:', user.email);
            // Update user data if needed
            if (!user.googleId) {
                user.googleId = googleId;
                await user.save();
            }
        } else {
            console.log('🆕 Creating new user from Google...');
            // ✅ Create new user with unique data
            user = await User.create({
                name: name || 'Google User',
                email: email,
                password: uniquePassword, // ✅ Unique password for each user
                googleId: googleId, // ✅ Unique Google ID
                role: 'customer',
                isEmailVerified: true,
                avatar: picture,
                phone: "", // Default values
                address: ""
            });
            console.log('✅ New Google user created:', user.email);
        }

        // ✅ Generate unique JWT token
        const token = user.generateAuthToken();

        console.log('✅ Google auth successful for:', user.email);
        console.log('🔑 Token generated for user:', user._id);

        res.status(200).json({
            success: true,
            message: 'Google authentication successful',
            token: token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone || '',
                address: user.address || '',
                avatar: user.avatar
            }
        });

    } catch (error) {
        console.error('❌ Google auth error:', error);
        console.error('❌ Error details:', error.message);
        return next(new AppError('Google authentication failed: ' + error.message, 401));
    }
});