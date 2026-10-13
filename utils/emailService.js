const nodemailer = require('nodemailer');
const frontendUrl = process.env.FRONTEND_URL || "https://tommalu.com"
const dns = require('dns');

// Dynamically resolved IPv6 host for Gmail SMTP to bypass IPv4 firewall/ISP drops on Windows
let activeGmailHost = '2404:6800:4013:813::6c';

const resolveGmailHost = async () => {
  try {
    const addresses = await dns.promises.resolve6('smtp.gmail.com');
    if (addresses && addresses.length > 0) {
      activeGmailHost = addresses[0];
    }
  } catch (err) {
    // Keep fallback
  }
  return activeGmailHost;
};

// Initial background resolve and periodic refresh
resolveGmailHost().catch(() => {});
setInterval(() => resolveGmailHost().catch(() => {}), 15 * 60 * 1000);

// Create reusable transporter object using SMTP transport
const createTransporter = () => {
  const service = process.env.EMAIL_SERVICE || 'gmail';
  if (service.toLowerCase() === 'gmail') {
    return nodemailer.createTransport({
      host: activeGmailHost,
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER, // Your Gmail email
        pass: process.env.EMAIL_PASSWORD // Your Gmail app password
      },
      tls: {
        servername: 'smtp.gmail.com',
        rejectUnauthorized: false
      }
    });
  }

  return nodemailer.createTransport({
    service,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
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
      replyTo: process.env.EMAIL_USER,
      text: `Hello,\n\nWe received a request to reset your password. Click the link below to create a new password:\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.\n\nTommalu Team`,
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

    const statusConfig = {
      'Pending':        { emoji: '⏳', color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', label: 'Pending',          message: 'We have received your order and it is awaiting confirmation.' },
      'Confirmed':      { emoji: '✅', color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Confirmed',         message: 'Great news! Your order has been confirmed and is being prepared.' },
      'OutForDelivery': { emoji: '🛵', color: '#7c3aed', bg: '#faf5ff', border: '#c4b5fd', label: 'Out for Delivery', message: 'Your order is on its way! Our delivery partner is heading to your address.' },
      'Delivered':      { emoji: '🎉', color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Delivered',        message: 'Your order has been delivered successfully. We hope you enjoy your meal!' },
      'Cancelled':      { emoji: '❌', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: 'Cancelled',        message: 'Your order has been cancelled. If you have any questions, please contact us.' },
      'Rejected':       { emoji: '🚫', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: 'Rejected',         message: 'Your order has been rejected by the restaurant.' },
    };

    const cfg = statusConfig[status] || { emoji: '📦', color: '#6b7280', bg: '#f9fafb', border: '#d1d5db', label: status, message: 'Your order status has been updated.' };

    const mailOptions = {
      from: `"Tommalu 🍱" <${process.env.EMAIL_USER}>`,
      to: email,
      replyTo: process.env.EMAIL_USER,
      subject: `${cfg.emoji} Order #${orderNumber} – ${cfg.label} | Tommalu`,
      text: `Hello ${customerName || 'Customer'},\n\n${cfg.message}\n\nOrder Number: #${orderNumber}\nStatus: ${cfg.label}\nTotal: ₹${finalPrice || '0'}\n\nTrack your order in your Tommalu account.\n\nThank you for choosing Tommalu!`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Order ${cfg.label} – Tommalu</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#ea580c 0%,#f97316 100%);padding:36px 40px;text-align:center;">
            <p style="margin:0 0 6px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">🍱 Tommalu</p>
            <p style="margin:0;font-size:14px;color:#fed7aa;font-weight:500;">Delicious Food, Delivered</p>
          </td>
        </tr>

        <!-- Status Badge -->
        <tr>
          <td style="padding:32px 40px 0;text-align:center;">
            <div style="display:inline-block;background:${cfg.bg};border:2px solid ${cfg.border};border-radius:50px;padding:12px 28px;margin-bottom:8px;">
              <span style="font-size:22px;">${cfg.emoji}</span>
              <span style="font-size:18px;font-weight:700;color:${cfg.color};margin-left:8px;">${cfg.label}</span>
            </div>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:24px 40px 0;text-align:center;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Hello, ${customerName || 'Customer'}!</p>
            <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.6;max-width:460px;margin:0 auto;">${cfg.message}</p>
          </td>
        </tr>

        <!-- Order Card -->
        <tr>
          <td style="padding:28px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="background:#1f2937;padding:14px 20px;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Order Summary</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
                        <p style="margin:0;font-size:13px;color:#9ca3af;">Order Number</p>
                        <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#111827;">#${orderNumber}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
                        <p style="margin:0;font-size:13px;color:#9ca3af;">Status</p>
                        <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:${cfg.color};">${cfg.label}</p>
                      </td>
                    </tr>
                    ${deliveryAddress ? `
                    <tr>
                      <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
                        <p style="margin:0;font-size:13px;color:#9ca3af;">Delivery Address</p>
                        <p style="margin:4px 0 0;font-size:15px;color:#374151;">${deliveryAddress.street}, ${deliveryAddress.city}</p>
                        <p style="margin:2px 0 0;font-size:14px;color:#6b7280;">${deliveryAddress.pincode}</p>
                      </td>
                    </tr>
                    ` : ''}
                    <tr>
                      <td style="padding:12px 0;">
                        <p style="margin:0;font-size:13px;color:#9ca3af;">Total Amount</p>
                        <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#ea580c;">₹${finalPrice}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA Button -->
        <tr>
          <td style="padding:0 40px 32px;text-align:center;">
            <a href="${frontendUrl}/customer/orders" style="display:inline-block;background:linear-gradient(135deg,#ea580c,#f97316);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:50px;letter-spacing:0.3px;">
              Track My Order →
            </a>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #f0f0f0;margin:0;"/></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">Need help? Reply to this email or WhatsApp us.</p>
            <p style="margin:0;font-size:12px;color:#d1d5db;">© ${new Date().getFullYear()} Tommalu. All rights reserved.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
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
      replyTo: process.env.EMAIL_USER,
      subject: `🍽️ New Homemade Food Order - #${orderNumber}`,
      text: `New Homemade Food Order Received!\n\nOrder #${orderNumber}\nItem: ${foodName} x ${quantity}\nTotal Amount: ₹${finalAmount}\nCustomer: ${customerName} (${mobileNumber})\nAddress: ${deliveryAddress.street}, ${deliveryAddress.city} - ${deliveryAddress.pincode}\nSpecial Instructions: ${specialInstructions || 'None'}\n\nPlease check the admin panel for details.`,
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
      'pending':          { emoji: '⏳', color: '#f59e0b', bg: '#fffbeb', border: '#fcd34d', label: 'Pending',          message: 'We have received your order and it is awaiting confirmation from the kitchen.' },
      'confirmed':        { emoji: '✅', color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Confirmed',         message: 'Great news! Your order has been confirmed and the kitchen is getting ready to prepare it.' },
      'preparing':        { emoji: '👨‍🍳', color: '#ea580c', bg: '#fff7ed', border: '#fdba74', label: 'Preparing',       message: 'Our chef is preparing your delicious homemade meal with love and care.' },
      'ready':            { emoji: '🍽️', color: '#0284c7', bg: '#f0f9ff', border: '#7dd3fc', label: 'Ready',           message: 'Your food is ready! It will be picked up for delivery very soon.' },
      'out_for_delivery': { emoji: '🛵', color: '#7c3aed', bg: '#faf5ff', border: '#c4b5fd', label: 'Out for Delivery', message: 'Your order is on its way! Our delivery partner is heading to your address.' },
      'delivered':        { emoji: '🎉', color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Delivered',        message: 'Your order has been delivered. We hope you enjoy your meal! Please rate your experience.' },
      'cancelled':        { emoji: '❌', color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', label: 'Cancelled',        message: 'Your order has been cancelled. If you have any questions, please contact us.' },
    };

    const cfg = statusConfig[status] || { emoji: '📦', color: '#6b7280', bg: '#f9fafb', border: '#d1d5db', label: status, message: 'Your order status has been updated.' };

    const mailOptions = {
      from: `"Tommalu 🍱" <${process.env.EMAIL_USER}>`,
      to: email,
      replyTo: process.env.EMAIL_USER,
      subject: `${cfg.emoji} Order #${orderNumber} – ${cfg.label} | Tommalu`,
      text: `Hello ${customerName},\n\n${cfg.message}\n\nOrder Number: #${orderNumber}\nFood Item: ${foodName}\nTotal Amount: ₹${finalAmount}\n\nTrack your order in your Tommalu account.\n\nThank you for choosing Tommalu!`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Order ${cfg.label} – Tommalu</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#ea580c 0%,#f97316 100%);padding:36px 40px;text-align:center;">
            <p style="margin:0 0 6px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">🍱 Tommalu</p>
            <p style="margin:0;font-size:14px;color:#fed7aa;font-weight:500;">Homemade Food, Delivered with Love</p>
          </td>
        </tr>

        <!-- Status Badge -->
        <tr>
          <td style="padding:32px 40px 0;text-align:center;">
            <div style="display:inline-block;background:${cfg.bg};border:2px solid ${cfg.border};border-radius:50px;padding:12px 28px;margin-bottom:8px;">
              <span style="font-size:22px;">${cfg.emoji}</span>
              <span style="font-size:18px;font-weight:700;color:${cfg.color};margin-left:8px;">${cfg.label}</span>
            </div>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:24px 40px 0;text-align:center;">
            <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Hello, ${customerName}!</p>
            <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.6;max-width:460px;margin:0 auto;">${cfg.message}</p>
          </td>
        </tr>

        <!-- Order Card -->
        <tr>
          <td style="padding:28px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="background:#1f2937;padding:14px 20px;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Order Summary</p>
                </td>
              </tr>
              <tr>
                <td style="padding:20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">
                        <p style="margin:0;font-size:13px;color:#9ca3af;">Order Number</p>
                        <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#111827;">#${orderNumber}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
                        <p style="margin:0;font-size:13px;color:#9ca3af;">Food Item</p>
                        <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#374151;">${foodName}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:12px 0;">
                        <p style="margin:0;font-size:13px;color:#9ca3af;">Total Amount</p>
                        <p style="margin:4px 0 0;font-size:20px;font-weight:800;color:#ea580c;">₹${finalAmount}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA Button -->
        <tr>
          <td style="padding:0 40px 32px;text-align:center;">
            <a href="${frontendUrl}/customer/orders" style="display:inline-block;background:linear-gradient(135deg,#ea580c,#f97316);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:50px;letter-spacing:0.3px;">
              Track My Order →
            </a>
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #f0f0f0;margin:0;"/></td></tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;color:#9ca3af;">Need help? Reply to this email or WhatsApp us.</p>
            <p style="margin:0;font-size:12px;color:#d1d5db;">© ${new Date().getFullYear()} Tommalu. All rights reserved.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
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
