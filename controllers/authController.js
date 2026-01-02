const User = require("../models/user");
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');
const crypto = require('crypto');

// Google OAuth client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.registerUser = asyncHandler(async (req, res, next) => {
    const { name, email, password, role, phone, addresses } = req.body;

    // ✅ Add basic validation
    if (!name || !email || !password) {
        return next(new AppError('Please provide name, email, and password', 400));
    }

    // ✅ Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return next(new AppError('User already exists with this email', 400));
    }

    // ✅ Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // ✅ Create user with additional fields (support addresses array)
    const userData = {
        name,
        email,
        password,
        role: role || 'customer',
        emailVerified: false,
        verificationCode,
        verificationCodeExpires
    };
    if (phone) userData.phone = phone;
    if (addresses && Array.isArray(addresses)) {
        userData.addresses = addresses;
    }

    const user = await User.create(userData);

    // ✅ Send verification email
    try {
        await sendVerificationEmail(user.email, verificationCode);
    } catch (emailError) {
        // If email fails, delete the user and return error
        await User.findByIdAndDelete(user._id);
        return next(new AppError('Failed to send verification email. Please try again.', 500));
    }

    // ✅ Generate verification token (30 minutes expiry)
    const verificationToken = jwt.sign(
        { id: user._id, email: user.email, type: 'email_verification' },
        process.env.JWT_SECRET,
        { expiresIn: '30m' }
    );

    res.status(201).json({
        success: true,
        message: 'Registration successful. Please check your email for verification code.',
        verificationToken,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            emailVerified: user.emailVerified
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

    // ✅ Check if email is verified
    if (!user.emailVerified) {
        // Generate new verification code if expired
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationCodeExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        user.verificationCode = verificationCode;
        user.verificationCodeExpires = verificationCodeExpires;
        await user.save({ validateBeforeSave: false });

        // Send verification email
        try {
            await sendVerificationEmail(user.email, verificationCode);
        } catch (emailError) {
            console.error('Error sending verification email:', emailError);
        }

        // Generate verification token
        const verificationToken = jwt.sign(
            { id: user._id, email: user.email, type: 'email_verification' },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );

        // Return error with verification token
        const error = new AppError('Please verify your email first. Verification code has been sent to your email.', 403);
        error.verificationToken = verificationToken;
        return next(error);
    }

    // Generate tokens
    const token = user.generateAuthToken();
    const refreshToken = jwt.sign(
        { id: user._id, type: 'refresh' },
        process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET,
        { expiresIn: process.env.REFRESH_JWT_EXPIRES_IN || '30d' }
    );

    // Cookie Options
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    };

    // If rememberMe is true, set maxAge to 30 days. Otherwise, leave undefined (Session Cookie)
    if (req.body.rememberMe) {
        cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000;
    }

    // Set httpOnly refresh cookie
    res.cookie('refreshToken', refreshToken, cookieOptions);

    res.status(200).json({
        success: true,
        token,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            addresses: user.addresses || []
        }
    });
});

// ✅ NEW: Logout User
exports.logoutUser = asyncHandler(async (req, res, next) => {
    // Since we're using JWT tokens (stateless), logout is mainly client-side
    // But we provide an endpoint for consistency
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
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

        let email, name, picture, googleId;
        const { jwtDecode } = require('jwt-decode');

        // Try decoding as ID Token (JWT)
        try {
            const decoded = jwtDecode(googleToken);
            if (decoded && decoded.email) {
                email = decoded.email;
                name = decoded.name;
                picture = decoded.picture;
                googleId = decoded.sub;
            }
        } catch (e) {
            // Ignore decode error, likely an access token
        }

        // If decoding failed to get email, try fetching as Access Token
        if (!email) {
            console.log('⚠️ Token is not a JWT, trying as Access Token...');
            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${googleToken}` }
            });

            if (!response.ok) {
                console.error('❌ Google UserInfo Fetch Failed:', response.status, response.statusText);
                const errorText = await response.text();
                console.error('❌ Google Error Body:', errorText);
                throw new Error('Failed to verify access token with Google');
            }

            const userData = await response.json();
            email = userData.email;
            name = userData.name;
            picture = userData.picture;
            googleId = userData.sub;
        }

        if (!email) {
            throw new Error('Could not retrieve email from Google token');
        }

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
                phone: "" // Default values
            });
            console.log('✅ New Google user created:', user.email);
        }

        // ✅ Generate unique JWT token
        const token = user.generateAuthToken();
        const refreshToken = jwt.sign(
            { id: user._id, type: 'refresh' },
            process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET,
            { expiresIn: process.env.REFRESH_JWT_EXPIRES_IN || '30d' }
        );

        console.log('✅ Google auth successful for:', user.email);
        console.log('🔑 Token generated for user:', user._id);

        // Set httpOnly refresh cookie
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/'
        });

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
                addresses: user.addresses || [],
                avatar: user.avatar
            }
        });

    } catch (error) {
        console.error('❌ Google auth error:', error);
        console.error('❌ Error details:', error.message);
        return next(new AppError('Google authentication failed: ' + error.message, 401));
    }
});

// ✅ Get current user profile
exports.getMe = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user._id);
    if (!user) return next(new AppError('User not found', 404));
    res.status(200).json({
        success: true,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            addresses: user.addresses || [],
            status: user.status,
            adminRole: user.adminRole
        }
    });
});

// ✅ Update current user profile
exports.updateProfile = asyncHandler(async (req, res, next) => {
    const allowed = ['name', 'phone', 'addresses'];
    const updates = {};
    allowed.forEach((k) => {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    if (!user) return next(new AppError('User not found', 404));
    res.status(200).json({
        success: true,
        data: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            addresses: user.addresses || []
        }
    });
});

// ✅ Change password
exports.changePassword = asyncHandler(async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return next(new AppError('currentPassword and newPassword are required', 400));
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return next(new AppError('User not found', 404));

    const ok = await user.correctPassword(currentPassword);
    if (!ok) return next(new AppError('Current password is incorrect', 400));

    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Password updated successfully' });
});

// ✅ Delete account
exports.deleteAccount = asyncHandler(async (req, res, next) => {
    await User.findByIdAndDelete(req.user._id);
    res.status(204).json({ success: true, data: null });
});

// ✅ Verify Email with Code
exports.verifyEmail = asyncHandler(async (req, res, next) => {
    const { code, verificationToken } = req.body;

    if (!code || !verificationToken) {
        return next(new AppError('Verification code and token are required', 400));
    }

    // Verify JWT token
    let decoded;
    try {
        decoded = jwt.verify(verificationToken, process.env.JWT_SECRET);
        if (decoded.type !== 'email_verification') {
            return next(new AppError('Invalid verification token', 400));
        }
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('Verification token has expired. Please register again.', 401));
        }
        return next(new AppError('Invalid verification token', 400));
    }

    // Find user and verification code
    const user = await User.findById(decoded.id).select('+verificationCode +verificationCodeExpires');

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    // Check if email is already verified
    if (user.emailVerified) {
        return next(new AppError('Email is already verified', 400));
    }

    // Check if verification code matches
    if (user.verificationCode !== code) {
        return next(new AppError('Invalid verification code', 400));
    }

    // Check if verification code has expired
    if (user.verificationCodeExpires < new Date()) {
        // Generate new code
        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        const newExpires = new Date(Date.now() + 30 * 60 * 1000);

        user.verificationCode = newCode;
        user.verificationCodeExpires = newExpires;
        await user.save({ validateBeforeSave: false });

        // Send new verification email
        try {
            await sendVerificationEmail(user.email, newCode);
        } catch (emailError) {
            console.error('Error sending verification email:', emailError);
        }

        return next(new AppError('Verification code has expired. A new code has been sent to your email.', 400));
    }

    // Verify the email
    user.emailVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save({ validateBeforeSave: false });

    // Generate auth token for the user and refresh token
    const token = user.generateAuthToken();
    const refreshToken = jwt.sign(
        { id: user._id, type: 'refresh' },
        process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET,
        { expiresIn: process.env.REFRESH_JWT_EXPIRES_IN || '30d' }
    );

    // Set httpOnly refresh cookie
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/'
    });

    res.status(200).json({
        success: true,
        message: 'Email verified successfully',
        token,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            emailVerified: user.emailVerified,
            addresses: user.addresses || []
        }
    });
});

// ✅ Refresh Access Token using httpOnly cookie
exports.refreshToken = asyncHandler(async (req, res, next) => {
    const token = req.cookies && req.cookies.refreshToken;
    if (!token) return next(new AppError('Refresh token missing', 401));

    try {
        const decoded = jwt.verify(token, process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET);
        if (!decoded || decoded.type !== 'refresh') return next(new AppError('Invalid refresh token', 401));

        const user = await User.findById(decoded.id);
        if (!user) return next(new AppError('User not found', 401));

        // Issue new access token and rotate refresh token
        const newAccessToken = user.generateAuthToken();
        const newRefreshToken = jwt.sign(
            { id: user._id, type: 'refresh' },
            process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET,
            { expiresIn: process.env.REFRESH_JWT_EXPIRES_IN || '30d' }
        );

        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/'
        });

        res.status(200).json({ success: true, token: newAccessToken });
    } catch (err) {
        return next(new AppError('Invalid or expired refresh token', 401));
    }
});

// ✅ Resend Verification Code
exports.resendVerificationCode = asyncHandler(async (req, res, next) => {
    const { verificationToken } = req.body;

    if (!verificationToken) {
        return next(new AppError('Verification token is required', 400));
    }

    // Verify JWT token
    let decoded;
    try {
        decoded = jwt.verify(verificationToken, process.env.JWT_SECRET);
        if (decoded.type !== 'email_verification') {
            return next(new AppError('Invalid verification token', 400));
        }
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('Verification token has expired. Please register again.', 401));
        }
        return next(new AppError('Invalid verification token', 400));
    }

    // Find user
    const user = await User.findById(decoded.id);

    if (!user) {
        return next(new AppError('User not found', 404));
    }

    // Check if email is already verified
    if (user.emailVerified) {
        return next(new AppError('Email is already verified', 400));
    }

    // Generate new verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const verificationCodeExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    user.verificationCode = verificationCode;
    user.verificationCodeExpires = verificationCodeExpires;
    await user.save({ validateBeforeSave: false });

    // Send verification email
    try {
        await sendVerificationEmail(user.email, verificationCode);
    } catch (emailError) {
        return next(new AppError('Failed to send verification email. Please try again.', 500));
    }

    res.status(200).json({
        success: true,
        message: 'Verification code has been resent to your email'
    });
});

// ✅ Forgot Password
exports.forgotPassword = asyncHandler(async (req, res, next) => {
    const { email } = req.body;

    console.log(`🔍 Forgot password requested for: ${email}`);

    if (!email) {
        return next(new AppError('Please provide your email address', 400));
    }

    // Find user by email
    const user = await User.findOne({ email });

    console.log(`👤 User found in DB: ${user ? 'YES' : 'NO'}`);

    // Don't reveal if user exists or not for security
    if (!user) {
        console.log('⚠️ User not found. Sending fake success.');
        // Still return success to prevent email enumeration
        return res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.'
        });
    }

    // Check if user has a password (Google users might not have one)
    console.log(`🔑 User has password field: ${user.password ? 'YES' : 'NO'}`);
    if (!user.password) {
        console.log('⚠️ User has no password (likely generic/Google). Sending fake success.');
        return res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.'
        });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save hashed token and expiry (1 hour)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save({ validateBeforeSave: false });

    console.log('📧 Sending reset email...');
    // Send password reset email
    try {
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
        await sendPasswordResetEmail(user.email, resetToken, resetUrl);
        console.log('✅ Reset email sent successfully.');
    } catch (emailError) {
        console.error('❌ Failed to send reset email:', emailError);
        // Reset the token fields if email fails
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save({ validateBeforeSave: false });

        return next(new AppError('Failed to send password reset email. Please try again later.', 500));
    }

    res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
    });
});

// ✅ Reset Password
exports.resetPassword = asyncHandler(async (req, res, next) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return next(new AppError('Token and password are required', 400));
    }

    // Validate password length
    if (password.length < 6) {
        return next(new AppError('Password must be at least 6 characters long', 400));
    }

    // Hash the token to compare with stored token
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { $gt: new Date() }
    }).select('+resetPasswordToken +resetPasswordExpires');

    if (!user) {
        return next(new AppError('Invalid or expired reset token', 400));
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Generate new auth token
    const authToken = user.generateAuthToken();
    const refreshToken = jwt.sign(
        { id: user._id, type: 'refresh' },
        process.env.REFRESH_JWT_SECRET || process.env.JWT_SECRET,
        { expiresIn: process.env.REFRESH_JWT_EXPIRES_IN || '30d' }
    );

    // Set httpOnly refresh cookie
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/'
    });

    res.status(200).json({
        success: true,
        message: 'Password has been reset successfully',
        token: authToken,
        user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            addresses: user.addresses || []
        }
    });
});