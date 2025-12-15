const nodemailer = require('nodemailer');
const frontendUrl = process.env.FRONTEND_URL || "https://tommalu.com"
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

// Send password reset email
exports.sendPasswordResetEmail = async (email, resetToken, resetUrl) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Tommalu" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Request - Tommalu',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px;">Password Reset Request</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              We received a request to reset your password. Click the button below to create a new password:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                Reset Password
              </a>
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              Or copy and paste this link into your browser:
            </p>
            <p style="color: #007bff; font-size: 12px; word-break: break-all; background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
              ${resetUrl}
            </p>
            <p style="color: #999; font-size: 14px; line-height: 1.6; margin-top: 20px;">
              <strong>Important:</strong> This link will expire in 1 hour for security reasons.
            </p>
            <p style="color: #999; font-size: 14px; line-height: 1.6;">
              If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
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
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

// Send order tracking email to customer
exports.sendOrderTrackingEmail = async (email, orderData) => {
  try {
    const transporter = createTransporter();
    const { orderId, status, orderNumber, customerName, finalPrice, deliveryAddress } = orderData;

    const statusMessages = {
      'Pending': 'Your order has been placed and is awaiting confirmation',
      'Confirmed': 'Your order has been confirmed and is being prepared',
      'OutForDelivery': 'Your order is out for delivery and will arrive soon',
      'Delivered': 'Your order has been delivered successfully',
      'Cancelled': 'Your order has been cancelled',
      'Rejected': 'Your order has been rejected'
    };

    const statusMessage = statusMessages[status] || 'Your order status has been updated';

    const mailOptions = {
      from: `"Tommalu" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Order #${orderNumber} Status Update - Tommalu`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px;">Order Status Update</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Hello ${customerName || 'Customer'},
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              ${statusMessage}
            </p>
            <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; margin: 30px 0;">
              <p style="margin: 5px 0; color: #333;"><strong>Order Number:</strong> #${orderNumber}</p>
              <p style="margin: 5px 0; color: #333;"><strong>Status:</strong> ${status}</p>
              <p style="margin: 5px 0; color: #333;"><strong>Total Amount:</strong> ₹${finalPrice}</p>
              ${deliveryAddress ? `
                <p style="margin: 5px 0; color: #333;"><strong>Delivery Address:</strong></p>
                <p style="margin: 5px 0; color: #666; padding-left: 20px;">
                  ${deliveryAddress.street}, ${deliveryAddress.city}<br>
                  ${deliveryAddress.pincode}${deliveryAddress.state ? `, ${deliveryAddress.state}` : ''}
                </p>
              ` : ''}
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              You can track your order status in your account dashboard.
              <a href="${frontendUrl}/order/${orderId}" style="color: #007bff; text-decoration: none;">Track your order</a>
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
    console.log('Order tracking email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending order tracking email:', error);
    throw new Error('Failed to send order tracking email');
  }
};

// Send delivery assignment email to admin
exports.sendDeliveryAssignmentEmail = async (email, deliveryData) => {
  try {
    const transporter = createTransporter();
    const { orderId, orderNumber, customerName, customerPhone, finalPrice, deliveryAddress } = deliveryData;

    const mailOptions = {
      from: `"Tommalu" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `🚚 New Delivery Assignment - Order #${orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px;">🚚 New Delivery Assignment</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Hello Admin,
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              A new order is ready for delivery. Please proceed with the delivery assignment.
            </p>
            <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #ffc107;">
              <p style="margin: 5px 0; color: #333;"><strong>Order Number:</strong> #${orderNumber}</p>
              <p style="margin: 5px 0; color: #333;"><strong>Customer Name:</strong> ${customerName || 'N/A'}</p>
              ${customerPhone ? `<p style="margin: 5px 0; color: #333;"><strong>Customer Phone:</strong> ${customerPhone}</p>` : ''}
              <p style="margin: 5px 0; color: #333;"><strong>Total Amount:</strong> ₹${finalPrice}</p>
              ${deliveryAddress ? `
                <p style="margin: 10px 0 5px 0; color: #333;"><strong>Delivery Address:</strong></p>
                <p style="margin: 5px 0; color: #666; padding-left: 20px;">
                  ${deliveryAddress.street || ''}, ${deliveryAddress.city || ''}<br>
                  ${deliveryAddress.pincode || ''}${deliveryAddress.state ? `, ${deliveryAddress.state}` : ''}
                </p>
              ` : ''}
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              Please update the order status in the admin dashboard once delivery is completed.
              <a href="${frontendUrl}/order/${orderId}" style="color: #007bff; text-decoration: none;">Track your order</a>
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
    console.log('Delivery assignment email sent to admin:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending delivery assignment email:', error);
    throw new Error('Failed to send delivery assignment email');
  }
};

// Send new order email to store owner
exports.sendNewOrderEmailToStoreOwner = async (email, orderData) => {
  try {
    const transporter = createTransporter();
    const { orderId, orderNumber, customerName, finalPrice, items } = orderData;

    const mailOptions = {
      from: `"Tommalu" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `🆕 New Order Received - Order #${orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px;">New Order Received</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Hello Store Owner,
            </p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              You have received a new order. Please confirm and prepare the order.
            </p>
            <div style="background-color: #e7f3ff; padding: 20px; border-radius: 8px; margin: 30px 0;">
              <p style="margin: 5px 0; color: #333;"><strong>Order Number:</strong> #${orderNumber}</p>
              <p style="margin: 5px 0; color: #333;"><strong>Customer:</strong> ${customerName || 'N/A'}</p>
              <p style="margin: 5px 0; color: #333;"><strong>Total Amount:</strong> ₹${finalPrice}</p>
            </div>
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              Please log in to your dashboard to view order details and update the status.
              <a href="${frontendUrl}/store-owner/orders" style="color: #007bff; text-decoration: none;">View orders</a>
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
    console.log('New order email sent to store owner:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending new order email to store owner:', error);
    throw new Error('Failed to send new order email');
  }
};

// Send homemade food order notification to admin
exports.sendHomemadeFoodOrderNotification = async (email, orderData) => {
  try {
    const transporter = createTransporter();
    const { orderNumber, customerName, mobileNumber, foodName, quantity, finalAmount, deliveryAddress, specialInstructions } = orderData;

    const mailOptions = {
      from: `"Tommalu" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `🍽️ New Homemade Food Order - #${orderNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #FF6B35; margin: 0;">🍽️ New Homemade Food Order!</h2>
            </div>
            
            <div style="background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%); padding: 20px; border-radius: 8px; margin: 20px 0; color: white;">
              <p style="margin: 0; font-size: 14px; opacity: 0.9;">Order Number</p>
              <h1 style="margin: 5px 0 0 0; font-size: 28px;">#${orderNumber}</h1>
            </div>

            <div style="background-color: #fff8f0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FF6B35;">
              <h3 style="color: #333; margin: 0 0 15px 0;">📦 Order Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Food Item:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: bold; text-align: right;">${foodName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Quantity:</td>
                  <td style="padding: 8px 0; color: #333; font-weight: bold; text-align: right;">${quantity} Thali(s)</td>
                </tr>
                <tr style="border-top: 1px dashed #ddd;">
                  <td style="padding: 12px 0; color: #333; font-weight: bold;">Total Amount:</td>
                  <td style="padding: 12px 0; color: #FF6B35; font-weight: bold; text-align: right; font-size: 20px;">₹${finalAmount}</td>
                </tr>
              </table>
            </div>

            <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #007bff;">
              <h3 style="color: #333; margin: 0 0 15px 0;">👤 Customer Details</h3>
              <p style="margin: 5px 0; color: #333;"><strong>Name:</strong> ${customerName}</p>
              <p style="margin: 5px 0; color: #333;"><strong>Mobile:</strong> <a href="tel:${mobileNumber}" style="color: #007bff; text-decoration: none;">${mobileNumber}</a></p>
            </div>

            <div style="background-color: #f0fff0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
              <h3 style="color: #333; margin: 0 0 15px 0;">📍 Delivery Address</h3>
              <p style="margin: 5px 0; color: #666;">
                ${deliveryAddress.street}${deliveryAddress.landmark ? `, ${deliveryAddress.landmark}` : ''}<br>
                ${deliveryAddress.city}${deliveryAddress.state ? `, ${deliveryAddress.state}` : ''} - ${deliveryAddress.pincode}
              </p>
            </div>

            ${specialInstructions ? `
            <div style="background-color: #fffbf0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <h3 style="color: #333; margin: 0 0 10px 0;">📝 Special Instructions</h3>
              <p style="margin: 0; color: #666; font-style: italic;">"${specialInstructions}"</p>
            </div>
            ` : ''}

            <div style="text-align: center; margin-top: 30px;">
              <a href="${frontendUrl}/admin/homemade-food" style="background-color: #FF6B35; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; font-size: 16px;">
                View in Admin Panel
              </a>
            </div>

            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
              © ${new Date().getFullYear()} Tommalu. All rights reserved.
            </p>
          </div>
        </div>
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Homemade food order notification sent to admin:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending homemade food order notification:', error);
    throw new Error('Failed to send homemade food order notification');
  }
};

// Send homemade food order status update to customer
exports.sendHomemadeFoodOrderStatusUpdate = async (email, orderData) => {
  try {
    const transporter = createTransporter();
    const { orderNumber, customerName, foodName, status, finalAmount } = orderData;

    const statusConfig = {
      'pending': { emoji: '⏳', color: '#f0ad4e', message: 'Your order is pending confirmation' },
      'confirmed': { emoji: '✅', color: '#5cb85c', message: 'Your order has been confirmed!' },
      'preparing': { emoji: '👨‍🍳', color: '#FF6B35', message: 'Your delicious food is being prepared' },
      'ready': { emoji: '🍽️', color: '#5bc0de', message: 'Your food is ready and waiting for pickup/delivery' },
      'out_for_delivery': { emoji: '🚀', color: '#5cb85c', message: 'Your order is out for delivery!' },
      'delivered': { emoji: '🎉', color: '#28a745', message: 'Your order has been delivered. Enjoy your meal!' },
      'cancelled': { emoji: '❌', color: '#d9534f', message: 'Your order has been cancelled' },
      'refund_initiated': { emoji: '💰', color: '#f0ad4e', message: 'Refund has been initiated for your order' },
      'refund_completed': { emoji: '✅', color: '#28a745', message: 'Refund has been completed for your order' },
      'payment_received': { emoji: '💳', color: '#5cb85c', message: 'Payment received successfully!' }
    };

    const config = statusConfig[status] || { emoji: '📦', color: '#666', message: 'Your order status has been updated' };

    const mailOptions = {
      from: `"Tommalu" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `${config.emoji} Order #${orderNumber} - ${status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px; text-align: center;">
              ${config.emoji} Order Status Update
            </h2>
            
            <p style="color: #666; font-size: 16px; line-height: 1.6;">
              Hello ${customerName},
            </p>
            
            <div style="background-color: ${config.color}20; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${config.color};">
              <p style="margin: 0; color: ${config.color}; font-size: 18px; font-weight: bold;">
                ${config.message}
              </p>
            </div>

            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 5px 0; color: #333;"><strong>Order Number:</strong> #${orderNumber}</p>
              <p style="margin: 5px 0; color: #333;"><strong>Food Item:</strong> ${foodName}</p>
              <p style="margin: 5px 0; color: #333;"><strong>Total Amount:</strong> ₹${finalAmount}</p>
              <p style="margin: 5px 0; color: #333;"><strong>Current Status:</strong> 
                <span style="color: ${config.color}; font-weight: bold;">
                  ${status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              </p>
            </div>

            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              You can track your order anytime by visiting our website with your order number and mobile number.
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
    console.log('Homemade food order status update sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending homemade food order status update:', error);
    throw new Error('Failed to send order status update');
  }
};
