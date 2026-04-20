import crypto, { randomUUID } from 'crypto';
import leaseModel from '../models/leaseModel.js';
import unitModel from '../models/unitModel.js';
import tenantModel from '../models/tenantModel.js';
import pool from '../config/db.js';
import invoiceModel from '../models/invoiceModel.js';
import visitModel from '../models/visitModel.js';
import leadModel from '../models/leadModel.js';
import { validateLeaseDuration } from '../utils/validators.js';
import propertyModel from '../models/propertyModel.js';
import staffModel from '../models/staffModel.js';
import auditLogger from '../utils/auditLogger.js';
import emailService from '../utils/emailService.js';
import userModel from '../models/userModel.js';
import {
  getCurrentDateString,
  getLocalTime,
  today,
  parseLocalDate,
  addDays,
  formatToLocalDate,
  getDaysInMonth,
} from '../utils/dateUtils.js';
import { toCentsFromMajor, moneyMath, fromCents } from '../utils/moneyUtils.js';
import renewalService from './renewalService.js';
import AppError from '../utils/AppError.js';
import { isAtLeast, ROLES } from '../utils/roleUtils.js';

class LeaseSharedService {
  constructor(facade) {
    this.facade = facade;
  }

  // GET LEASES: Portfolio-wide lister. Implements RBAC-based visibility segments (Owner/Treasurer/Tenant).
  async getLeases(user) {
    // 1. [SECURITY] Scope Filtering: Return data based on user type
    if (user.role === ROLES.SYSTEM) return await leaseModel.findAll({});
    if (user.role === ROLES.OWNER) return await leaseModel.findAll(user.id);
    if (user.role === ROLES.TREASURER)
      return await leaseModel.findAll(null, user.id);
    if (user.role === ROLES.TENANT)
      return await leaseModel.findByTenantId(user.id);

    throw new AppError('Access denied', 403);
  }

  // GET LEASE BY ID: Detailed resolver with multi-tier access control logic.
  async getLeaseById(id, user) {
    // 1. Resolve identity
    const lease = await leaseModel.findById(id);
    if (!lease) throw new AppError('Lease not found', 404);

    // 2. [SECURITY] Grant Access if user is System
    if (user.role === ROLES.SYSTEM) return lease;

    // 3. [SECURITY] Grant Access if user is Owner (Verify property ownership)
    if (user.role === ROLES.OWNER) {
      const property = await propertyModel.findById(lease.propertyId);
      if (property && String(property.ownerId) === String(user.id))
        return lease;
    }

    // 4. [SECURITY] Grant Access if user is Treasurer (Verify property assignment)
    if (user.role === ROLES.TREASURER) {
      const assigned = await staffModel.getAssignedProperties(user.id);
      if (
        assigned.some((p) => String(p.property_id) === String(lease.propertyId))
      )
        return lease;
    }

    // 5. [SECURITY] Grant Access if user is Tenant (Verify identity match)
    if (
      user.role === ROLES.TENANT &&
      String(lease.tenantId) === String(user.id)
    )
      return lease;

    throw new AppError('Access denied', 403);
  }

  // SYNC UNIT STATUS: State reconciliation engine. Derives unit availability from leases and maintenance.
  async _syncUnitStatus(unitId, connection) {
    const dbConn = connection || pool;

    // 1. [CONCURRENCY] Physical Occupancy: Check for active leases covering TODAY
    const [activeLeases] = await dbConn.query(
      `SELECT COUNT(*) as count FROM leases 
         WHERE unit_id = ? AND status = 'active'
         AND start_date <= CURRENT_DATE() 
         AND (end_date IS NULL OR end_date >= CURRENT_DATE())`,
      [unitId]
    );
    if (activeLeases[0].count > 0) {
      await unitModel.update(unitId, { status: 'occupied' }, dbConn);
      return 'occupied';
    }

    // 2. [CONCURRENCY] Future Commitments: Check for reservations or future starts
    const [futureLeases] = await dbConn.query(
      `SELECT COUNT(*) as count FROM leases 
         WHERE unit_id = ? AND status IN ('active', 'pending', 'draft')
         AND (start_date > CURRENT_DATE() OR (status = 'draft' AND (reservation_expires_at IS NULL OR reservation_expires_at >= CURRENT_DATE())))`,
      [unitId]
    );
    if (futureLeases[0].count > 0) {
      await unitModel.update(unitId, { status: 'reserved' }, dbConn);
      return 'reserved';
    }

    // 3. Maintenance Logic: Check for open work orders blocking availability
    const [maintenance] = await dbConn.query(
      "SELECT COUNT(*) as count FROM maintenance_requests WHERE unit_id = ? AND status NOT IN ('completed', 'closed')",
      [unitId]
    );
    if (maintenance[0].count > 0) {
      await unitModel.update(unitId, { status: 'maintenance' }, dbConn);
      return 'maintenance';
    }

    // 4. Default: Release unit back to inventory
    await unitModel.update(unitId, { status: 'available' }, dbConn);
    return 'available';
  }

  // UPDATE LEASE DOCUMENT: Replaces or attaches the legal contract file.
  async updateLeaseDocument(id, documentUrl, user = null) {
    if (!documentUrl) throw new AppError('documentUrl is required', 400);

    // 1. Identify and update asset URL
    const lease = await leaseModel.findById(id);
    if (!lease) throw new AppError('Lease not found', 404);
    await leaseModel.update(id, { documentUrl: documentUrl });

    // 2. [AUDIT] Log the legal document modification
    await auditLogger.log({
      userId: user?.id || user?.user_id || null,
      actionType: 'LEASE_DOCUMENT_UPDATED',
      entityId: id,
      entityType: 'lease',
      details: { documentUrl },
    });

    return true;
  }

  // REGENERATE MAGIC LINK: Issues a new secure payment token for initial deposits.
  async regenerateMagicLink(leaseId, user) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // 1. [SECURITY] Pre-condition Check: Only allowed for draft leases
      const lease = await leaseModel.findById(leaseId, conn);
      if (!lease || lease.status !== 'draft')
        throw new AppError('Invalid lease or state for magic link.', 400);

      // 2. Identify the unpaid deposit invoice
      const [invoices] = await conn.query(
        "SELECT * FROM rent_invoices WHERE lease_id = ? AND invoice_type = 'deposit' AND status = 'pending'",
        [leaseId]
      );
      if (invoices.length === 0)
        throw new AppError('No pending deposit invoice found.', 404);

      const invoice = invoices[0];

      // 3. [SECURITY] Token Generation: Create a unique hash and sliding expiry
      const rawToken = randomUUID();
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');
      const expiresAt = formatToLocalDate(addDays(today(), 2));

      await conn.query(
        'UPDATE rent_invoices SET magic_token_hash = ?, magic_token_expires_at = ? WHERE invoice_id = ?',
        [tokenHash, expiresAt, invoice.invoice_id]
      );

      // 4. [SIDE EFFECT] Notification: Dispatch email with the new secure checkout link
      const tenant = await userModel.findById(lease.tenantId);
      const unit = await unitModel.findById(lease.unitId, conn);
      const property = await propertyModel.findById(unit.propertyId, conn);

      if (tenant?.email) {
        await emailService.sendDepositMagicLink(
          tenant.email,
          tenant.name,
          property.name,
          unit.unitNumber,
          invoice.amount,
          rawToken
        );
      }

      // 5. [AUDIT] Log token rotation
      await auditLogger.log(
        {
          userId: user.id || user.user_id || null,
          actionType: 'MAGIC_LINK_REGENERATED',
          entityId: leaseId,
          entityType: 'lease',
          details: { invoiceId: invoice.invoice_id },
        },
        null,
        conn
      );

      await conn.commit();
      return true;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
}

export default LeaseSharedService;
