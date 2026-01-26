/**
 * Mock Email Service
 * Logs emails to the console instead of sending them.
 */
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

class EmailService {
    constructor() {
        this.transporter = null;
        this.initTransporter();
    }

    initTransporter() {
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
        }
    }

    async sendCredentials(email, role, password) {
        // Fallback to console log if no transporter (dev mode or missing creds)
        if (!this.transporter) {
            console.log('==================================================');
            console.log(`[EMAIL MOCK] Sending credentials to ${email}`);
            console.log(`Role: ${role}`);
            console.log(`Password: ${password}`);
            console.log('==================================================');
            console.warn('NOTE: Real email not sent. Configure SMTP_USER and SMTP_PASS in .env to enable.');
            return true;
        }

        try {
            const mailOptions = {
                from: process.env.SMTP_USER,
                to: email,
                subject: 'Property Management System - Account Created',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Welcome to Property Management System</h2>
                        <p>Your account has been successfully created.</p>
                        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Role:</strong> ${role}</p>
                            <p style="margin: 5px 0;"><strong>Username:</strong> ${email}</p>
                            <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
                        </div>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Login to Dashboard</a>
                        </div>
                        <p>Please login and change your password immediately.</p>
                        <p style="color: #666; font-size: 12px; margin-top: 30px;">This is an automated message, please do not reply.</p>
                    </div>
                `
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log(`Email sent: ${info.messageId}`);
            return true;
        } catch (error) {
            console.error('Error sending email:', error);
            // Log credentials to console as backup mechanism if email fails
            console.log('--- BACKUP CREDENTIAL LOG ---');
            console.log(`User: ${email}, Pass: ${password}`);
            return false;
        }
    }

    async sendWelcomeLead(email, name) {
        if (!this.transporter) {
            console.log(`[EMAIL MOCK] Welcome Lead: ${email}`);
            return true;
        }
        try {
            await this.transporter.sendMail({
                from: process.env.SMTP_USER,
                to: email,
                subject: 'Welcome to Property Management System',
                html: `<h1>Welcome ${name}!</h1><p>Thanks for your interest. We will contact you soon.</p>`
            });
        } catch (e) {
            console.error(e);
        }
    }

    async sendTenantConfirmation(email, name) {
        if (!this.transporter) {
            console.log(`[EMAIL MOCK] Tenant Confirmation: ${email}`);
            return true;
        }
        try {
            await this.transporter.sendMail({
                from: process.env.SMTP_USER,
                to: email,
                subject: 'Application Approved - Welcome Tenant',
                html: `<h1>Congratulations ${name}!</h1><p>Your application has been approved. You are now a tenant.</p>`
            });
        } catch (e) {
            console.error(e);
        }
    }
    async sendPasswordResetEmail(email, resetToken) {
        if (!this.transporter) {
            console.log('==================================================');
            console.log(`[EMAIL MOCK] Password Reset for ${email}`);
            console.log(`Token: ${resetToken}`);
            console.log(`Link: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`);
            console.log('==================================================');
            return true;
        }

        try {
            const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`;

            await this.transporter.sendMail({
                from: process.env.SMTP_USER,
                to: email,
                subject: 'Password Reset Request',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Password Reset Request</h2>
                        <p>You requested a password reset. Click the button below to reset your password.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${resetLink}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
                        </div>
                        <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
                        <p style="color: #666; font-size: 12px; margin-top: 30px;">Link expires in 1 hour.</p>
                    </div>
                `
            });
            return true;
        } catch (error) {
            console.error('Error sending password reset email:', error);
            return false;
        }
    }
}

export default new EmailService();
