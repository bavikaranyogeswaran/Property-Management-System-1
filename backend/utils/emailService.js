/**
 * Mock Email Service
 * Logs emails to the console instead of sending them.
 */
import nodemailer from 'nodemailer';
import { config } from '../config/config.js';
import logger from './logger.js';
import { fromCents } from './moneyUtils.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    if (config.smtp.user && config.smtp.pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
      });
    }
  }

  async sendWelcomeLead(
    email,
    name,
    propertyName = 'our property',
    portalToken = null
  ) {
    const portalUrl = portalToken
      ? `${config.frontendUrl}/lead/portal?token=${portalToken}`
      : null;

    if (!this.transporter) {
      logger.info('==================================================');
      logger.info(`[EMAIL MOCK] Welcome/Interest Confirmation: ${email}`);
      logger.info(`Name: ${name}`);
      logger.info(`Property: ${propertyName}`);
      if (portalUrl) {
        logger.info(`Portal Link: ${portalUrl}`);
      }
      logger.info('==================================================');
      return true;
    }
    try {
      const portalLinkHtml = portalUrl
        ? `
                  <div style="text-align: center; margin: 24px 0;">
                      <a href="${portalUrl}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">View Your Application</a>
                  </div>
                  <p style="text-align: center; color: #64748b; font-size: 13px;">Or copy this link: <a href="${portalUrl}" style="color: #2563eb;">${portalUrl}</a></p>
              `
        : '';

      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Interest Received - Property Management System',
        html: this._getTemplate(
          'Thanks for your interest!',
          `
                  <p>Hi ${name},</p>
                  <p>We have received your interest in <strong>${propertyName}</strong>.</p>
                  <p>One of our property managers will review your inquiry and get back to you shortly to schedule a viewing or answer any questions you may have.</p>
                  
                  ${portalLinkHtml}

                  <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                      <p style="margin: 0; color: #1e293b; font-weight: 600;">Next Steps:</p>
                      <ul style="margin-top: 12px; color: #475569; padding-left: 20px;">
                          <li style="margin-bottom: 8px;">Click the link above to view your application and chat with the property owner</li>
                          <li>Prepare any questions you might have about the property</li>
                      </ul>
                  </div>
              `
        ),
      });
    } catch (e) {
      logger.error('Error sending welcome lead email:', e);
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
        html: this._getTemplate(
          'Welcome Home!',
          `
                    <p>Dear ${name},</p>
                    <p>Congratulations! Your tenant application has been approved.</p>
                    <p>We are thrilled to welcome you to your new home. You can now log in to your dashboard to view your lease details and manage your payments.</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${config.frontendUrl}/login" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Access Dashboard</a>
                    </div>
                `
        ),
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
      console.log(
        `Link: ${config.frontendUrl}/reset-password?token=${resetToken}`
      );
      console.log('==================================================');
      return true;
    }

    try {
      const resetLink = `${config.frontendUrl}/reset-password?token=${resetToken}`;

      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Password Reset Request',
        html: this._getTemplate(
          'Password Reset Request',
          `
                    <p>We received a request to reset your password. If you didn't make this request, you can safely ignore this email.</p>
                    <p>To reset your password, click the button below:</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Reset Password</a>
                    </div>
                    <p style="color: #94a3b8; font-size: 14px;">This link will expire in 1 hour.</p>
                `
        ),
      });
      return true;
    } catch (error) {
      logger.error('Error sending password reset email:', error);
      return false;
    }
  }

  async sendVerificationEmail(email, token) {
    const link = `${config.frontendUrl}/verify-email?token=${token}`;

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
        html: this._getTemplate(
          'Verify Your Email',
          `
                    <p>Thank you for signing up. Please verify your email address to continue.</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${link}" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Verify Email</a>
                    </div>
                `
        ),
      });
      return true;
    } catch (error) {
      console.error('Error sending verification email:', error);
      return false;
    }
  }

  async sendInvitationEmail(email, role, token) {
    const link = `${config.frontendUrl}/setup-password?token=${token}`;
    const subject =
      role === 'treasurer'
        ? 'Treasurer Invitation'
        : 'Tenant Access Invitation';
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
        html: this._getTemplate(
          'You have been invited!',
          `
                    <p>You have been invited to join the Property Management System as a <strong>${roleDisplay}</strong>.</p>
                    <p>To get started, please click the button below to set up your account and password:</p>
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${link}" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Set Up Account</a>
                    </div>
                    <p style="color: #94a3b8; font-size: 14px;">This link will expire in 24 hours.</p>
                `
        ),
      });
      return true;
    } catch (error) {
      console.error('Error sending invitation email:', error);
      return false;
    }
  }

  async sendDepositMagicLink(
    email,
    name,
    propertyName,
    unitNumber,
    amount,
    magicToken
  ) {
    const link = `${config.frontendUrl}/pay/${magicToken}`;
    const formattedAmount = new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
    }).format(fromCents(amount));

    if (!this.transporter) {
      console.log('==================================================');
      console.log(`[EMAIL MOCK] Magic Link (Deposit Reservation) for ${email}`);
      console.log(`Property: ${propertyName}, Unit: ${unitNumber}`);
      console.log(`Amount: ${formattedAmount}`);
      console.log(`Magic Link: ${link}`);
      console.log('==================================================');
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Security Deposit Payment: ${propertyName}`,
        html: this._getTemplate(
          'Reserve Your Unit',
          `
                    <p>Hi ${name},</p>
                    <p>Great news! Your application for <strong>${propertyName}</strong> (Unit ${unitNumber}) has been approved.</p>
                    <p>To formally reserve this unit and finalize your lease, please pay the security deposit of <strong>${formattedAmount}</strong> using the secure payment link below:</p>
                    
                    <div style="text-align: center; margin: 32px 0;">
                        <a href="${link}" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Pay Security Deposit</a>
                    </div>

                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                         <p style="margin: 0; color: #475569; font-size: 14px;">Once your payment is verified, you will receive an invitation to set up your official tenant account and sign the lease agreement.</p>
                    </div>

                    <p style="color: #94a3b8; font-size: 14px;">This link is unique to your application and should not be shared.</p>
                `
        ),
      });
      return true;
    } catch (error) {
      console.error('Error sending deposit magic link email:', error);
      return false;
    }
  }

  async sendVisitNotification(ownerEmail, visitDetails) {
    const {
      visitorName,
      visitorPhone,
      propertyName,
      unitNumber,
      scheduledDate,
      notes,
    } = visitDetails;
    const dateStr = new Date(scheduledDate).toLocaleString();

    if (!this.transporter) {
      console.log(
        `Property: ${propertyName} ${unitNumber ? '(Unit ' + unitNumber + ')' : ''}`
      );
      console.log(`Date: ${dateStr}`);
      console.log('==================================================');
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: ownerEmail,
        subject: `New Visit Scheduled: ${propertyName}`,
        html: this._getTemplate(
          'New Visit Scheduled',
          `
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
                        <a href="${config.frontendUrl}/owner/leads" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">View in Dashboard</a>
                    </div>
                `
        ),
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
    const formattedAmount = new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
    }).format(fromCents(amount));
    const isLateFee =
      invoiceId === 'LATE-FEE' ||
      (invoiceDetails.description &&
        invoiceDetails.description.includes('Late Fee'));

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
        html: this._getTemplate(
          title,
          `
                    <p>${message}</p>
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                         <p style="margin: 4px 0; color: #475569;"><strong>Invoice ID:</strong> #${invoiceId}</p>
                         <p style="margin: 4px 0; color: #475569;"><strong>Amount:</strong> ${formattedAmount}</p>
                         <p style="margin: 4px 0; color: #475569;"><strong>Due Date:</strong> ${dueDate}</p>
                    </div>
                     <div style="text-align: center; margin-top: 32px;">
                        <a href="${config.frontendUrl}/tenant/payments" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">View & Pay</a>
                    </div>
                `
        ),
      });
      return true;
    } catch (error) {
      console.error('Error sending invoice email:', error);
      return false;
    }
  }

  async sendVisitStatusUpdate(visitorEmail, visitDetails, status) {
    const { propertyName, unitNumber, scheduledDate } = visitDetails;
    const dateStr = new Date(scheduledDate).toLocaleString();

    const subject =
      status === 'confirmed'
        ? `Visit Confirmed: ${propertyName}`
        : `Visit Update: ${propertyName} - ${status.charAt(0).toUpperCase() + status.slice(1)}`;

    if (!this.transporter) {
      console.log('==================================================');
      console.log(
        `[EMAIL MOCK] Visit Status Update to Visitor: ${visitorEmail}`
      );
      console.log(`Property: ${propertyName}`);
      console.log(`New Status: ${status}`);
      console.log('==================================================');
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: visitorEmail,
        subject: subject,
        html: this._getTemplate(
          subject,
          `
                    <p>The status of your scheduled visit has been updated.</p>
                    
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                        <h3 style="margin-top: 0; color: #1e293b; font-size: 16px; margin-bottom: 12px;">Visit Details</h3>
                        <p style="margin: 4px 0; color: #475569;"><strong>Property:</strong> ${propertyName}</p>
                        ${unitNumber ? `<p style="margin: 4px 0; color: #475569;"><strong>Unit:</strong> ${unitNumber}</p>` : ''}
                        <p style="margin: 4px 0; color: #475569;"><strong>Date:</strong> ${dateStr}</p>
                        <p style="margin: 4px 0; color: #475569;"><strong>New Status:</strong> <span style="font-weight: 600; color: ${status === 'confirmed' ? '#16a34a' : '#dc2626'}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></p>
                    </div>

                    ${
                      status === 'confirmed'
                        ? `
                    <p>We look forward to seeing you! Please arrive 5 minutes early.</p>
                    `
                        : ''
                    }
                `
        ),
      });
      return true;
    } catch (error) {
      console.error('Error sending visit status email:', error);
      return false;
    }
  }

  async sendMaintenanceStatusUpdate(email, details) {
    const { title, status, propertyName, unitNumber } = details;
    const subject = `Maintenance Update: ${title} - ${status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1)}`;

    if (!this.transporter) {
      console.log('==================================================');
      console.log(`[EMAIL MOCK] Maintenance Status Update for ${email}`);
      console.log(`Request: ${title}`);
      console.log(`New Status: ${status}`);
      console.log('==================================================');
      return true;
    }

    try {
      const statusColor = status === 'completed' ? '#16a34a' : '#2563eb';
      const statusDisplay =
        status.replace('_', ' ').charAt(0).toUpperCase() +
        status.replace('_', ' ').slice(1);

      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: subject,
        html: this._getTemplate(
          'Maintenance Request Update',
          `
                    <p>The status of your maintenance request <strong>"${title}"</strong> has been updated.</p>
                    
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                        <p style="margin: 4px 0; color: #475569;"><strong>Property:</strong> ${propertyName || 'Your Property'}</p>
                        ${unitNumber ? `<p style="margin: 4px 0; color: #475569;"><strong>Unit:</strong> ${unitNumber}</p>` : ''}
                        <p style="margin: 4px 0; color: #475569;"><strong>New Status:</strong> <span style="font-weight: 600; color: ${statusColor}">${statusDisplay}</span></p>
                    </div>

                    <p>Log in to your dashboard to view full details.</p>
                    
                    <div style="text-align: center; margin-top: 32px;">
                        <a href="${config.frontendUrl}/tenant/maintenance" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">View Maintenance Request</a>
                    </div>
                `
        ),
      });
      return true;
    } catch (error) {
      console.error('Error sending maintenance status update email:', error);
      return false;
    }
  }

  async sendPaymentConfirmation(email, details) {
    const { amount, paymentMethod, referenceNumber, invoiceId } = details;
    const formattedAmount = new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
    }).format(amount);

    if (!this.transporter) {
      console.log('==================================================');
      console.log(`[EMAIL MOCK] Payment Receipt for ${email}`);
      console.log(`Amount: ${formattedAmount}`);
      console.log(`Method: ${paymentMethod}`);
      console.log(`Invoice: #${invoiceId}`);
      console.log('==================================================');
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Payment Receipt: Invoice #${invoiceId}`,
        html: this._getTemplate(
          'Payment Successful',
          `
                    <p>Thank you! Your payment has been successfully verified.</p>
                    
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                        <p style="margin: 4px 0; color: #475569;"><strong>Invoice ID:</strong> #${invoiceId}</p>
                        <p style="margin: 4px 0; color: #475569;"><strong>Amount Paid:</strong> ${formattedAmount}</p>
                        <p style="margin: 4px 0; color: #475569;"><strong>Payment Method:</strong> ${paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}</p>
                        ${referenceNumber ? `<p style="margin: 4px 0; color: #475569;"><strong>Reference:</strong> ${referenceNumber}</p>` : ''}
                    </div>

                    <p>You can download your official receipt from the tenant portal.</p>
                    
                    <div style="text-align: center; margin-top: 32px;">
                        <a href="${config.frontendUrl}/tenant/payments" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Go to Payments</a>
                    </div>
                `
        ),
      });
      return true;
    } catch (error) {
      console.error('Error sending payment confirmation email:', error);
      return false;
    }
  }

  async sendPaymentRejection(email, details) {
    const { amount, invoiceId, reason } = details;
    const formattedAmount = new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
    }).format(amount);

    if (!this.transporter) {
      console.log('==================================================');
      console.log(`[EMAIL MOCK] Payment Rejected for ${email}`);
      console.log(`Invoice: #${invoiceId}`);
      console.log(`Amount: ${formattedAmount}`);
      console.log('==================================================');
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `ACTION REQUIRED: Payment Rejected for Invoice #${invoiceId}`,
        html: this._getTemplate(
          'Payment Verification Failed',
          `
                    <p style="color: #dc2626; font-weight: 600;">Your recent payment submission for Invoice #${invoiceId} could not be verified.</p>
                    
                    <div style="background-color: #fff1f2; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #fecaca;">
                        <p style="margin: 4px 0; color: #991b1b;"><strong>Amount:</strong> ${formattedAmount}</p>
                        ${reason ? `<p style="margin: 12px 0 0 0; color: #991b1b;"><strong>Reason for Rejection:</strong> ${reason}</p>` : '<p style="margin: 12px 0 0 0; color: #991b1b;">The evidence provided was insufficient or incorrect.</p>'}
                    </div>

                    <p>Please log in to your portal and re-submit your proof of payment to avoid any potential late fees.</p>
                    
                    <div style="text-align: center; margin-top: 32px;">
                         <a href="${config.frontendUrl}/tenant/payments" style="background-color: #dc2626; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Resubmit Payment Evidence</a>
                    </div>
                `
        ),
      });
      return true;
    } catch (error) {
      console.error('Error sending payment rejection email:', error);
      return false;
    }
  }

  async sendLeaseExpiryReminder(email, details) {
    const { daysCount, endDate, propertyName, unitNumber, role } = details;
    const subject =
      role === 'tenant'
        ? `Your Lease is Expiring in ${daysCount} Days`
        : `Urgent: Lease for Unit ${unitNumber} Expiring in ${daysCount} Days`;

    if (!this.transporter) {
      logger.info('==================================================');
      logger.info(
        `[EMAIL MOCK] Lease Expiry (${daysCount} days) to ${email} (${role})`
      );
      logger.info(`Property: ${propertyName}, Unit: ${unitNumber}`);
      logger.info(`End Date: ${endDate}`);
      logger.info('==================================================');
      return true;
    }

    try {
      const title =
        role === 'tenant'
          ? 'Lease Expiration Notice'
          : 'Unit Lease Expiry Notice';
      const intro =
        role === 'tenant'
          ? `We are writing to remind you that your lease for <strong>${propertyName} (Unit ${unitNumber})</strong> is scheduled to end on <strong>${endDate}</strong> (${daysCount} days from now).`
          : `This is an automated reminder that the lease for <strong>${propertyName} (Unit ${unitNumber})</strong> will expire on <strong>${endDate}</strong> (${daysCount} days from now).`;

      const actionText =
        role === 'tenant'
          ? 'If you wish to renew your lease or discuss your options, please contact your property manager as soon as possible.'
          : 'Please review this lease and initiate renewal discussions or prepare for the turnover process.';

      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: subject,
        html: this._getTemplate(
          title,
          `
                    <p>${intro}</p>
                    
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                        <p style="margin: 4px 0; color: #475569;"><strong>Lease End Date:</strong> ${endDate}</p>
                        <p style="margin: 4px 0; color: #475569;"><strong>Days Remaining:</strong> ${daysCount} days</p>
                    </div>

                    <p>${actionText}</p>
                    
                    <div style="text-align: center; margin-top: 32px;">
                        <a href="${config.frontendUrl}/${role === 'tenant' ? 'tenant' : 'owner'}/dashboard" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Go to Dashboard</a>
                    </div>
                `
        ),
      });
      return true;
    } catch (error) {
      console.error('Error sending lease expiry reminder email:', error);
      return false;
    }
  }

  async sendRentReminder(email, details) {
    const { amount, dueDate, daysLeft } = details;
    const formattedAmount = new Intl.NumberFormat('en-LK', {
      style: 'currency',
      currency: 'LKR',
    }).format(amount);

    if (!this.transporter) {
      console.log('==================================================');
      console.log(`[EMAIL MOCK] Rent Reminder to ${email}`);
      console.log(`Amount: ${formattedAmount}`);
      console.log(`Due Date: ${dueDate} (${daysLeft} days left)`);
      console.log('==================================================');
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Upcoming Rent Payment: Due in ${daysLeft} Days`,
        html: this._getTemplate(
          'Rent Reminder',
          `
                    <p>This is a friendly reminder that your upcoming rent payment is due in <strong>${daysLeft} days</strong>.</p>
                    
                    <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                        <p style="margin: 4px 0; color: #475569;"><strong>Amount Due:</strong> ${formattedAmount}</p>
                        <p style="margin: 4px 0; color: #475569;"><strong>Due Date:</strong> ${dueDate}</p>
                    </div>

                    <p>You can pay your rent directly through the tenant portal using your preferred payment method.</p>
                    
                    <div style="text-align: center; margin-top: 32px;">
                        <a href="${config.frontendUrl}/tenant/payments" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Pay Now</a>
                    </div>
                `
        ),
      });
      return true;
    } catch (error) {
      console.error('Error sending rent reminder email:', error);
      return false;
    }
  }

  async sendVisitScheduledToVisitor(visitorEmail, visitDetails) {
    const { visitorName, propertyName, unitNumber, scheduledDate, visitId } =
      visitDetails;

    const dateStr = new Date(scheduledDate).toLocaleString();
    const cancelLink = `${config.frontendUrl}/cancel-visit?id=${visitId}`;

    if (!this.transporter) {
      console.log('==================================================');
      console.log(
        `[EMAIL MOCK] Visit Scheduled Confirmation to Visitor: ${visitorEmail}`
      );
      console.log(
        `Property/Unit: ${propertyName}${unitNumber ? ' (Unit ' + unitNumber + ')' : ''}`
      );
      console.log(`Date: ${dateStr}`);
      console.log(`Cancellation Link: ${cancelLink}`);
      console.log('==================================================');
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: visitorEmail,
        subject: `Visit Scheduled: ${propertyName}`,
        html: this._getTemplate(
          'Visit Scheduled Successfully',
          `
                <p>Hi ${visitorName},</p>
                <p>Your visit to <strong>${propertyName}</strong> ${unitNumber ? '(Unit ' + unitNumber + ')' : ''} has been scheduled.</p>
                
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                    <p style="margin: 4px 0; color: #475569;"><strong>Scheduled For:</strong> ${dateStr}</p>
                    <p style="margin: 4px 0; color: #475569;"><strong>Status:</strong> <span style="color: #2563eb; font-weight: 600;">Pending Confirmation</span></p>
                </div>

                <p>If your plans change and you need to cancel this visit, please click the button below:</p>
                
                <div style="text-align: center; margin: 32px 0;">
                    <a href="${cancelLink}" style="background-color: #ef4444; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Cancel Visit</a>
                </div>

                <p style="color: #64748b; font-size: 14px;">Please note: We will contact you if there are any changes to this schedule.</p>
                `
        ),
      });
      return true;
    } catch (e) {
      console.error('Error sending visit confirmation to visitor:', e);
      return false;
    }
  }

  async sendVisitReminder(visitorEmail, visitDetails) {
    const { visitorName, propertyName, unitNumber, scheduledDate } =
      visitDetails;
    const dateStr = new Date(scheduledDate).toLocaleString();

    if (!this.transporter) {
      console.log('==================================================');
      console.log(`[EMAIL MOCK] Visit Reminder to: ${visitorEmail}`);
      console.log(
        `Property/Unit: ${propertyName}${unitNumber ? ' (Unit ' + unitNumber + ')' : ''}`
      );
      console.log(`Date: ${dateStr}`);
      console.log('==================================================');
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: visitorEmail,
        subject: `Reminder: Visit Tomorrow - ${propertyName}`,
        html: this._getTemplate(
          'Visit Reminder',
          `
                <p>Hi ${visitorName},</p>
                <p>This is a friendly reminder that your visit to <strong>${propertyName}</strong> ${unitNumber ? '(Unit ' + unitNumber + ')' : ''} is scheduled for tomorrow.</p>
                
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 24px 0; border: 1px solid #e2e8f0;">
                    <p style="margin: 4px 0; color: #475569;"><strong>Scheduled For:</strong> ${dateStr}</p>
                    ${unitNumber ? `<p style="margin: 4px 0; color: #475569;"><strong>Unit:</strong> ${unitNumber}</p>` : ''}
                </div>

                <p>Please arrive 5 minutes early. If your plans have changed, please contact us to cancel or reschedule.</p>
                `
        ),
      });
      return true;
    } catch (e) {
      console.error('Error sending visit reminder:', e);
      return false;
    }
  }

  async sendRenewalApproval(email, propertyName, newLeaseId) {
    if (!this.transporter) {
      console.log('==================================================');
      console.log(`[EMAIL MOCK] Renewal Approved: ${email}`);
      console.log(`Property: ${propertyName}`);
      console.log(`New Draft Lease ID: ${newLeaseId}`);
      console.log('==================================================');
      return true;
    }
    try {
      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Lease Renewal Approved - ${propertyName}`,
        html: this._getTemplate(
          'Renewal Approved',
          `
          <p>Great news! Your lease renewal request for <strong>${propertyName}</strong> has been approved.</p>
          <p>A new draft lease has been generated and is ready. The property owner will activate it shortly, or you can log in to your tenant portal to review the proposed terms.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${config.frontendUrl}/login" style="background-color: #2563eb; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">View Portal</a>
          </div>
          `
        ),
      });
      return true;
    } catch (e) {
      console.error('Error sending renewal approval email:', e);
      return false;
    }
  }

  async sendRenewalRejection(email, propertyName, notes) {
    if (!this.transporter) {
      console.log('==================================================');
      console.log(`[EMAIL MOCK] Renewal Rejected: ${email}`);
      console.log(`Property: ${propertyName}`);
      console.log('==================================================');
      return true;
    }
    try {
      await this.transporter.sendMail({
        from: `"Property Management System" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Lease Renewal Update - ${propertyName}`,
        html: this._getTemplate(
          'Renewal Request Declined',
          `
          <p>Your recent lease renewal request for <strong>${propertyName}</strong> was not approved at this time.</p>
          ${notes ? `<p style="padding: 12px; background-color: #f8fafc; border-left: 4px solid #ef4444; color: #475569;"><strong>Notes from management:</strong> ${notes}</p>` : ''}
          <p>Please contact the property management office for further details or to discuss next steps regarding your end-of-lease procedures.</p>
          `
        ),
      });
      return true;
    } catch (e) {
      console.error('Error sending renewal rejection email:', e);
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
