const nodemailer = require('nodemailer');

// Create reusable transporter object using SMTP transport
const createTransporter = () => {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // Your Gmail email
      pass: process.env.EMAIL_PASSWORD // Your Gmail app password
    }
  });
};

// Send verification email with 6-digit code
exports.sendVerificationEmail = async (email, code) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Tommalu" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Email Verification - Tommalu',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px;">Welcome to Tommalu!</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Thank you for registering. Please verify your email address by entering the code below:
            </p>
            <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
              <h1 style="color: #333; font-size: 36px; letter-spacing: 8px; margin: 0;">${code}</h1>
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              This code will expire in 30 minutes. If you didn't create an account, please ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              © ${new Date().getFullYear()} Tommalu. All rights reserved.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
};

// Send password reset email (for future use)
exports.sendPasswordResetEmail = async (email, resetToken) => {
  try {
    const transporter = createTransporter();

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"Tommalu" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset - Tommalu',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Reset Your Password</h2>
          <p>Click the link below to reset your password:</p>
          <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
          <p>This link will expire in 1 hour.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

