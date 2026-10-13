require('dotenv').config();
const nodemailer = require('nodemailer');
const dns = require('dns').promises;

const testEmail = async () => {
    console.log('Testing Email Configuration...');
    console.log('User:', process.env.EMAIL_USER ? 'Set' : 'Missing');
    console.log('Pass:', process.env.EMAIL_PASSWORD ? 'Set' : 'Missing');

    try {
        let host = 'smtp.gmail.com';
        try {
            const addresses = await dns.resolve6('smtp.gmail.com');
            if (addresses && addresses.length > 0) {
                host = addresses[0];
                console.log('Resolved IPv6 for Gmail SMTP:', host);
            }
        } catch (dnsErr) {
            console.log('Could not resolve IPv6, falling back to hostname:', dnsErr.message);
        }

        const transporter = nodemailer.createTransport({
            host: host,
            port: 465,
            secure: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            tls: {
                servername: 'smtp.gmail.com',
                rejectUnauthorized: false
            }
        });

        const info = await transporter.sendMail({
            from: `"Tommalu 🍱" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: 'Test Email from Tommalu System',
            text: 'If you receive this, Gmail delivery is 100% working correctly!'
        });

        console.log('✅ Email sent successfully!');
        console.log('Message ID:', info.messageId);
    } catch (error) {
        console.error('❌ Email sending failed:', error.message);
    }
};

testEmail();

