require('dotenv').config();
const nodemailer = require('nodemailer');

const testEmail = async () => {
    console.log('Testing Email Configuration...');
    console.log('User:', process.env.EMAIL_USER ? 'Set' : 'Missing');
    console.log('Pass:', process.env.EMAIL_PASSWORD ? 'Set' : 'Missing');
    console.log('Service:', process.env.EMAIL_SERVICE || 'gmail');

    try {
        const transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });

        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, // Send to self
            subject: 'Test Email from Tommalu Debugger',
            text: 'If you receive this, email configuration is working correctly.'
        });

        console.log('✅ Email sent successfully!');
        console.log('Message ID:', info.messageId);
    } catch (error) {
        console.error('❌ Email sending failed:', error.message);
        if (error.code === 'EAUTH') {
            console.error('Hint: Check if App Password is correct or 2FA is enabled.');
        }
    }
};

testEmail();
