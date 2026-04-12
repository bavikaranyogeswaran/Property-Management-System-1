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

class LeaseSharedService {
  constructor(facade) {
    this.facade = facade;
  }

  async getLeases(user) {
    if (user.role === 'owner') return await leaseModel.findAll(user.id);
    if (user.role === 'treasurer') {
      return await leaseModel.findAll(null, user.id);
    }
    if (user.role === 'tenant') return await leaseModel.findByTenantId(user.id);
    throw new Error('Access denied');
  }

  async getLeaseById(id, user) {
    const lease = await leaseModel.findById(id);
    if (!lease) throw new Error('Lease not found');
    if (user.role === 'owner') {
      const property = await propertyModel.findById(lease.propertyId);
      if (property && String(property.ownerId) === String(user.id))
        return lease;
    }
    if (user.role === 'treasurer') {
      const assigned = await staffModel.getAssignedProperties(user.id);
      if (
        assigned.some((p) => String(p.property_id) === String(lease.propertyId))
      )
        return lease;
    }
    if (user.role === 'tenant' && String(lease.tenantId) === String(user.id))
      return lease;
    throw new Error('Access denied');
  }

  async _syncUnitStatus(unitId, connection) {
    const dbConn = connection || pool;

    // Order of precedence for Unit Status:
    // 1. Current Active Lease (Occupied)
    // 2. Open Maintenance (Maintenance)
    // 3. Future Reservation/Commitment (Reserved)
    // 4. No commitments (Available)

    // 1. Physical Occupancy: Check if any active lease exists TODAY
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

    // 2. Future Commitments: Reservations or future start dates
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

    // 3. Maintenance Logic: If unit is already in maintenance, keep it there unless manually released
    // But we generally WANT to know if it's available.
    // If we're calling sync, it usually means something ended (lease or maintenance).
    // If we are calling it from Maintenance completion, openCount will be 0.

    const [maintenance] = await dbConn.query(
      "SELECT COUNT(*) as count FROM maintenance_requests WHERE unit_id = ? AND status NOT IN ('completed', 'closed')",
      [unitId]
    );
    if (maintenance[0].count > 0) {
      await unitModel.update(unitId, { status: 'maintenance' }, dbConn);
      return 'maintenance';
    }

    // 4. Default Release
    await unitModel.update(unitId, { status: 'available' }, dbConn);
    return 'available';
  }

  async updateLeaseDocument(id, documentUrl, user = null) {
    const lease = await leaseModel.findById(id);
    if (!lease) throw new Error('Lease not found');

    await leaseModel.update(id, { documentUrl: documentUrl });

    await auditLogger.log({
      userId: user?.id || user?.user_id || null,
      actionType: 'LEASE_DOCUMENT_UPDATED',
      entityId: id,
      entityType: 'lease',
      details: { documentUrl },
    });

    return true;
  }

  async regenerateMagicLink(leaseId, user) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const lease = await leaseModel.findById(leaseId, conn);
      if (!lease) throw new Error('Lease not found');
      if (lease.status !== 'draft')
        throw new Error(
          'Magic links can only be regenerated for draft leases.'
        );

      // Find the deposit invoice
      const [invoices] = await conn.query(
        "SELECT * FROM rent_invoices WHERE lease_id = ? AND invoice_type = 'deposit' AND status = 'pending'",
        [leaseId]
      );

      if (invoices.length === 0)
        throw new Error('No pending deposit invoice found for this lease.');

      const invoice = invoices[0];
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

      // Notify via email - Reusing emailService

      const tenant = await userModel.findById(lease.tenantId);
      const unit = await unitModel.findById(lease.unitId, conn);
      const property = await propertyModel.findById(unit.propertyId, conn);

      if (tenant && tenant.email) {
        await emailService.sendDepositMagicLink(
          tenant.email,
          tenant.name,
          property.name,
          unit.unitNumber,
          invoice.amount,
          rawToken
        );
      }

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
