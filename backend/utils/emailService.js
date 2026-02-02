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



    async sendWelcomeLead(email, name, propertyName = 'our property') {
        if (!this.transporter) {
            console.log('==================================================');
            console.log(`[EMAIL MOCK] Welcome/Interest Confirmation: ${email}`);
            console.log(`Name: ${name}`);
            console.log(`Property: ${propertyName}`);
            console.log('==================================================');
            return true;
        }
        try {
            await this.transporter.sendMail({
                from: `"Property Management System" <${process.env.SMTP_USER}>`,
                to: email,
                subject: 'Interest Received - Property Management System',
                html: this._getTemplate('Thanks for your interest!', `
                    <p>Hi ${name},</p>
                    <p>We have received your interest in <strong>${propertyName}</strong>.</p>
                    <p>One of our property managers will review your inquiry and get back to you shortly to schedule a viewing or answer any questions you may have.</p>
                    
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                        <p style="margin: 0; color: #1e293b; font-weight: 600;">Next Steps:</p>
                        <ul style="margin-top: 12px; color: #475569; padding-left: 20px;">
                            <li style="margin-bottom: 8px;">Wait for our call or email (usually within 24 hours)</li>
                            <li>Prepare any questions you might have about the property</li>
                        </ul>
                    </div>
                `)
            });
        } catch (e) {
            console.error('Error sending welcome lead email:', e);
        }
    }

    async sendTenantConfirmation(email, name) {
        if (!this.transporter) {
            console.log(`[EMAIL MOCK] Tenant Confirmation: ${email}`);
            return true;
        }
        try {
            await this.transporter.sendMail({
                from: `"Property Management System" <${process.env.SMTP_USER}>`,
                to: email,
                subject: 'Application Approved - Welcome Tenant',
                html: this._getTemplate('Welcome Home!', `
                    <p>Dear ${name},</p>
                    <p>Congratulations! Your tenant application has been approved.</p>
                    <p>We are thrilled to welcome you to your new home. You can now log in to your dashboard to view your lease details and manage your payments.</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Access Dashboard</a>
                    </div>
                `)
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
                from: `"Property Management System" <${process.env.SMTP_USER}>`,
                to: email,
                subject: 'Password Reset Request',
                html: this._getTemplate('Password Reset Request', `
                    <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>
                    <p>To reset your password, click the button below:</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Reset Password</a>
                    </div>
                    <p style="color: #94a3b8; font-size: 14px;">This link will expire in 1 hour.</p>
                `)
            });
            return true;
        } catch (error) {
            console.error('Error sending password reset email:', error);
            return false;
        }
    }

    async sendVerificationEmail(email, token) {
        const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${token}`;

        if (!this.transporter) {
            console.log(`[EMAIL MOCK] Verification Email for ${email}`);
            console.log(`Link: ${link}`);
            return true;
        }

        try {
            await this.transporter.sendMail({
                from: `"Property Management System" <${process.env.SMTP_USER}>`,
                to: email,
                subject: 'Verify Your Email Address',
                html: this._getTemplate('Verify Your Email', `
                    <p>Thank you for signing up. Please verify your email address to continue.</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${link}" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Verify Email</a>
                    </div>
                `)
            });
            return true;
        } catch (error) {
            console.error('Error sending verification email:', error);
            return false;
        }
    }

    async sendInvitationEmail(email, role, token) {
        const link = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/setup-password?token=${token}`;
        const subject = role === 'treasurer' ? 'Treasurer Invitation' : 'Tenant Access Invitation';
        const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);

        if (!this.transporter) {
            console.log(`[EMAIL MOCK] Invitation Email for ${email} (${role})`);
            console.log(`Link: ${link}`);
            return true;
        }

        try {
            await this.transporter.sendMail({
                from: `"Property Management System" <${process.env.SMTP_USER}>`,
                to: email,
                subject: subject,
                html: this._getTemplate('You have been invited!', `
                    <p>You have been invited to join the Property Management System as a <strong>${roleDisplay}</strong>.</p>
                    <p>To get started, please click the button below to set up your account and password:</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${link}" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Set Up Account</a>
                    </div>
                    <p style="color: #94a3b8; font-size: 14px;">This link will expire in 24 hours.</p>
                `)
            });
            return true;
        } catch (error) {
            console.error('Error sending invitation email:', error);
            return false;
        }
    }

    async sendVisitNotification(ownerEmail, visitDetails) {
        const { visitorName, visitorPhone, propertyName, unitNumber, scheduledDate, notes } = visitDetails;
        const dateStr = new Date(scheduledDate).toLocaleString();

        if (!this.transporter) {
            console.log('==================================================');
            console.log(`[EMAIL MOCK] Visit Notification to Owner: ${ownerEmail}`);
            console.log(`Visitor: ${visitorName} (${visitorPhone})`);
            console.log(`Property: ${propertyName} ${unitNumber ? '(Unit ' + unitNumber + ')' : ''}`);
            console.log(`Date: ${dateStr}`);
            console.log('==================================================');
            return true;
        }

        try {
            await this.transporter.sendMail({
                from: `"Property Management System" <${process.env.SMTP_USER}>`,
                to: ownerEmail,
                subject: `New Visit Scheduled: ${propertyName}`,
                html: this._getTemplate('New Visit Scheduled', `
                    <p>A new visit has been scheduled via the public listing.</p>
                    
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                        <h3 style="margin-top: 0; color: #1e293b; font-size: 16px; margin-bottom: 12px;">Property Details</h3>
                        <p style="margin: 4px 0; color: #475569;"><strong>Property:</strong> ${propertyName}</p>
                        ${unitNumber ? `<p style="margin: 4px 0; color: #475569;"><strong>Unit:</strong> ${unitNumber}</p>` : ''}
                        <p style="margin: 4px 0; color: #475569;"><strong>Scheduled For:</strong> ${dateStr}</p>
                    </div>

                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                        <h3 style="margin-top: 0; color: #1e293b; font-size: 16px; margin-bottom: 12px;">Visitor Details</h3>
                        <p style="margin: 4px 0; color: #475569;"><strong>Name:</strong> ${visitorName}</p>
                        <p style="margin: 4px 0; color: #475569;"><strong>Phone:</strong> ${visitorPhone}</p>
                        ${notes ? `<p style="margin: 4px 0; color: #475569;"><strong>Notes:</strong> ${notes}</p>` : ''}
                    </div>

                    <div style="text-align: center; margin-top: 32px;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/owner/leads" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">View in Dashboard</a>
                    </div>
                `)
            });
            return true;
        } catch (error) {
            console.error('Error sending visit notification:', error);
            // Don't fail the request if email fails
            return false;
        }
    }
    async sendInvoiceNotification(email, invoiceDetails) {
        const { amount, dueDate, month, year, invoiceId } = invoiceDetails;
        const formattedAmount = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
        const isLateFee = invoiceId === 'LATE-FEE' || (invoiceDetails.description && invoiceDetails.description.includes('Late Fee'));

        const subject = isLateFee
            ? `Late Fee Applied: ${month}/${year}`
            : `New Rent Invoice Received: ${month}/${year}`;

        const title = isLateFee ? 'Late Fee Notification' : 'New Invoice Available';
        const message = isLateFee
            ? 'A late fee has been applied to your account due to overdue payment.'
            : 'A new invoice has been generated for your rent.';

        if (!this.transporter) {
            console.log('==================================================');
            console.log(`[EMAIL MOCK] ${title} to: ${email}`);
            console.log(`Amount: ${formattedAmount}`);
            console.log(`Due Date: ${dueDate}`);
            console.log('==================================================');
            return true;
        }

        try {
            await this.transporter.sendMail({
                from: `"Property Management System" <${process.env.SMTP_USER}>`,
                to: email,
                subject: subject,
                html: this._getTemplate(title, `
                    <p>${message}</p>
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                         <p style="margin: 4px 0; color: #475569;"><strong>Invoice ID:</strong> #${invoiceId}</p>
                         <p style="margin: 4px 0; color: #475569;"><strong>Amount:</strong> ${formattedAmount}</p>
                         <p style="margin: 4px 0; color: #475569;"><strong>Due Date:</strong> ${dueDate}</p>
                    </div>
                     <div style="text-align: center; margin-top: 32px;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/tenant/payments" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">View & Pay</a>
                    </div>
                `)
            });
            return true;
        } catch (error) {
            console.error('Error sending invoice email:', error);
            return false;
        }
    }


    _getTemplate(title, content) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; }
                    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
                    .header { text-align: center; margin-bottom: 40px; }
                    .logo { font-size: 24px; font-weight: 700; color: #2563eb; text-decoration: none; }
                    .content { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; }
                    .footer { text-align: center; margin-top: 32px; color: #94a3b8; font-size: 14px; }
                </style>
            </head>
            <body style="background-color: #f1f5f9;">
                <div class="container">
                    <div class="header">
                        <a href="#" class="logo">PMS</a>
                    </div>
                    <div class="content">
                        <h1 style="margin-top: 0; color: #1e293b; font-size: 24px; margin-bottom: 24px;">${title}</h1>
                        ${content}
                    </div>
                    <div class="footer">
                        <p>© ${new Date().getFullYear()} Property Management System. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }
}

export default new EmailService();
